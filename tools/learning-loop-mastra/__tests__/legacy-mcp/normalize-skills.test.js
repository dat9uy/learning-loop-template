/**
 * normalize-skills test (Phase 1 of plans/260720-1825-skills-manifest-self-healing-normalize-step-npx-clobber-recovery).
 *
 * Encodes the empirical npx clobber shape (locked in plans/reports/probe-260720-npx-skills-clobber-shape.md)
 * as TDD red tests for `tools/scripts/normalize-skills.mjs`. The script does not exist yet;
 * the tests below are RED because the script is missing. Phase 2 implements the script + makes
 * the tests GREEN; the missing-script error is the expected red state at end of Phase 1.
 *
 * Fixture discipline (review C1/C2): every normalizer run targets a tmp root via the script's
 * positional root argument (argv[2]). No write ever touches the live `skills-lock.json`.
 *
 * Clobber shape under test (per probe report):
 *   pre  mastra entry: { source, sourceType:"npx-skills-cli", delivery, skillPath, targets, maturity, external:true, hash }
 *   post mastra entry: { source:"mastra-ai/skills", sourceType:"github", skillPath, computedHash }
 *   - internal entries (learning-loop, coordination-gate) and version: PRESERVED byte-identical
 *   - computedHash is opaque (NOT sha256(SKILL.md)) — hash must be re-derived from detected surface
 */

