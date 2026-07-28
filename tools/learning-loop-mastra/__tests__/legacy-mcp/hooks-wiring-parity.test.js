/**
 * Hooks wiring parity test — CI drift backstop for hooks.
 *
 * Contract: every universal hook declared in tools/learning-loop-mastra/hooks/universal/
 * is wired (or not) on every runtime surface EXACTLY as the per-runtime wiring
 * in hooks-lock.json declares. The manifest is the source of truth; this test
 * is the enforcement. It catches drift in both directions:
 *
 *   1. Declared-wired hooks (kind: shim | direct | adapter): the runtime
 *      config MUST carry a matching command under the entry's event with the
 *      declared matcher (where applicable).
 *   2. Declared-unwired hooks (kind: "none"): the runtime config MUST NOT
 *      carry any command referencing the hook's universal path or shim path.
 *
 * Runtime config shapes:
 *   - .claude   → .claude/settings.json   (hooks.<Event>[].hooks[].command, matcher nested under PreToolUse groups)
 *   - .factory  → .factory/settings.json (gates) + .factory/hooks.json (SessionStart adapter)
 *                  merged into one per-surface list
 *   - .mastracode → .mastracode/hooks.json (flat array per Event with command + matcher object)
 *
 * Env-token canonicalization (red-team F6): .claude and .factory commands
 * may use `$FACTORY_PROJECT_DIR` / `$CLAUDE_PROJECT_DIR` prefixes. The
 * helper strips these so the comparison is anchored at the surface-relative
 * path with no path-separator prefix (rejects `evil/<ref>` path-traversal).
 *
 * Shim byte-identity is NOT asserted here (delegated to the runtime-agnostic
 * `shims-in-sync` checklist item, made manifest-aware in the Phase 3 work).
 *
 * Sibling of skills-mirror-parity.test.js.
 */

import { test } from "vitest";
import assert from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = new URL("../../../../", import.meta.url).pathname;
const MANIFEST_PATH = join(REPO_ROOT, "hooks-lock.json");

