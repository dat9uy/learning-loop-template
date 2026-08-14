/**
 * Hooks-lock manifest shape test.
 *
 * Contract: hooks-lock.json at the repo root declares every universal hook
 * in tools/learning-loop-mastra/hooks/universal/ (excluding lib/) along with
 * its per-runtime wiring. The manifest key set MUST track the universal
 * directory so a new universal hook added without a manifest entry is
 * caught (the drift the manifest closes for "a new universal hook never
 * adopted").
 *
 * Sibling of skills-lock.json (skills manifest); consumes the retained
 * mirror surfaces from core/surfaces.js.
 */

import { test } from "vitest";
import assert from "node:assert";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = new URL("../../../../", import.meta.url).pathname;
const MANIFEST_PATH = join(REPO_ROOT, "hooks-lock.json");
const UNIVERSAL_DIR = "tools/learning-loop-mastra/hooks/universal";

// Imported dynamically so the test fails-fast only on the actual cross-surface
// state at runtime (the import resolves `core/surfaces.js` only when needed).
// Uses URL form (relative to import.meta.url) — bare relative paths do not
// resolve against the importing file under vitest dynamic import().
async function loadSurfaces() {
  const url = new URL("../../core/surfaces.js", import.meta.url);
  const mod = await import(url.href);
  return mod.SURFACES;
}

/** Kebab-case basename without extension, e.g. "bash-gate" from "bash-gate.js". */
function kebabKey(basename) {
  return basename.replace(/\.(cjs|js)$/, "");
}

function listUniversalHookFilenames() {
  const dir = join(REPO_ROOT, UNIVERSAL_DIR);
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .filter((e) => /\.(cjs|js)$/.test(e.name))
    .map((e) => e.name)
    .sort();
}

function loadManifest() {
  assert.ok(existsSync(MANIFEST_PATH), `hooks-lock.json must exist at ${MANIFEST_PATH}`);
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    assert.fail(`hooks-lock.json must be valid JSON: ${err.message}`);
  }
  return parsed;
}

const ALLOWED_EVENTS = new Set(["PreToolUse", "UserPromptSubmit", "SessionStart", "PostToolUseFailure"]);
const ALLOWED_KINDS = new Set(["shim", "direct", "adapter", "none"]);

await test("hooks-lock.json exists at repo root and parses as JSON", () => {
  const manifest = loadManifest();
  assert.ok(manifest && typeof manifest === "object", "hooks-lock.json must be an object");
  assert.ok(typeof manifest.version === "number", "manifest.version must be a number");
  assert.ok(manifest.hooks && typeof manifest.hooks === "object", "manifest.hooks must be an object");
});

await test("every universal hook in tools/learning-loop-mastra/hooks/universal/ has a manifest entry", () => {
  // The inverse check (manifest entry has no corresponding universal file) is
  // implied by the path-exists assertion below; here we lock the universal-dir
  // → manifest contract on each direction.
  const manifest = loadManifest();
  const universalKeys = listUniversalHookFilenames().map(kebabKey);
  const manifestKeys = Object.keys(manifest.hooks);

  assert.deepStrictEqual(
    manifestKeys.sort(),
    universalKeys,
    `manifest keys must equal universal hook basenames (kebab without extension): manifest=${JSON.stringify(manifestKeys)} universal=${JSON.stringify(universalKeys)}`,
  );
});

for (const filename of listUniversalHookFilenames()) {
  const key = kebabKey(filename);

  await test(`${key}: entry shape, wiring covers all SURFACES, every path exists`, async () => {
    const manifest = loadManifest();
    const entry = manifest.hooks[key];
    assert.ok(entry, `manifest.hooks.${key} must exist`);

    assert.strictEqual(typeof entry.path, "string", `${key}.path must be a string`);
    assert.ok(
      entry.path === `tools/learning-loop-mastra/hooks/universal/${filename}`,
      `${key}.path must equal tools/learning-loop-mastra/hooks/universal/${filename}`,
    );
    assert.ok(existsSync(join(REPO_ROOT, entry.path)), `${key}.path must exist on disk`);

    assert.ok(ALLOWED_EVENTS.has(entry.event), `${key}.event must be one of ${[...ALLOWED_EVENTS].join(", ")}: got ${entry.event}`);

    assert.ok(entry.wiring && typeof entry.wiring === "object", `${key}.wiring must be an object`);

    const SURFACES = await loadSurfaces();
    const surfaceSet = new Set(SURFACES);
    for (const wiringKey of Object.keys(entry.wiring)) {
      assert.ok(
        surfaceSet.has(wiringKey),
        `${key}.wiring must not contain unknown surface keys: "${wiringKey}" is not in SURFACES (a typo would silently pass the shims-in-sync parity filter)`,
      );
    }
    for (const surface of SURFACES) {
      const wiring = entry.wiring[surface];
      assert.ok(wiring, `${key}.wiring.${surface} must be defined (every surface is enumerated in the manifest)`);
      assert.ok(ALLOWED_KINDS.has(wiring.kind), `${key}.wiring.${surface}.kind must be one of ${[...ALLOWED_KINDS].join(", ")}: got ${wiring.kind}`);

      if (wiring.kind !== "none") {
        assert.strictEqual(typeof wiring.ref, "string", `${key}.wiring.${surface}.ref must be a string when kind != "none"`);
        assert.ok(wiring.ref.length > 0, `${key}.wiring.${surface}.ref must be non-empty`);
      }

      if (entry.event === "PreToolUse" && wiring.kind !== "none") {
        assert.ok(
          "matcher" in wiring,
          `${key}.wiring.${surface} must carry a matcher for PreToolUse (the runtime config uses it to filter tools)`,
        );
      }
    }
  });
}