import { test } from "vitest";
import assert from "node:assert";
import { readFileSync, existsSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const MCP_ROOT = new URL("../../../../", import.meta.url).pathname;
const NORMALIZE_SCRIPT = join(MCP_ROOT, "tools/scripts/normalize-skills.mjs");
const SURFACES = [".claude", ".factory", ".mastracode"];

function sha256hex(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function readManifest(root) {
  return JSON.parse(readFileSync(join(root, "skills-lock.json"), "utf8"));
}

function runNormalize(root) {
  try {
    const out = execFileSync("node", [NORMALIZE_SCRIPT, root], { encoding: "utf8" });
    return { code: 0, out, err: "" };
  } catch (err) {
    return {
      code: err.status ?? 1,
      out: err.stdout?.toString?.() ?? "",
      err: err.stderr?.toString?.() ?? "",
    };
  }
}

// Internal-skill canonical content for fixture's manifest.entries. Bytes pinned so
// internal-preservation test compares against the same hash the manifest carries.
const INTERNAL_SKILLS = {
  "learning-loop": { content: `# learning-loop\nmaturity: state-1\n` },
  "coordination-gate": { content: `# coordination-gate\nmaturity: state-1\n` },
};

// Build a fixture with a clobbered manifest + mastra tree on each surface. The
// `detectedSurfaces` set carries the post-npx `newMastraContent`; the others carry
// `staleContent` (the pre-npx bytes). Matches the empirical probe shape.
function buildClobberedFixture({
  // Realistic npx shape: 2 surfaces detected, 1 stale. .claude + .factory
  // are the runtimes npx auto-detects in the parent Phase 3 probe; .mastracode
  // stays undetected. cluster heuristic must pick the 2-member new-content
  // cluster over a 1-member stale singleton.
  detectedSurfaces = [".claude", ".factory"],
  newMastraContent = "# mastra\nNEW: npx-installed content for detection\n",
  staleContent = "# mastra\nSTALE: pre-clobber content\n",
  includeUnknownExternal = null,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "ll-normalize-"));
  // Write non-detected surfaces first.
  for (const surface of SURFACES.filter((s) => !detectedSurfaces.includes(s))) {
    const dir = join(root, surface, "skills", "mastra");
    mkdirSync(join(dir, "references"), { recursive: true });
    mkdirSync(join(dir, "scripts"), { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), staleContent);
    writeFileSync(join(dir, "references", "remote-docs.md"), `# ref (${surface}-stale)\n`);
    writeFileSync(join(dir, "scripts", "provider-registry.mjs"), `// script (${surface})\n`);
  }
  // Then detected surfaces (later mtime = highest, matches reality).
  for (const surface of detectedSurfaces) {
    const dir = join(root, surface, "skills", "mastra");
    mkdirSync(join(dir, "references"), { recursive: true });
    mkdirSync(join(dir, "scripts"), { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), newMastraContent);
    writeFileSync(join(dir, "references", "remote-docs.md"), `# ref (${surface}-detected)\n`);
    writeFileSync(join(dir, "scripts", "provider-registry.mjs"), `// script (${surface})\n`);
  }
  // Internal-skill canonical sources (so the manifest's internal entries are coherent
  // for the hash matches and the manifest is loadable by sync-skills if the test
  // ever decides to invoke it).
  for (const [name, { content }] of Object.entries(INTERNAL_SKILLS)) {
    const canonicalDir = join(root, "tools/learning-loop-mastra/skills", name);
    mkdirSync(canonicalDir, { recursive: true });
    writeFileSync(join(canonicalDir, "SKILL.md"), content);
  }
  const skills = {};
  for (const [name, { content }] of Object.entries(INTERNAL_SKILLS)) {
    skills[name] = {
      source: "local",
      sourceType: "local",
      delivery: "fanout",
      canonicalSource: `tools/learning-loop-mastra/skills/${name}/SKILL.md`,
      targets: SURFACES,
      maturity: "state-1",
      external: false,
      hash: sha256hex(content),
    };
  }
  // Clobbered mastra entry — the empirical post-npx shape (drops the 5 loop-owned fields,
  // changes sourceType to npx-native, adds opaque computedHash).
  skills.mastra = {
    source: "mastra-ai/skills",
    sourceType: "github",
    skillPath: "skills/mastra/SKILL.md",
    computedHash: "f0ca76d36d67a345064f471a9577e752beb2b20ab46acdf154ed223905e1d3a4",
  };
  // Optional unknown-external entry to test the surgical-replace skip path.
  if (includeUnknownExternal) {
    skills[includeUnknownExternal.name] = includeUnknownExternal.entry;
  }
  const manifest = { version: 2, skills };
  writeFileSync(join(root, "skills-lock.json"), JSON.stringify(manifest, null, 2));
  return { root, newMastraContent, staleContent, detectedSurfaces, manifest };
}

// ---------------------------------------------------------------------------
// Existence + acceptance-driven TDD red tests. Each test expects Phase 2 to
// implement normalize-skills.mjs + the shared skills-lib.mjs. At end of Phase 1,
// `node tools/scripts/normalize-skills.mjs` does not exist, so every test below
// fails on a missing-script error (the expected red state for TDD-before).
// ---------------------------------------------------------------------------

test("normalize-skills script exists", () => {
  assert.ok(existsSync(NORMALIZE_SCRIPT), `${NORMALIZE_SCRIPT} must exist (Phase 2 creates it)`);
});

test("clobber→normalize: restores the v2 extended schema for mastra (external/delivery/targets/maturity/sourceType/hash)", () => {
  const { root, newMastraContent } = buildClobberedFixture();
  try {
    const expectedHash = sha256hex(newMastraContent);
    const r = runNormalize(root);
    assert.strictEqual(r.code, 0, `normalize must exit 0: ${r.err}\n${r.out}`);
    const post = readManifest(root);
    const m = post.skills.mastra;
    assert.ok(m, "mastra entry must remain in skills");
    assert.strictEqual(m.external, true, "external must be restored to true");
    assert.strictEqual(m.delivery, "npx-per-runtime+fanout-undetected", "delivery must be restored");
    assert.deepStrictEqual(m.targets, [".claude", ".factory", ".mastracode"], "targets must be restored");
    assert.strictEqual(m.maturity, null, "maturity must be restored");
    assert.strictEqual(m.source, "mastra-ai/skills", "source must be preserved");
    assert.strictEqual(m.sourceType, "npx-skills-cli", "sourceType must be restored to loop's canonical");
    assert.strictEqual(m.hash, expectedHash, `hash must be sha256 of the detected SKILL.md content (got ${m.hash})`);
    assert.ok(typeof m.hash === "string" && m.hash.length === 64, "hash must be a sha256 hex (64 chars)");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("idempotence: normalize on an already-normalized manifest is a no-op (changed:false, no mtime bump)", () => {
  const { root } = buildClobberedFixture();
  try {
    const r1 = runNormalize(root);
    assert.strictEqual(r1.code, 0, `first run must exit 0: ${r1.err}`);
    const manifestPath = join(root, "skills-lock.json");
    const mtimeAfter1 = statSync(manifestPath).mtimeMs;
    // Second run on the now-normalized manifest must be a no-op.
    const r2 = runNormalize(root);
    assert.strictEqual(r2.code, 0, `idempotent re-run must exit 0: ${r2.err}`);
    assert.strictEqual(
      statSync(manifestPath).mtimeMs,
      mtimeAfter1,
      "already-normalized manifest must not be rewritten (no mtime bump)",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("hash derivation: 2 detected surfaces + 1 stale → hash matches the detected cluster (Q1 scan+derive)", () => {
  // Realistic npx install: writes to .claude + .factory, leaves .mastracode stale.
  const newContent = "# mastra\nNEW cluster content\n";
  const staleContent = "# mastra\nSTALE: .mastracode is the undetected surface\n";
  const { root } = buildClobberedFixture({
    detectedSurfaces: [".claude", ".factory"],
    newMastraContent: newContent,
    staleContent,
  });
  try {
    const expectedHash = sha256hex(newContent);
    const r = runNormalize(root);
    assert.strictEqual(r.code, 0, `normalize must exit 0: ${r.err}`);
    const post = readManifest(root);
    assert.strictEqual(
      post.skills.mastra.hash,
      expectedHash,
      `2-detected-cluster hash must match sha256(new SKILL.md): got ${post.skills.mastra.hash}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("hash derivation: only 1 detected surface (the others stale) → hash matches that single SKILL.md", () => {
  const newContent = "# mastra\nONLY .claude is detected\n";
  const { root } = buildClobberedFixture({
    detectedSurfaces: [".claude"],
    newMastraContent: newContent,
  });
  try {
    const expectedHash = sha256hex(newContent);
    const r = runNormalize(root);
    assert.strictEqual(r.code, 0, `normalize must exit 0: ${r.err}`);
    const post = readManifest(root);
    assert.strictEqual(
      post.skills.mastra.hash,
      expectedHash,
      `single-detected hash must match sha256(SKILL.md): got ${post.skills.mastra.hash}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("internal entries preserved byte-identical (coordination-gate + learning-loop untouched)", () => {
  const { root, manifest } = buildClobberedFixture();
  try {
    const before = manifest.skills["coordination-gate"];
    const beforeLoop = manifest.skills["learning-loop"];
    const r = runNormalize(root);
    assert.strictEqual(r.code, 0, `normalize must exit 0: ${r.err}`);
    const post = readManifest(root);
    assert.deepStrictEqual(
      post.skills["coordination-gate"],
      before,
      "coordination-gate entry must be byte-identical pre vs. post normalize",
    );
    assert.deepStrictEqual(
      post.skills["learning-loop"],
      beforeLoop,
      "learning-loop entry must be byte-identical pre vs. post normalize",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("version: preserved/restored — manifest.version === 2 after normalize", () => {
  const { root } = buildClobberedFixture();
  try {
    const r = runNormalize(root);
    assert.strictEqual(r.code, 0, `normalize must exit 0: ${r.err}`);
    const post = readManifest(root);
    assert.strictEqual(post.version, 2, "manifest.version must remain 2");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unknown external entry: not in policy table → left untouched (surgical replace)", () => {
  const unknownEntry = {
    source: "some-org/other-skill",
    sourceType: "github",
    skillPath: "skills/other-skill/SKILL.md",
    computedHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd00",
  };
  const { root } = buildClobberedFixture({ includeUnknownExternal: { name: "other-external", entry: unknownEntry } });
  try {
    const r = runNormalize(root);
    assert.strictEqual(r.code, 0, `normalize must exit 0: ${r.err}`);
    const post = readManifest(root);
    assert.deepStrictEqual(
      post.skills["other-external"],
      unknownEntry,
      "unknown external entry (not in EXTERNAL_POLICY) must be left as-is",
    );
    // mastra is still healed, even when an unknown external exists.
    assert.strictEqual(post.skills.mastra.external, true, "mastra must still be restored");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("F10/F6 regression shape: post-normalize, mastra carries external:true and a 64-char hash matching the detected surface", () => {
  // All 3 surfaces detected (post-npx + post-`pnpm skills:sync` fan-out state)
  // so F6 cross-surface holds. The npx-only state (no fan-out yet) would
  // leave 1 surface stale; that's covered by skills-mirror-parity.test.js
  // F12 (the live-running test that triggers after `pnpm skills:sync`).
  const content = "# mastra\nF10/F6 regression content\n";
  const { root } = buildClobberedFixture({
    detectedSurfaces: [".claude", ".factory", ".mastracode"],
    newMastraContent: content,
  });
  try {
    const r = runNormalize(root);
    assert.strictEqual(r.code, 0, `normalize must exit 0: ${r.err}`);
    const post = readManifest(root);
    const m = post.skills.mastra;
    assert.strictEqual(m.external, true, "F10: manifest.skills.mastra.external === true");
    assert.strictEqual(typeof m.hash, "string", "F6: hash is a string");
    assert.strictEqual(m.hash.length, 64, "F6: hash is a 64-char sha256 hex");
    const expected = sha256hex(content);
    assert.strictEqual(m.hash, expected, "F6: hash must match sha256 of the (single-content) detected surface");
    // F6 cross-surface: with all 3 surfaces byte-identical, every surface's
    // SKILL.md sha256 must equal the manifest hash.
    for (const surface of SURFACES) {
      const p = join(root, surface, "skills", "mastra", "SKILL.md");
      assert.ok(existsSync(p), `${surface}: SKILL.md must exist for F6 check`);
      const actual = sha256hex(readFileSync(p, "utf8"));
      assert.strictEqual(actual, expected, `F6: ${surface} SKILL.md sha256 must equal manifest.hash`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
