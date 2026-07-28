# Research: hooks-lock.json schema + wiring-parity test

Date: 2026-07-28 06:50
Scope: Design the hooks equivalent of `skills-lock.json` + `skills-mirror-parity.test.js`. Research only — no code changes.
Ground truth: verified wiring matrix supplied in the task brief + confirmed against repo files (cited below).

---

## 1. hooks-lock.json schema

### Location
Repo root: `/home/datguy/codingProjects/learning-loop-template/hooks-lock.json` (mirrors `skills-lock.json` at repo root, `skills-lock.json:1`).

### Shape

```json
{
  "version": 1,
  "hooks": {
    "bash-gate": {
      "path": "tools/learning-loop-mastra/hooks/universal/bash-gate.js",
      "event": "PreToolUse",
      "wiring": {
        ".claude":    { "kind": "shim",   "ref": ".claude/coordination/hooks/bash-coordination-gate.cjs",    "matcher": "Bash" },
        ".factory":   { "kind": "shim",   "ref": ".factory/coordination/hooks/bash-coordination-gate.cjs",   "matcher": "Execute" },
        ".mastracode":{ "kind": "direct", "ref": "node tools/learning-loop-mastra/hooks/universal/bash-gate.js", "matcher": { "tool_name": "execute_command" } }
      }
    },
    "write-gate": {
      "path": "tools/learning-loop-mastra/hooks/universal/write-gate.js",
      "event": "PreToolUse",
      "wiring": {
        ".claude":    { "kind": "shim",   "ref": ".claude/coordination/hooks/write-coordination-gate.cjs",  "matcher": "Edit|Write" },
        ".factory":   { "kind": "shim",   "ref": ".factory/coordination/hooks/write-coordination-gate.cjs", "matcher": "Edit|Create|ApplyPatch" },
        ".mastracode":{ "kind": "direct", "ref": "node tools/learning-loop-mastra/hooks/universal/write-gate.js",
                        "matcher": [ { "tool_name": "write_file" }, { "tool_name": "string_replace_lsp" }, { "tool_name": "delete_file" } ] }
      }
    },
    "inbound-gate": {
      "path": "tools/learning-loop-mastra/hooks/universal/inbound-gate.js",
      "event": "UserPromptSubmit",
      "wiring": {
        ".claude":    { "kind": "shim",   "ref": ".claude/coordination/hooks/inbound-state-gate.cjs",   "matcher": null },
        ".factory":   { "kind": "shim",   "ref": ".factory/coordination/hooks/inbound-state-gate.cjs",  "matcher": null },
        ".mastracode":{ "kind": "direct", "ref": "node tools/learning-loop-mastra/hooks/universal/inbound-gate.js", "matcher": null }
      }
    },
    "recurrence-check-on-start": {
      "path": "tools/learning-loop-mastra/hooks/universal/recurrence-check-on-start.js",
      "event": "SessionStart",
      "wiring": {
        ".claude":    { "kind": "shim",   "ref": ".claude/coordination/hooks/recurrence-check-on-start.cjs",  "matcher": null },
        ".factory":   { "kind": "shim",   "ref": ".factory/coordination/hooks/recurrence-check-on-start.cjs", "matcher": null },
        ".mastracode":{ "kind": "direct", "ref": "node tools/learning-loop-mastra/hooks/universal/recurrence-check-on-start.js", "matcher": null }
      }
    },
    "session-start-inject-discoverability": {
      "path": "tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs",
      "event": "SessionStart",
      "wiring": {
        ".claude":    { "kind": "direct",  "ref": "node tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs", "matcher": null },
        ".factory":   { "kind": "adapter", "ref": ".factory/hooks/loop-surface-inject.cjs", "matcher": null },
        ".mastracode":{ "kind": "none",    "ref": null, "matcher": null }
      }
    },
    "session-start-inject-process-hints": {
      "path": "tools/learning-loop-mastra/hooks/universal/session-start-inject-process-hints.cjs",
      "event": "SessionStart",
      "wiring": {
        ".claude":    { "kind": "direct",  "ref": "node tools/learning-loop-mastra/hooks/universal/session-start-inject-process-hints.cjs", "matcher": null },
        ".factory":   { "kind": "adapter", "ref": ".factory/hooks/loop-surface-inject.cjs", "matcher": null },
        ".mastracode":{ "kind": "none",    "ref": null, "matcher": null }
      }
    }
  }
}
```

### Field semantics