async function loadSurfaces() {
  const url = new URL("../../core/surfaces.js", import.meta.url);
  const mod = await import(url.href);
  return mod.SURFACES;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadManifest() {
  return readJson(MANIFEST_PATH);
}

// ---------- env-token canonicalization (F6) ----------

/**
 * Strip env-token path prefixes that some runtimes embed in hook commands
 * before comparing against the manifest `ref`. Handles:
 *   - "$FACTORY_PROJECT_DIR" / "$CLAUDE_PROJECT_DIR" — Droid/Claude token
 *     (may be followed by a quote and/or a `/` separator, e.g.
 *      `node "$FACTORY_PROJECT_DIR"/.factory/...`)
 *   - remaining double-quote characters
 *   - leading interpreter name (`node `) so we compare path-to-path
 *   - any leftover leading-slash artifacts after env-token removal
 * Idempotent and whitespace-collapsing. Path-traversal safe: ref must match
 * the END of the normalized command with no separator prefix (F6).
 */
function normalizeCommandPath(command) {
  let s = String(command ?? "");
  s = s.replace(/\$FACTORY_PROJECT_DIR"?\/?/g, "");
  s = s.replace(/\$CLAUDE_PROJECT_DIR"?\/?/g, "");
  // Strip remaining double-quotes (may wrap nothing now).
  s = s.replace(/"/g, "");
  // Collapse whitespace.
  s = s.replace(/\s+/g, " ").trim();
  // Strip leading interpreter name.
  s = s.replace(/^node\s+/, "");
  // Strip leading path separators (artifacts of env-token replacement).
  s = s.replace(/^\/+/, "");
  return s;
}

function commandEndsWith(command, ref) {
  // Anchored end-match with a non-path-separator boundary — rejects
  // path-traversal prefixes like `evil/<ref>` where the join separator
  // (implicit slash) precedes `<ref>`.
  const norm = normalizeCommandPath(command);
  if (norm === ref) return true;
  if (norm.endsWith(ref)) {
    // The char just before <ref> must not be a path separator.
    const i = norm.length - ref.length - 1;
    if (i < 0) return true;
    return norm[i] !== "/" && norm[i] !== "\\";
  }
  return false;
}

function commandEquals(command, ref) {
  return normalizeCommandPath(command) === normalizeCommandPath(ref);
}

// ---------- runtime config loaders (3 shapes) ----------

/** Flatten a Claude Code style Settings into [{event, command, matcher}]. */
function flattenClaude(hooks) {
  const out = [];
  if (!hooks || typeof hooks !== "object") return out;
  for (const [event, groups] of Object.entries(hooks)) {
    for (const group of Array.isArray(groups) ? groups : []) {
      const matcher = typeof group.matcher === "string" ? group.matcher : undefined;
      const list = Array.isArray(group.hooks) ? group.hooks : [];
      for (const h of list) {
        if (h && h.type === "command" && typeof h.command === "string") {
          out.push({ event, command: h.command, matcher });
        }
      }
    }
  }
  return out;
}

/** Flatten a mastracode-style hooks file (flat array per event). */
function flattenMastracode(hooks) {
  const out = [];
  if (!hooks || typeof hooks !== "object") return out;
  for (const [event, entries] of Object.entries(hooks)) {
    for (const h of Array.isArray(entries) ? entries : []) {
      if (h && h.type === "command" && typeof h.command === "string") {
        out.push({ event, command: h.command, matcher: h.matcher });
      }
    }
  }
  return out;
}

function flattenFactory(settings, hooks) {
  // BOTH .factory/settings.json (gate hooks) AND .factory/hooks.json
  // (SessionStart adapter) use the Claude Code nested format:
  //   { <Event>: [ { matcher, hooks: [ {type:"command", command} ] } ] }
  // (The mastracode flat format does NOT apply to .factory.) Merge the two
  // per-surface event lists into one so the parity path sees every wire.
  return [
    ...flattenClaude(settings?.hooks ?? {}),
    ...flattenClaude(hooks ?? {}),
  ];
}

async function loadRuntimeHooks(surface) {
  const root = REPO_ROOT;
  if (surface === ".claude") {
    const cfg = readJson(join(root, ".claude/settings.json"));
    return flattenClaude(cfg.hooks);
  }
  if (surface === ".factory") {
    const settings = existsSync(join(root, ".factory/settings.json"))
      ? readJson(join(root, ".factory/settings.json"))
      : {};
    const hooks = existsSync(join(root, ".factory/hooks.json"))
      ? readJson(join(root, ".factory/hooks.json"))
      : {};
    return flattenFactory(settings, hooks);
  }
  if (surface === ".mastracode") {
    const cfg = readJson(join(root, ".mastracode/hooks.json"));
    return flattenMastracode(cfg);
  }
  throw new Error(`unknown surface: ${surface}`);
}

// ---------- matcher comparison ----------

function matchersEqual(a, b) {
  // Object form: {tool_name: "..."}
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    if (aKeys.length !== bKeys.length) return false;
    for (let i = 0; i < aKeys.length; i++) {
      if (aKeys[i] !== bKeys[i]) return false;
      if (a[aKeys[i]] !== b[bKeys[i]]) return false;
    }
    return true;
  }
  // Array form: list of strings (mastracode write-gate triple-wire)
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = [...a].map(String).sort();
    const sb = [...b].map(String).sort();
    return sa.every((v, i) => v === sb[i]);
  }
  // String form: exact match.
  return a === b;
}

// ---------- assertion logic per wiring kind ----------

function wiresArePresent({ runtimeHooks, key, surface, wiring, entry, surfaceDir }) {
  const eventEntries = runtimeHooks.filter((h) => h.event === entry.event);

  if (wiring.kind === "none") {
    // Negative: NO command under event references this hook's universal path
    // (universal basename) OR shim surface path.
    const base = entry.path.split("/").pop().replace(/\.(cjs|js)$/, "");
    const offenders = eventEntries.filter((h) => {
      const norm = normalizeCommandPath(h.command);
      const tail = norm.split("/").pop();
      return tail === `${base}.cjs` || tail === `${base}.js`;
    });
    if (offenders.length) {
      return { ok: false, found: offenders.map((h) => h.command).join("; "), fix_suggestion: `Remove the undeclared wiring for ${key} on ${surface}; the manifest declares kind:"none".` };
    }
    return { ok: true };
  }

  if (wiring.kind === "shim") {
    // A command resolving to <surface>/coordination/hooks/<shim>.cjs exists with the manifest matcher.
    const matches = eventEntries.filter((h) =>
      commandEndsWith(h.command, `${surface}/${wiring.ref.replace(surface + "/", "")}`)
      && matchersEqual(h.matcher, wiring.matcher)
    );
    if (!matches.length) {
      return { ok: false, found: `expected shim command under ${entry.event} matcher=${JSON.stringify(wiring.matcher)} on ${surface}; got ${eventEntries.length} candidates`, fix_suggestion: `Add a PreToolUse (or UserPromptSubmit / SessionStart) wiring for ${key} on ${surface} pointing at ${wiring.ref}.` };
    }
    return { ok: true };
  }

  if (wiring.kind === "direct") {
    // A command resolving to `node tools/learning-loop-mastra/hooks/universal/<file>` exists.
    const matchCmd = `node ${entry.path}`;
    if (Array.isArray(wiring.matcher)) {
      // Array-matcher cardinality: one wiring per element of the array (red-team F8).
      const expectedTools = wiring.matcher.map((m) => (m && typeof m === "object" ? m.tool_name : m));
      const presentTools = eventEntries
        .filter((h) => commandEquals(h.command, matchCmd))
        .map((h) => (h.matcher && typeof h.matcher === "object" && !Array.isArray(h.matcher) ? h.matcher.tool_name : h.matcher));
      const missing = expectedTools.filter((t) => !presentTools.includes(t));
      if (missing.length) {
        return { ok: false, found: `expected wires for tools=${JSON.stringify(expectedTools)} under ${entry.event} on ${surface}; present=${JSON.stringify(presentTools)}`, fix_suggestion: `Wire ${key} on ${surface} for the missing tools: ${missing.join(", ")}.` };
      }
      return { ok: true };
    }
    const matches = eventEntries.filter((h) => commandEquals(h.command, matchCmd) && matchersEqual(h.matcher, wiring.matcher));
    if (!matches.length) {
      return { ok: false, found: `expected direct command ${matchCmd} under ${entry.event} matcher=${JSON.stringify(wiring.matcher)} on ${surface}; got ${eventEntries.length} candidates`, fix_suggestion: `Wire ${key} on ${surface} as ${matchCmd}.` };
    }
    return { ok: true };
  }

  if (wiring.kind === "adapter") {
    // A command ending with the adapter ref exists under SessionStart (verified by event), with the declared matcher.
    const matches = eventEntries.filter((h) =>
      commandEndsWith(h.command, wiring.ref) && matchersEqual(h.matcher, wiring.matcher)
    );
    if (!matches.length) {
      return { ok: false, found: `expected adapter command ending with ${wiring.ref} under ${entry.event} matcher=${JSON.stringify(wiring.matcher)} on ${surface}`, fix_suggestion: `Wire ${key} on ${surface} via the adapter at ${wiring.ref}.` };
    }
    return { ok: true };
  }

  return { ok: false, found: `unknown wiring kind ${wiring.kind}`, fix_suggestion: "Use one of shim | direct | adapter | none." };
}

// ---------- tests ----------

async function forEachHookAcrossSurfaces(fn) {
  const manifest = loadManifest();
  const SURFACES = await loadSurfaces();
  const hooksCache = new Map();
  for (const [key, entry] of Object.entries(manifest.hooks)) {
    for (const surface of SURFACES) {
      if (!hooksCache.has(surface)) hooksCache.set(surface, await loadRuntimeHooks(surface));
      const runtimeHooks = hooksCache.get(surface);
      const wiring = entry.wiring[surface];
      if (!wiring) continue;
      await fn(key, entry, surface, wiring, runtimeHooks);
    }
  }
}

await test("loadRuntimeHooks resolves all 3 runtime config shapes (shape test)", async () => {
  const SURFACES = await loadSurfaces();
  for (const surface of SURFACES) {
    const hooks = await loadRuntimeHooks(surface);
    assert.ok(Array.isArray(hooks), `${surface}: loadRuntimeHooks must return an array`);
    assert.ok(hooks.length > 0, `${surface}: must have at least one wired hook`);
    for (const h of hooks) {
      assert.strictEqual(typeof h.event, "string", `${surface}: every entry must have event`);
      assert.strictEqual(typeof h.command, "string", `${surface}: every entry must have command`);
    }
  }

  // .factory specifically must merge its two config files into one list —
  // the SessionStart adapter lives in hooks.json, not settings.json.
  const factoryHooks = await loadRuntimeHooks(".factory");
  const adapterEntry = factoryHooks.find((h) => h.command.includes("loop-surface-inject"));
  assert.ok(adapterEntry, ".factory: SessionStart adapter wiring must be visible (two-file merge)");
  assert.strictEqual(adapterEntry.event, "SessionStart");
  assert.strictEqual(adapterEntry.matcher, "startup");
});

await test("env-token canonicalization: $FACTORY_PROJECT_DIR / $CLAUDE_PROJECT_DIR stripped before comparison", () => {
  // Red-team F6: prefixed env tokens in command strings MUST be stripped
  // before comparing against the (env-token-free) manifest ref.
  assert.strictEqual(
    normalizeCommandPath('node "$FACTORY_PROJECT_DIR"/.factory/coordination/hooks/bash-coordination-gate.cjs'),
    ".factory/coordination/hooks/bash-coordination-gate.cjs",
  );
  assert.strictEqual(
    normalizeCommandPath('node "$CLAUDE_PROJECT_DIR"/.claude/coordination/hooks/bash-coordination-gate.cjs'),
    ".claude/coordination/hooks/bash-coordination-gate.cjs",
  );
  assert.strictEqual(
    normalizeCommandPath('node .claude/coordination/hooks/bash-coordination-gate.cjs'),
    ".claude/coordination/hooks/bash-coordination-gate.cjs",
  );
  // Anchor guard rejects path-traversal prefixes.
  assert.ok(
    !commandEndsWith('node tools/learning-loop-mastra/hooks/universal/bash-gate.js', ".claude/coordination/hooks/bash-coordination-gate.cjs"),
    "wrong-surface ref must not match",
  );
});

await test("every canonical hook path exists on disk", () => {
  const manifest = loadManifest();
  for (const [key, entry] of Object.entries(manifest.hooks)) {
    assert.ok(existsSync(join(REPO_ROOT, entry.path)), `${key}: canonical path ${entry.path} must exist`);
  }
});

await test("every wired shim/adapter ref exists on disk", () => {
  const manifest = loadManifest();
  for (const [key, entry] of Object.entries(manifest.hooks)) {
    for (const [surface, wiring] of Object.entries(entry.wiring)) {
      if (wiring.kind === "shim") {
        assert.ok(existsSync(join(REPO_ROOT, wiring.ref)), `${key} on ${surface}: shim ref ${wiring.ref} must exist`);
      } else if (wiring.kind === "adapter") {
        assert.ok(existsSync(join(REPO_ROOT, wiring.ref)), `${key} on ${surface}: adapter ref ${wiring.ref} must exist`);
      }
    }
  }
});

await test("SessionStart adapter matcher (`startup`) is asserted (red-team F7)", async () => {
  // .factory's SessionStart adapter carries matcher:"startup"; the parity
  // path uses matchersEqual on the runtime config's matcher to ensure the
  // matcher is actually wired (not just any event entry).
  const SURFACES = await loadSurfaces();
  for (const surface of SURFACES) {
    const hooks = await loadRuntimeHooks(surface);
    const adapterEntry = hooks.find((h) =>
      h.event === "SessionStart" &&
      h.command.includes("loop-surface-inject")
    );
    if (adapterEntry) {
      assert.strictEqual(adapterEntry.matcher, "startup", `${surface}: SessionStart adapter must carry matcher:"startup"`);
    } else {
      assert.notStrictEqual(surface, ".factory", ".factory must wire the SessionStart adapter");
    }
  }
});

await forEachHookAcrossSurfaces(async (key, entry, surface, wiring, runtimeHooks) => {
  await test(`${key} is wired with declared kind (${wiring.kind ?? "undefined"}) on ${surface}`, () => {
    const res = wiresArePresent({ runtimeHooks, key, surface, wiring, entry });
    assert.ok(res.ok, `${key} on ${surface} (kind=${wiring.kind ?? wiring?.kind}) failed: ${res.found ?? ""} | fix: ${res.fix_suggestion ?? ""}`);
  });
});

await test(".mastracode write-gate: array-matcher cardinality (3 distinct wires)", async () => {
  // The manifest declares write-gate on .mastracode as kind:"direct" with
  // matcher ["write_file","string_replace_lsp","delete_file"]. The runtime
  // config MUST have exactly 3 distinct wires — missing one of the three
  // is silent 2-of-3 degradation if we only check command-existence.
  const manifest = loadManifest();
  const entry = manifest.hooks["write-gate"];
  const wiring = entry.wiring[".mastracode"];
  assert.strictEqual(wiring.kind, "direct");
  assert.ok(Array.isArray(wiring.matcher));
  assert.strictEqual(wiring.matcher.length, 3);

  const runtimeHooks = await loadRuntimeHooks(".mastracode");
  const expectedCmd = `node ${entry.path}`;
  const wires = runtimeHooks.filter((h) => h.event === "PreToolUse" && commandEquals(h.command, expectedCmd));
  assert.strictEqual(wires.length, 3, `expected 3 distinct wires for write-gate on .mastracode; got ${wires.length}`);

  const coveredTools = wires.map((h) => h.matcher?.tool_name).filter(Boolean);
  for (const tool of wiring.matcher) {
    assert.ok(coveredTools.includes(tool), `write-gate on .mastracode must wire tool:"${tool}"`);
  }
});

// ---------- mutation guard (manual proof of drift detection) ----------
//
// This section documents — by structure, not by execution — that the test
// detects both drift directions (a wired hook that disappears, and an
// undeclared hook that gets wired). The mutation checks live in the
// phase-02 plan; they are NOT executed here because they would mutate the
// runtime configs (forbidden by Phase 2 scope). The reverse-direction
// assertions above (kind:"none" negative branch + the matching positive
// branches) encode the same invariants structurally.