| field | type | notes |
|---|---|---|
| `version` | number | bump on schema change. Start at 1 (skills-lock is at v2; we're new). |
| `hooks.<name>.path` | string | repo-relative path to the canonical universal file. Stable identity — the hook's "source of truth" file. |
| `hooks.<name>.event` | enum `SessionStart\|PreToolUse\|UserPromptSubmit` | the hook event. |
| `hooks.<name>.wiring` | object keyed by SURFACES | per-runtime wiring map. |
| `wiring[s].kind` | enum `shim\|direct\|adapter\|none` | see below. |
| `wiring[s].ref` | string\|null | for `shim`: surface-relative path to the .cjs shim file. For `direct`: the command string as it appears in the runtime config (e.g. `node tools/...`). For `adapter`: surface-relative path to the runtime-local adapter file. For `none`: null. |
| `wiring[s].matcher` | `string\|string[]\|object\|object[]\|null` | the matcher as it appears in the runtime's config. Array form for hooks wired N× under different matchers (`.mastracode` write-gate). null for events that take no matcher (`SessionStart`, `UserPromptSubmit`). |

### Wiring kinds

- `shim` — runtime config wires a surface-local .cjs shim that re-exports/invokes the universal hook. Test asserts: shim file exists at `ref`, AND runtime config contains a command entry whose command resolves to that shim path.
- `direct` — runtime config wires `node <universal path>` (or the universal file directly). Test asserts: runtime config contains an entry whose command contains the universal `path` from the manifest.
- `adapter` — runtime-local adapter file (`ref`) wires the universal behavior through a runtime-specific shape. Test asserts: adapter file exists at `ref`, AND the runtime config wires that adapter file. The adapter is NOT itself a universal hook and is NOT subject to shims-in-sync byte-identity.
- `none` — the runtime does NOT wire this hook. Test asserts: runtime config has NO entry referencing the universal `path`, the shim path, or the adapter path. This is the drift-catching assertion — a runtime silently gaining a hook fails the test.

### Pattern C representation — recommendation

Represent Pattern C (`.factory/hooks/loop-surface-inject.cjs`) as `kind: "adapter"` inline in the two affected hook entries (`session-start-inject-discoverability`, `session-start-inject-process-hints`), NOT as a separate top-level `adapters` section.

Reasons:
- The manifest's unit is the universal hook. Pattern C is a per-runtime delivery mechanism for two universal hooks, not a standalone hook. Inline `adapter` keeps "one entry per universal hook" intact.
- A separate `adapters` section would create a join: "adapters listed separately, but each hook entry still needs to point at the adapter it uses." That's two places to keep in sync — DRY violation.
- Both discoverability and process-hints entries pointing at the same adapter `ref` is honest: the single adapter covers both. The test passes if the adapter is wired once in `.factory/hooks.json`, regardless of how many manifest entries reference it.

### Materializer — NOT needed (recommendation)

No `sync-hooks.mjs` materializer is needed. The manifest is purely declarative; the parity test is the enforcement.

Justification against the skills model:
- Skills need `sync-skills.mjs` because **content fans out**: `SKILL.md` is authored once at `tools/learning-loop-mastra/skills/<name>/SKILL.md` and byte-identical copies must land in `.claude/skills/`, `.factory/skills/`, `.mastracode/skills/` (`sync-skills.mjs:1-30`, `core/surfaces.js#writeToAllSkills`). The materializer is the fan-out mechanism; the parity test is the backstop.
- Hooks do **not** fan out content. The universal hook lives at one path (`tools/learning-loop-mastra/hooks/universal/`) and each runtime's static config (`settings.json`/`hooks.json`) points at it. There is no per-surface copy of the hook body to keep in sync.
- The only fan-out that exists for hooks is the **shim files** (4 .cjs shims mirrored to `.claude/coordination/hooks/` and `.factory/coordination/hooks/`). That fan-out is already covered by the existing `shims-in-sync` checklist item (`runtime-agnostic-checklist.js:204-241`) and its regression test. A new materializer would duplicate that mechanism (DRY violation).
- A `sync-hooks` script that rewrote `settings.json`/`hooks.json` would be a footgun: those configs are runtime-owned, hand-tuned, and carry non-hook fields (`autoMemoryEnabled`, `shellPassthrough`, `omScope`, timeouts, descriptions). Rewriting them risks clobbering runtime-specific shape (KISS violation — don't generate what's already correct-by-hand).

The manifest declares; the parity test enforces; the existing `shims-in-sync` checklist item enforces shim byte-identity. No new script.

---

## 2. hooks-wiring-parity.test.js — design

### Location
`tools/learning-loop-mastra/__tests__/legacy-mcp/hooks-wiring-parity.test.js` (sibling to `skills-mirror-parity.test.js` and `runtime-agnostic.test.js`, both in `legacy-mcp/` — see `__tests__/legacy-mcp/` listing).

### Imports / setup

```js
import { test } from "vitest";
import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { SURFACES } from "../../core/surfaces.js";
import { CHECKLIST } from "../../core/runtime-agnostic-checklist.js";

const REPO_ROOT = new URL("../../../../", import.meta.url).pathname;
const MANIFEST_PATH = join(REPO_ROOT, "hooks-lock.json");
```

### Config-file resolution per runtime

The test must load the right config file(s) per runtime. Three shapes coexist:

| runtime | config file(s) | shape |
|---|---|---|
| `.claude` | `.claude/settings.json` only | `{ hooks: { <Event>: [ { matcher?, hooks: [ { type, command } ] } ] } }` (nested) |
| `.factory` | `.factory/settings.json` AND `.factory/hooks.json` | settings.json: nested (same as .claude). hooks.json: `{ <Event>: [ { matcher?, hooks: [ { type, command, timeout? } ] } ] }` (nested) |
| `.mastracode` | `.mastracode/hooks.json` only | `{ <Event>: [ { type, command, matcher?, timeout?, description? } ] }` (flat — entry IS the hook, no nested `hooks` array) |

Evidence: `.claude/settings.json:1-53`, `.factory/settings.json:1-44`, `.factory/hooks.json:1-14`, `.mastracode/hooks.json:1-48`.

Loader helper:

```js
const CONFIG_PATHS = {
  ".claude":     [".claude/settings.json"],
  ".factory":    [".factory/settings.json", ".factory/hooks.json"],
  ".mastracode": [".mastracode/hooks.json"],
};

function loadRuntimeHooks(surface) {
  // Returns an array of { event, matcher, command } entries flattened across
  // all config files for that runtime. Normalizes both nested and flat shapes.
  const entries = [];
  for (const rel of CONFIG_PATHS[surface]) {
    const p = join(REPO_ROOT, rel);
    if (!existsSync(p)) continue;
    const cfg = JSON.parse(readFileSync(p, "utf8"));
    const hooksRoot = cfg.hooks ?? cfg; // settings.json nests under "hooks"; hooks.json does not
    for (const [event, arr] of Object.entries(hooksRoot)) {
      for (const block of arr) {
        const hookList = block.hooks ?? [block]; // nested vs flat
        for (const h of hookList) {
          entries.push({ source: rel, event, matcher: h.matcher ?? block.matcher ?? null, command: h.command });
        }
      }
    }
  }
  return entries;
}
```

Matcher comparison must be shape-aware: `.mastracode` matcher is an object `{tool_name:"execute_command"}` (`.mastracode/hooks.json:6`) while `.claude`/`.factory` matcher is a string. Use `JSON.stringify` for equality, with null treated as "no matcher".

### Assertion logic

For each manifest hook `H`, for each runtime `S`:

```js
const w = H.wiring[S];
const wired = loadRuntimeHooks(S).filter(e => e.event === H.event);
const matchesRef = (e) => commandReferences(e.command, w.kind, w.ref, H.path);

if (w.kind === "shim") {
  assert.ok(existsSync(join(REPO_ROOT, w.ref)), `${S}: shim ${w.ref} must exist`);
  assert.ok(wired.some(e => matchersEqual(e.matcher, w.matcher) && matchesRef(e)),
    `${S}: ${H.name} shim must be wired under event ${H.event} with matcher ${JSON.stringify(w.matcher)}`);
}
if (w.kind === "direct") {
  assert.ok(wired.some(e => matchersEqual(e.matcher, w.matcher) && e.command.includes(H.path)),
    `${S}: ${H.name} direct wire must reference ${H.path}`);
}
if (w.kind === "adapter") {
  assert.ok(existsSync(join(REPO_ROOT, w.ref)), `${S}: adapter ${w.ref} must exist`);
  assert.ok(wired.some(e => e.command.includes(w.ref.replace(/^\./, "")) || e.command.includes(w.ref)),
    `${S}: adapter ${w.ref} must be wired under event ${H.event}`);
}
if (w.kind === "none") {
  const offenders = wired.filter(e => e.command.includes(H.path) || e.command.includes(basenameOfPath(H.path)));
  assert.strictEqual(offenders.length, 0,
    `${S}: ${H.name} must NOT be wired (declared "none"); found ${JSON.stringify(offenders)}`);
}
```

`commandReferences` for `shim` checks the command ends with the shim path (handling `$FACTORY_PROJECT_DIR`/prefix and `node ` prefix). For `direct` checks inclusion of `H.path`.

### TDD red-test specs (write these as failing tests first)

1. `test("hooks-lock.json exists at repo root")` — assert existsSync(MANIFEST_PATH).
2. `test("hooks-lock.json has version + hooks object with 6 entries")` — schema: version is number, hooks is object, `Object.keys(hooks).length === 6`.
3. `test("each manifest hook has required fields (path, event, wiring)")` — loop; assert `path`, `event`, `wiring` present; `event` ∈ {SessionStart, PreToolUse, UserPromptSubmit}; `wiring` has all 3 SURFACES as keys.
4. `test("each wiring entry has kind ∈ {shim,direct,adapter,none} and ref matches kind")` — kind valid; ref non-null for shim/direct/adapter; ref null for none.
5. `test("bash-gate: .claude shim wired with matcher 'Bash'")` — wired entry exists.
6. `test("bash-gate: .factory shim wired with matcher 'Execute'")` — confirms matcher divergence is honored.
7. `test("bash-gate: .mastracode direct wired with matcher {tool_name:'execute_command'}")` — object matcher.
8. `test("write-gate: .claude shim wired with matcher 'Edit|Write'")`.
9. `test("write-gate: .factory shim wired with matcher 'Edit|Create|ApplyPatch'")` — matcher divergence.
10. `test("write-gate: .mastracode direct wired 3× under write_file/string_replace_lsp/delete_file")` — array matcher; assert 3 distinct entries.
11. `test("inbound-gate: shim on .claude + .factory, direct on .mastracode, matcher null")`.
12. `test("recurrence-check-on-start: shim on .claude + .factory, direct on .mastracode")`.
13. `test("session-start-inject-discoverability: direct on .claude, adapter on .factory, none on .mastracode")` — adapter file `.factory/hooks/loop-surface-inject.cjs` exists AND is wired in `.factory/hooks.json` SessionStart.
14. `test("session-start-inject-process-hints: direct on .claude, adapter on .factory (same adapter), none on .mastracode")`.
15. `test("declared 'none' wiring is not silently wired (drift catch)")` — for every `(hook, runtime)` where kind==="none", assert no wired entry references the universal path or a shim path for that hook. (Catches .mastracode silently adopting discoverability/hints or factory direct-wiring instead of adapter.)
16. `test("shims declared in manifest are byte-identical across shim surfaces (delegate to shims-in-sync)")` — call `CHECKLIST.find(i => i.id === "shims-in-sync").verify("tools/learning-loop-mastra/hooks/universal", REPO_ROOT)` and assert `result.ok`. DRY: reuses the existing checklist item (`runtime-agnostic-checklist.js:204-241`) instead of re-implementing byte-identity.
17. `test("manifest is internally consistent: every 'shim' ref points at an existing .cjs file")` — for each shim wiring, existsSync(ref).
18. `test("manifest is internally consistent: every 'adapter' ref points at an existing file")`.
19. `test("no runtime wires a universal hook that is not in the manifest")` — invert: collect all commands in every runtime config that reference `tools/learning-loop-mastra/hooks/universal/` or `coordination/hooks/*.cjs`; each must map to a manifest hook entry. Catches undeclared hooks.

Test 19 is the reverse-parity direction (mirror of `skills-manifest.test.js`'s "manifest contains X" + "each entry matches" pair). Together with test 15, this closes both drift directions: undeclared wire and declared-but-missing wire.

---

## 3. Where the test lives

**Recommended path:** `tools/learning-loop-mastra/__tests__/legacy-mcp/hooks-wiring-parity.test.js`.

Reasons:
- Sibling to `skills-mirror-parity.test.js` (the pattern being mirrored) and `skills-manifest.test.js` (manifest schema test). All three are manifest-driven parity tests; colocating aids discoverability.
- `runtime-agnostic.test.js` (the runtime-agnostic regression test) is also in `legacy-mcp/` (`__tests__/legacy-mcp/runtime-agnostic.test.js:1-60`), so `legacy-mcp/` is already the home for cross-surface invariant tests. A new `hooks/` dir would split sibling invariants unnecessarily (KISS).
- The test uses `vitest` (`.test.js`), matching `skills-mirror-parity.test.js` and `runtime-agnostic.test.js`. The `.cjs` siblings (e.g. `factory-hook-single-source.test.cjs`) are legacy CommonJS; the new test should be ESM `.test.js`.

---

## 4. Risks / edge cases

### 4.1 Matcher variants
- `.claude` write-gate matcher: `"Edit|Write"` (`.claude/settings.json:33`).
- `.factory` write-gate matcher: `"Edit|Create|ApplyPatch"` (`.factory/settings.json:25`).
- `.mastracode` write-gate: 3 separate entries with object matchers `{tool_name:"write_file"}`, `{tool_name:"string_replace_lsp"}`, `{tool_name:"delete_file"}` (`.mastracode/hooks.json:11-30`).
- `.claude`/`.factory` bash-gate: `"Bash"` vs `"Execute"` (`.claude/settings.json:42`, `.factory/settings.json:34`).

**Decision: encode per-runtime matcher in the manifest wiring entry (NOT a canonical matcher).** A canonical matcher would force a lie — the runtimes genuinely use different matcher strings, and the test must assert what's actually wired, not what we wish were wired. The `matcher` field is per-runtime and can be `string | string[] | object | object[] | null`. The test's `matchersEqual` helper normalizes via `JSON.stringify` and treats `null`/absent as "no matcher" (applicable to `SessionStart`/`UserPromptSubmit`).

For `.mastracode` write-gate, the manifest entry's matcher is an **array of 3 objects**. The test asserts 3 distinct wired entries, one per object. This is the only hook with array matcher; the test handles the array case generically.

### 4.2 .factory's two config files
`.factory` uses BOTH `settings.json` (PreToolUse gates + SessionStart recurrence + UserPromptSubmit, `.factory/settings.json:1-44`) AND `hooks.json` (SessionStart adapter, `.factory/hooks.json:1-14`). The loader (`CONFIG_PATHS[".factory"]`) returns both; the test flattens both into one entry list. The adapter assertion (test 13) finds the adapter in `hooks.json`; the gate assertions (tests 5-12) find the shims in `settings.json`. No special-casing beyond the config-paths map.

Risk: a future change wires a hook in the wrong factory file (e.g. writes the adapter into `settings.json`). The test's flattened loader accepts either file, so it would still pass. This is acceptable — the manifest declares THAT the adapter is wired, not WHICH file. If file-of-record matters, add a stricter assertion later (YAGNI now).

### 4.3 .mastracode flat shape
`.mastracode/hooks.json` entries are flat (`{type, command, matcher, timeout, description}`) — no nested `hooks` array (`.mastracode/hooks.json:3-9`). The loader's `block.hooks ?? [block]` handles both. Document this in the loader comment.

### 4.4 `$FACTORY_PROJECT_DIR` prefix in .factory commands
`.factory` commands are prefixed with `"$FACTORY_PROJECT_DIR"/` (`.factory/settings.json:8`). The test's `commandReferences` helper must resolve this prefix — either by string-stripping the env var token before comparison, or by checking `e.command.endsWith(w.ref)` (the runtime-relative path). Use `endsWith`/includes on the ref path; do not expand the env var (KISS, no env dependency in test).

### 4.5 .mastracode settings.json has no hooks key
`.mastracode/settings.json` is `{shellPassthrough:false, omScope:"project"}` — no hooks (`/home/datguy/codingProjects/learning-loop-template/.mastracode/settings.json:1-4`). All .mastracode hooks live in `hooks.json`. The loader must not assume `settings.json` has a `hooks` key. `CONFIG_PATHS[".mastracode"]` omits settings.json entirely. If a future change adds a `hooks` key to `.mastracode/settings.json`, the loader map should be updated (out of scope for this plan).

### 4.6 Shim byte-identity is delegated, not re-implemented
Test 16 delegates to the existing `shims-in-sync` checklist item. Risk: the checklist item iterates `SHIM_DIRS` (`.claude/coordination/hooks`, `.factory/coordination/hooks`, `.mastracode/coordination/hooks` — `runtime-agnostic-checklist.js:14`). `.mastracode` does not have a `coordination/hooks` dir (only `.claude` and `.factory` do — see `ls` output above). The checklist item handles missing dirs gracefully (`buildShimMaps` returns empty names for missing dirs, `runtime-agnostic-checklist.js:152-160`), so the assertion `present.length < perSurface.length` correctly reports `.mastracode/coordination/hooks/<name>` as missing for each shim. Currently the manifest declares shims only on `.claude` and `.factory` (not `.mastracode`), so test 16 passing is consistent with the manifest. If the manifest ever declares a shim on `.mastracode`, the manifest-consistency test 17 would catch the missing dir first.

### 4.7 Adapter covers two hooks — test dedup
Tests 13 and 14 both assert `.factory/hooks/loop-surface-inject.cjs` is wired. Since the adapter is wired once in `.factory/hooks.json` SessionStart, both tests pass via the same wired entry. The test does NOT assert the adapter is wired twice — only that it IS wired. This matches reality.

---

## 5. Open questions for the planner

1. **Manifest versioning & self-heal:** skills-lock.json v2 has a `normalizeManifest` self-heal step (`sync-skills.mjs:18-22`). Should hooks-lock.json v1 ship with an equivalent normalizer (e.g. a `normalize-hooks.mjs` invoked from a `pnpm` script), or is the manifest small enough (6 entries) that hand-maintenance + parity test is sufficient? Recommendation: skip the normalizer for v1 (YAGNI); add only if drift recurs.

2. **change-log bound paths:** the meta-state change-log has a "bound paths" concept (see `change-log-bound-paths.test.js` in `legacy-mcp/`). Should `hooks-lock.json` and the 6 universal hook paths be added to the bound-paths registry so a meta-state change touching hooks is flagged? Not required for parity, but the original finding cited "drift is invisible" — bound-paths would make the change-log aware. Out of scope for this plan; flag for a follow-up.

3. **`.mastracode` write-gate triple-wire encoding:** I encoded it as `matcher: [ {obj}, {obj}, {obj} ]` (array of objects). Alternative: encode as 3 separate wiring entries under a `wiring[".mastracode"]` array. The array-of-matchers form keeps `wiring[s]` a single object (simpler schema). Confirm the array form is acceptable; if the planner prefers 3 entries, the schema needs `wiring[s]` to be `object | object[]` and the test loop changes.

4. **Adapter file extension/registration:** `.factory/hooks/loop-surface-inject.cjs` is the only adapter today. If more adapters appear (e.g. a `.mastracode` adapter for context injection), should the manifest grow an `adapters` index section for discoverability, or keep adapters only as inline `kind:"adapter"` refs? Recommendation: keep inline (KISS); add an index only if adapter count grows past ~3.

5. **Manifest hash field:** skills-lock entries carry a `hash` (sha256 of canonical source) that the test verifies (`skills-mirror-parity.test.js:177-189`). Should hooks-lock entries carry a hash of the universal hook file? It would catch silent edits to the universal hook body. Skills need it because content fans out and the canonical source is the trust anchor; hooks don't fan out, but a hash would still catch unilateral edits to `tools/learning-loop-mastra/hooks/universal/*.js`. Recommend adding `hash` to each hook entry (sha256 of `path`), enforced by the parity test. Decision left to planner — adding it now is cheap; removing it later is harder.

6. **Should the test assert hook file `existsSync` for the canonical `path`?** Trivially yes — add to test 17/18. Listed here because it's a yes/no the planner should confirm.

---

## Limitations

- Did not investigate whether the inbound-gate, recurrence-check, or session-start hooks have runtime-specific **behavior** differences (only wiring differences). The manifest asserts wiring, not behavior parity. If a shim diverges in behavior from the universal hook (despite byte-identity of the shim file across surfaces), the manifest does not catch it. The `shims-in-sync` byte-identity check covers shim-vs-shim divergence, not shim-vs-universal divergence.
- Did not exhaustively audit whether any runtime wires a hook NOT in the universal dir (e.g. a runtime-only hook like `.factory/hooks/loop-surface-inject.cjs`). The `factory-hook-single-source.test.cjs` test already covers that specific adapter. Test 19 (reverse-parity) catches runtime wires referencing `coordination/hooks/*.cjs` or `universal/`, but does NOT catch a runtime-only hook that uses neither path pattern. If such hooks exist, they are by definition outside the manifest's scope (the manifest is for universal hooks).
- Did not verify the `pnpm test` invocation pattern for `legacy-mcp/` — confirm the planner knows the test runner picks up the new file (vitest glob should match `.test.js` in `legacy-mcp/`).
