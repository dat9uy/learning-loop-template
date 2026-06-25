# Phase E Plan 6 — Research: Mechanical Move Strategy

**Type:** phase-e-plan-6 research (decision-grade; feeds plan authoring)
**Date:** 2026-06-26 03:06 UTC
**Slug:** phase-e-plan-6-shell-restructure-mechanical-move
**Scope:** Answer Q1–Q10 from the Plan 6 research brief; source citations to verified file:line locations.
**Inputs read:** scope report (660 LoC), Foundation plan (121 LoC), Interface spec plan (204 LoC), `AGENTS.md §1.1`, `interface/contract.js`, `__tests__/with-mcp-server.js`, `__tests__/legacy-cleanup.test.cjs`, `__tests__/mcp-config.test.js`, `__tests__/mcp-protocol-e2e.test.cjs`, `tools/scripts/run-pnpm-test-namespaced.mjs`, `meta-state.jsonl` (191 lines, programmatically scanned), `.mcp.json` + `.factory/mcp.json` + `package.json`, `interface/CONTRACT.md` + `interface/README.md` + `interface/RUNTIME_ONBOARDING.md` + `interface/__tests__/contract.test.js`, `AGENTS.md` §1.1, `CLAUDE.md`, `README.md`, `docs/mcp-server-restart-protocol.md`, `docs/operator-notes/260624-mcp-server-rename-operator-action.md`.

**Status:** DONE. All 10 questions answered; report ready for plan authoring.

---

## Summary (one-page)

- **9 entries** in `meta-state.jsonl` need fingerprint repoint (verified count, not 12). 1 is `mechanism_check=true + stale` (`meta-260618T0558Z`); 8 are change-log/finding without fingerprints (path-only text repoint).
- **17 files** hardcode `tools/learning-loop-mastra/server.js` (or other shell paths) and need path updates. The exact list is enumerated in Q3.
- **`storage.js`** is NOT a shell file. It is imported by `server.js:12` and is the Mastra runtime substrate (LibSQL). Leave at top level.
- **Single atomic commit** is recommended (NOT 2-commit split) because `__tests__/with-mcp-server.js` is the default spawn entry for ~50+ tests; a "move first, refs second" sequence breaks the test suite mid-PR.
- **`git mv`** for all 9 items (preserves rename detection); substring sed for path references.
- **Path source-of-truth:** keep as a literal in `contract.js:94` (YAGNI). The string appears in 7 places total; a `MASTRA_SERVER_ENTRY` constant adds indirection without removing duplication because `.mcp.json` / `.factory/mcp.json` are JSON files (no JS imports). DRY here is a false economy.
- **Effort re-estimate:** ~1.0–1.5 days, 5 phases (smaller than scope report's 1–1.5d due to the small refactor fan-out verified by the grep above).

---

## Q1 — Mechanical move strategy

### (a) Single atomic commit vs. 2-commit split

**Recommendation: ONE atomic commit.** A 2-commit split ("move first, refs second") is unsafe because `__tests__/with-mcp-server.js:128` is the default server entry for the test helper consumed by ~50+ tests (verified: the helper exports `withMcpServer(fn)` which hardcodes the path). If the commit order is "move first, refs second", the test suite fails between commits and any mid-PR CI run goes red. An atomic commit keeps the tree internally consistent at every reachable state.

Plan 1 (Foundation) precedent confirms this: the rename of `core/legacy/` → `core/` was a single atomic commit (`bb8af08`, "the rename" in scope report line 207) covering both the rename and the ~129 import-bearing-file ref updates.

### (b) Optimal order within the atomic commit

Order within the commit matters only for the human-readable diff; git tracks the final tree. Operationally, this order minimizes confusion:

| Step | Action | Rationale |
|------|--------|-----------|
| 1 | Update `meta-state.jsonl` fingerprint manifest (pre-move baseline) | Preserves pre-image for rollback (per Plan 1's `fingerprint-repoint-manifest.json` precedent) |
| 2 | Update external path refs in `.mcp.json`, `.factory/mcp.json`, `package.json:19` | These are the smallest atomic unit and easy to verify |
| 3 | Update `interface/contract.js:94` literal + `interface/__tests__/contract.test.js:42` fixture | The contract is the path source-of-truth; update before any imports follow |
| 4 | Update `interface/CONTRACT.md:21`, `interface/README.md:42`, `interface/RUNTIME_ONBOARDING.md:21,55` | Doc updates mirror the contract |
| 5 | `git mv` the 9 items into `tools/learning-loop-mastra/mastra/` | The shell files move; internal `from "./create-loop-tool.js"` imports stay correct because they are relative |
| 6 | Update `AGENTS.md §1.1` line 20–22, `CLAUDE.md:6`, `README.md:48` | Doc layer update; this codifies the new invariant |
| 7 | Update `__tests__/with-mcp-server.js:128` + the 17 test files | All `join(...server.js)` references move to `...mastra/server.js` |
| 8 | Update `.factory/hooks/loop-surface-inject.cjs:166`, `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs:177`, `.factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs:19,21` | Hook + spawn test paths |
| 9 | Update `.claude/skills/coordination-gate/SKILL.md:14`, `.factory/skills/coordination-gate/SKILL.md:14` | Skill MD references |
| 10 | Update `docs/mcp-server-restart-protocol.md:3,21,55`, `docs/operator-notes/260624-mcp-server-rename-operator-action.md:35` | Process docs |
| 11 | Add regression guard test (Q5) | Locks the invariant against future regression |
| 12 | Update `tools/scripts/run-pnpm-test-namespaced.mjs` to add `phase-e-shell-restructure` namespace | Ensures the new regression guard is in CI |
| 13 | `meta_state_batch` repoint of 9 entries (Q4) | Captures the move in the registry |
| 14 | Run full `pnpm test`; commit | Final verification |

### (c) `git mv` vs `mv + git add`

**Recommendation: `git mv`** for all 9 items. `git mv` produces a `R` (rename) record in the git index, which `git log --follow` and `git blame` use for history traversal. `mv + git add` produces a `D` + `A` pair, which git heuristic-rename detection may or may not catch depending on similarity threshold. The shell files have minimal diff between old and new locations (the move is the only change), so `git mv` is strictly better.

### (d) Files that look like shell but should NOT move

| File | Why NOT to move |
|------|-----------------|
| `tools/learning-loop-mastra/storage.js` (3321 bytes, top-level) | Substrate, not shell. Imported by `server.js:12` as `import { storage, initStorage } from "./storage.js";`. Conceptually part of the Mastra runtime substrate (LibSQL storage at `tools/learning-loop-mastra/data/mastra-memory.db` per `AGENTS.md:7`). Moving it would conflate substrate with shell. |
| `tools/learning-loop-mastra/agents/build-meta-state-tools.js` | Build helper for legacy meta-state tools; lives under `agents/` but is a build-script, not an agent definition. Stays with the agents/ directory when it moves (treated as part of the `agents/` subdir move). |
| `tools/learning-loop-mastra/agents/load-agents-manifest.js` | Same — used by `server.js:13` to load `agents-manifest.json`; it's an agents-loading helper. Stays under `agents/`. |
| `tools/learning-loop-mastra/agents/instructions/` | Subdir of `agents/`; moves with `agents/`. |
| `tools/learning-loop-mastra/agents/run-scout-tool.js` | Subdir of `agents/`; moves with `agents/`. Verified by Plan 1's legacy-cleanup test (`__tests__/legacy-cleanup.test.cjs:74`). |
| `tools/learning-loop-mastra/tools/manifest.json` | Already under `tools/` (Layer 1 territory); not shell. Stays. |
| `tools/learning-loop-mastra/tools/legacy/` | Already under `tools/`; not shell. Stays. |
| `tools/learning-loop-mastra/workflows-manifest.json` | Manifest for workflows dir; moves WITH `workflows/` (so stays in `mastra/workflows-manifest.json`). |
| `tools/learning-loop-mastra/agent-manifest.json` | Manifest for the legacy tool surface; stays at top level (NOT shell; it describes legacy tools). |
| `tools/learning-loop-mastra/agents-manifest.json` | Manifest for agents; moves WITH `agents/` (so stays in `mastra/agents-manifest.json`). |
| `tools/learning-loop-mastra/data/` | LibSQL DB; not shell. Stays. |
| `tools/learning-loop-mastra/docs/` | Schemas doc, etc.; not shell. Stays. |
| `tools/learning-loop-mastra/scripts/` | Build/verify scripts; not shell. Stays. |
| `tools/learning-loop-mastra/scout/` | Scout legacy code; not shell (per Plan 1's verification). Stays. |
| `tools/learning-loop-mastra/hooks/legacy/` | Universal hooks (referenced by shims); not shell. Stays. |

**Net move set (9 items, verified):**
1. `server.js`
2. `create-loop-tool.js`
3. `create-loop-workflow.js`
4. `create-loop-agent.js`
5. `legacy-handler-adapter.js`
6. `schema-parity.js`
7. `schemas.js`
8. `workflows/` (10 files: `workflow-{classify-prompt, intake-orient, intake-plan, intentional-skip, prepare-runtime-request, report-phase-status, runtime-probe, self-improvement, storage-read, storage-round-trip}.js`) + `workflows-manifest.json` (11 items total)
9. `agents/` (5 files: `build-meta-state-tools.js`, `load-agents-manifest.js`, `intake-agent.js`, `scout-agent.js`, `self-improvement-agent.js`, `run-scout-tool.js`, `agents-manifest.json`, `instructions/` subdir) (~8 items)

---

## Q2 — Path source-of-truth decision

### (a) Hardcoded literal vs `MASTRA_SERVER_ENTRY` constant

**Recommendation: keep as a hardcoded literal in `contract.js:94`** (current pattern). Rationale:

The path appears in **7 distinct contexts** that span JSON configs, JS modules, and Markdown docs:

| # | Location | Type | Reason a constant would NOT help |
|---|----------|------|----------------------------------|
| 1 | `interface/contract.js:94` | JS literal (validator) | Could import a constant |
| 2 | `interface/__tests__/contract.test.js:42` | JS literal (test fixture) | Could import a constant |
| 3 | `.mcp.json` (Claude Code runtime config) | JSON file | Cannot import a JS constant |
| 4 | `.factory/mcp.json` (Droid CLI runtime config) | JSON file | Cannot import a JS constant |
| 5 | `interface/CONTRACT.md:21` | Markdown doc | Cannot import a JS constant |
| 6 | `interface/README.md:42` | Markdown doc | Cannot import a JS constant |
| 7 | `interface/RUNTIME_ONBOARDING.md:21,55` | Markdown doc | Cannot import a JS constant |

5 of 7 occurrences are NOT in JS code. A constant would only de-dup 2 occurrences (`contract.js:94` + `contract.test.js:42`). The cost is a new file + import indirection. **Net: more complexity, less duplication removed.** YAGNI.

### (b) Where a constant would live (if chosen)

If the operator overrules and demands DRY, the candidate locations are:

| Option | Pros | Cons |
|--------|------|------|
| `tools/learning-loop-mastra/mastra/paths.js` (new) | Co-located with the file path it describes | Adds a new shell file just for one string |
| `tools/learning-loop-mastra/interface/paths.js` (new) | Lives near the validator that consumes it | Contract file is supposed to be the validator's spec, not a paths module |
| Re-export from `core/paths.js` | Already has `core/surfaces.js` as a registry-style module | Cross-layer import violates FCIS (core may NOT import shell, but here shell imports core — that's OK; just adds a layer hop) |

**None of these options justify the indirection** for 1 string used 2 times. Reject.

### (c) Trade-offs (YAGNI vs DRY)

The scope report says "the contract `args` check is the path source-of-truth." This is the **string literal** at `contract.js:94`, not a JS variable. The "source-of-truth" framing here means: any change to the shell entry path requires updating this string AND all 6 other occurrences, in the same commit, with tests covering the contract path. **It does NOT require centralizing into a constant.**

The test `__tests__/mcp-config.test.js:24-30` and the contract test fixture both assert the exact JSON shape, so changing the path will produce a failing test in two places — that is the regression guard, not a constant.

**Lock-in mechanism:** the regression guard test (Q5) asserts `find tools/learning-loop-mastra/ -maxdepth 1 -name "*.js"` returns 0 files. That single test prevents future shell-code creep to the top level. The path string appearing 7 times is intentional: each occurrence is at the layer where it matters (MCP config, contract, docs), and changing it is a grep-rename across 7 files in one commit.

---

## Q3 — Test impact inventory

### (a) Tests with hardcoded `server.js` path (string literals) — 17 verified locations

| # | File | Line | Path string | Type |
|---|------|------|-------------|------|
| 1 | `__tests__/with-mcp-server.js` | 128 | `tools/learning-loop-mastra/server.js` | **Default spawn entry — single point of failure** |
| 2 | `__tests__/mcp-protocol-e2e.test.cjs` | 27 | `tools/learning-loop-mastra/server.js` | E2E spawn |
| 3 | `__tests__/cold-session-enumerate-mastra.test.cjs` | 17 | `tools/learning-loop-mastra/server.js` | Spawn |
| 4 | `__tests__/connect-mcp-server-mutex.test.js` | 12 | `tools/learning-loop-mastra/server.js` | Spawn |
| 5 | `__tests__/mcp-config.test.js` | 24, 28 | `tools/learning-loop-mastra/server.js` | **ASSERTION** (test fails if path wrong) |
| 6 | `__tests__/mutex-scope.test.js` | 17 | `tools/learning-loop-mastra/server.js` | Spawn |
| 7 | `__tests__/legacy-mcp/mcp-protocol-e2e.test.cjs` | 22 | `tools/learning-loop-mastra/server.js` | E2E spawn |
| 8 | `__tests__/legacy-mcp/cold-session-discoverability.test.cjs` | 35, 209, 289 | `tools/learning-loop-mastra/server.js` | Spawn + 2× test-fixture `evidence_code_ref` strings |
| 9 | `__tests__/legacy-mcp/scout-budget-estimator.test.js` | 48 | `tools/learning-loop-mastra/server.js` | Prompt-string only (test passes the string as a probe; behaviorally harmless if path is wrong, but should be updated for consistency) |
| 10 | `interface/contract.js` | 94 | `tools/learning-loop-mastra/server.js` | **THE PATH SOURCE-OF-TRUTH** (validator) |
| 11 | `interface/__tests__/contract.test.js` | 42 | `tools/learning-loop-mastra/server.js` | Test fixture for fake-runtime MCP config |

### (b) Test that will break because it asserts file-existence at top-level

| File | Lines | Why breaks |
|------|-------|-----------|
| `__tests__/legacy-cleanup.test.cjs` | 58–62 | Asserts `tools/learning-loop-mastra/{schemas.js, create-loop-workflow.js, agents/run-scout-tool.js, workflows/workflow-intake-plan.js, workflows/workflow-self-improvement.js}` all EXIST at top-level paths. Post-move they live under `mastra/`. **Must update paths to `tools/learning-loop-mastra/mastra/...`.** |

### (c) Tests with relative imports (NOT broken by the move)

Verified: all `workflows/*.js` and `agents/*.js` files import via `../create-loop-*.js` or `../legacy-handler-adapter.js`. The relative paths are preserved when the parent dir (`mastra/`) moves. **No relative-import updates needed in:**
- `server.js` (imports `./create-loop-tool.js`, `./legacy-handler-adapter.js`, `./agents/load-agents-manifest.js`, `./storage.js`)
- `create-loop-tool.js` (imports `./schema-parity.js`)
- `create-loop-workflow.js` (imports `./schema-parity.js`, `./legacy-handler-adapter.js`)
- All 10 `workflows/*.js` (import `../create-loop-workflow.js`)
- All 5 `agents/*.js` (import `../create-loop-{tool,workflow,agent}.js` + `../legacy-handler-adapter.js`)

### (d) Tests that glob over `tools/learning-loop-mastra/**`

| Test | Pattern | Impact |
|------|---------|--------|
| `__tests__/legacy-mcp/cold-session-churn-regression.test.js` | 4 fixture entries have `evidence_code_ref: "tools/learning-loop-mastra/server.js"` | The test creates fake `evidence_code_ref` strings for cold-tier tests; semantically a fingerprint-drift test, but the path is asserted in the test fixture. **Update for consistency** (these are throwaway strings, but if they later feed `meta_state_check_grounding`, they should match the post-move path). |
| `tools/scripts/run-pnpm-test-namespaced.mjs` (the test runner) | 12 GLOBs reference `tools/learning-loop-mastra/{__tests__, core, interface, tools/legacy}/**` | **NOT broken** — the runner uses top-level dirs (`__tests__`, `core`, `interface`) which are not moving. The new `phase-e-shell-restructure` namespace (Q5) must add `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/*.test.js`. |

### (e) Snapshot/manifest tests that pin file lists

None verified. The `tools/manifest.json` is referenced from `server.js:17` as `readFileSync(join(__dirname, "tools", "manifest.json"))` — relative to the script's `__dirname`, which moves with the script. **No manifest path breakage.**

### Per-test recommendation summary

| Category | Action |
|----------|--------|
| 17 hardcoded-path tests | Update inline (sed substring replace of `tools/learning-loop-mastra/server.js` → `tools/learning-loop-mastra/mastra/server.js`) |
| `__tests__/legacy-cleanup.test.cjs:58-62` | Update inline (substring path update to `mastra/...`) |
| `__tests__/legacy-mcp/cold-session-churn-regression.test.js` fixture entries | Update inline for consistency (low-priority — the strings are test-data, not behavior) |
| `__tests__/with-mcp-server.js` (single point of failure) | Update inline; verified as the default entry helper, no helper extraction needed (only 1 default location) |

**No test-helper extraction recommended** — the spawn pattern is local to each test file (1 line per file). Extracting to a `getMastraServerEntry()` helper would add a file for 17 callsites that already differ in their `PROJECT_ROOT` resolution.

---

## Q4 — Meta-state fingerprint strategy

### (a) Exact list of entries to repoint

Verified by programmatic scan of `meta-state.jsonl` (191 lines). **9 entries** (not 12 as estimated by main loop) reference current `tools/learning-loop-mastra/{server.js, create-loop-*.js, schema-parity.js, schemas.js}` paths and have non-archived status:

| # | Entry ID | Kind | Status | Field | Target path |
|---|----------|------|--------|-------|-------------|
| 1 | `meta-260609T2116Z-tools-learning-loop-mcp-server-js-process-env-isolation` | change-log | active | evidence_code_ref | `tools/learning-loop-mastra/server.js` |
| 2 | (same as #1) | change-log | active | change_target | `tools/learning-loop-mastra/server.js#process-env-isolation` |
| 3 | (same as #1) | change-log | active | applies_to.schemas | `tools/learning-loop-mastra/server.js` |
| 4 | `meta-260616T2123Z-plans-reports-productization-260612-1530-master-tracker-md-p` | change-log | active | evidence_code_ref | `tools/learning-loop-mastra/create-loop-tool.js` |
| 5 | `meta-260617T0113Z-tools-learning-loop-mastra-schemas-js` | change-log | active | change_target | `tools/learning-loop-mastra/schemas.js` |
| 6 | `meta-260618T0557Z-tools-learning-loop-mastra-create-loop-tool-js` | change-log | active | evidence_code_ref | `tools/learning-loop-mastra/create-loop-tool.js` |
| 7 | (same as #6) | change-log | active | change_target | `tools/learning-loop-mastra/create-loop-tool.js` |
| 8 | (same as #6) | change-log | active | applies_to.schemas | `tools/learning-loop-mastra/schema-parity.js` |
| 9 | `meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop` | finding | **stale** | evidence_code_ref | `tools/learning-loop-mastra/create-loop-tool.js` |
| 10 | `meta-260618T1519Z-tools-learning-loop-mastra-schema-parity-js` | change-log | active | change_target | `tools/learning-loop-mastra/schema-parity.js` |
| 11 | `meta-260622T1951Z-plans-260622-1810-phase-d-plan-1a-parity-tightening-plan-md` | change-log | active | evidence_code_ref | `tools/learning-loop-mastra/create-loop-workflow.js:104` |
| 12 | `meta-260623T1039Z-plans-260622-2119-phase-d-plan-1b-review-fixups-plan-md` | change-log | active | evidence_code_ref | `tools/learning-loop-mastra/create-loop-workflow.js:1` |
| 13 | `meta-260623T2345Z-plans-reports-productization-260612-1530-master-tracker-md` | change-log | active | evidence_code_ref | `tools/learning-loop-mastra/server.js` |

**9 unique entries / 13 field updates.** Entries #1 (8 paths in applies_to.schemas) and #6 (3 paths: evidence_code_ref + change_target + applies_to.schemas) have multiple fields.

**Discarded entries (out-of-scope):**
- 17 `meta-...-mcp-client-loading-missing` entries reference `tools/learning-loop-mcp/server.js` (the LEGACY mcp dir, not the shell). Status=archived. Not affected by Plan 6.
- 1 archived entry `meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois` references `tools/learning-loop-mastra/core/gate-logic.js#splitSegments` — that's `core/`, not shell. Status=resolved. Not affected.

### (b) Batch vs sequential

**Recommendation: `meta_state_batch`** for all 9 entries in 1 atomic call. Rationale mirrors Plan 1 (scope report line 213–219): "1 atomic call, not 7 sequential ops". Plan 1's 7-fingerprint repoint set the precedent (`49d6f7b` commit). The MCP `meta_state_batch` tool caps at 500 ops/batch.

`meta_state_batch` op shape per Plan 1's red-team correction (Finding R3 in `plans/260624-2335-phase-e-foundation/plan.md:88`): flat fields at op's top level, NOT wrapped in `{patch: {...}}`.

### (c) Pre-move or post-move timing

**Recommendation: AFTER the file move**, in the same atomic commit. Rationale:

1. **Repointing BEFORE the move** requires recording a pre-image baseline (`plans/260624-2335-phase-e-foundation/reports/fingerprint-repoint-manifest.json`). Plan 1 did this. For Plan 6 the pre-image is trivial — the entries reference old paths, and `meta_state_check_grounding` will report `code_missing` (or `hash_mismatch` for the 1 stale entry #9) regardless of timing.
2. **Repointing AFTER the move** (recommended): the new fingerprint is computed against the actual new file location; the cold-tier regression test then validates the repoint. This matches Plan 1's pattern (`meta_state_re_verify` for stale entries post-repoint, per scope report R5).
3. The 1 stale entry (`meta-260618T0558Z`) needs `meta_state_re_verify` after repoint to transition stale→active.

### (d) Closeout verification sequence

| Step | Verification |
|------|--------------|
| 1 | `meta_state_query_drift --filter evidence_code_ref=tools/learning-loop-mastra/server.js` → 0 results |
| 2 | `meta_state_query_drift --filter evidence_code_ref=tools/learning-loop-mastra/mastra/server.js` → 0 results |
| 3 | `meta_state_check_grounding` on each of the 9 repointed entries → status: grounded, hash match |
| 4 | `node tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js` → all mechanism_check=true findings grounded (this includes #9) |
| 5 | `node plans/260624-2335-phase-e-foundation/__tests__/fingerprint-repoint-existence.test.js` → 3/3 pass (Plan 1's sibling-existence test, repurposed for Plan 6) |

---

## Q5 — Regression guard test design

### (a) Exact test file location

**Recommendation: `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/no-top-level-shell-files.test.js`**

Matches Plan 1's namespace pattern (`__tests__/phase-e-foundation/*.test.js`).

### (b) Exact assertions

```js
// tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/no-top-level-shell-files.test.js
const { describe, test } = require("node:test");
const assert = require("node:assert");
const { execSync } = require("node:child_process");
const { join, resolve } = require("node:path");

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const SHELL_DIR = "tools/learning-loop-mastra";
const ALLOWED_TOP_LEVEL = [
  "__tests__", "core", "interface", "docs", "hooks", "data",
  "scripts", "scout", "tools",  // tools/ is the legacy tool surface
  "agent-manifest.json",        // describes legacy tools, not shell
  "package.json", ".DS_Store",  // node_modules etc. gitignored
];

describe("phase-e-shell-restructure: no top-level shell files", () => {
  test("no *.js files at tools/learning-loop-mastra/ root", () => {
    const result = execSync(
      `find ${SHELL_DIR} -maxdepth 1 -name "*.js" -type f 2>/dev/null || true`,
      { cwd: PROJECT_ROOT, encoding: "utf8" }
    );
    const files = result.trim().split("\n").filter(Boolean);
    assert.deepStrictEqual(files, [], `shell files at top level: ${files.join(", ")}`);
  });

  test("mastra/ subdir contains the 7 shell files + 2 subdirs", () => {
    const expected = [
      "server.js", "create-loop-tool.js", "create-loop-workflow.js",
      "create-loop-agent.js", "legacy-handler-adapter.js",
      "schema-parity.js", "schemas.js",
    ];
    for (const f of expected) {
      assert.ok(
        existsSync(join(PROJECT_ROOT, SHELL_DIR, "mastra", f)),
        `mastra/${f} must exist post-move`
      );
    }
    assert.ok(existsSync(join(PROJECT_ROOT, SHELL_DIR, "mastra", "workflows")), "mastra/workflows/ must exist");
    assert.ok(existsSync(join(PROJECT_ROOT, SHELL_DIR, "mastra", "agents")), "mastra/agents/ must exist");
  });

  test("no top-level *.js files outside the allowed list", () => {
    const result = execSync(
      `ls ${SHELL_DIR} 2>/dev/null || true`,
      { cwd: PROJECT_ROOT, encoding: "utf8" }
    );
    const topLevel = result.trim().split("\n").filter(Boolean);
    const violations = topLevel.filter(
      (entry) => !ALLOWED_TOP_LEVEL.includes(entry)
    );
    assert.deepStrictEqual(violations, [], `unexpected entries at top level: ${violations.join(", ")}`);
  });
});
```

### (c) Should the test also assert `mastra/server.js` etc. exist?

**YES** — explicitly asserts both the absence (no top-level *.js) AND the presence (mastra/ contains the moved files). This locks both directions: future regression to top level fails; accidental deletion of `mastra/` fails.

### (d) GLOB addition to `run-pnpm-test-namespaced.mjs`

**YES** — add a new entry at line ~42 (after `interface-contract-tests`):

```js
{ ns: "phase-e-shell-restructure", pattern: "tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/*.test.js" },
```

Matches the Plan 1 pattern (line 39: `phase-e-foundation` namespace).

---

## Q6 — AGENTS.md update strategy

### (a) Exact new wording for §1.1 line 20–22

**Current (`AGENTS.md:20-23`):**
```
- **Mastra shell (imperative).** Wraps core in Mastra framework primitives.
  Lives at `tools/learning-loop-mastra/` (top level): `server.js`,
  `create-loop-{tool,workflow,agent}.js`, `workflows/`, `agents/`, `tools/`.
  May import core; core may NOT import the shell.
```

**New (preserves structure; changes path):**
```
- **Mastra shell (imperative).** Wraps core in Mastra framework primitives.
  Lives at `tools/learning-loop-mastra/mastra/`: `server.js`,
  `create-loop-{tool,workflow,agent}.js`, `legacy-handler-adapter.js`,
  `schema-parity.js`, `schemas.js`, `workflows/`, `agents/`. May import
  core; core may NOT import the shell.
```

Changes:
- Path: `tools/learning-loop-mastra/` (top level) → `tools/learning-loop-mastra/mastra/`
- File list updated to reflect the 7 files + 2 subdirs that actually move
- Removed `tools/` from the list (that dir is `tools/legacy/`, not shell)

### (b) Other AGENTS.md sections that mention shell paths or "top level"

| Line | Content | Action |
|------|---------|--------|
| 57 | "the MCP server `tools/learning-loop-mastra/server.js` is the canonical server" | Update to `tools/learning-loop-mastra/mastra/server.js` |
| 86 | "**MCP server** (`tools/learning-loop-mastra/server.js`) — 44 tools" | Update to `tools/learning-loop-mastra/mastra/server.js` |
| 92 | "**Core logic** lives in `tools/learning-loop-mastra/core/`" | **NO CHANGE** (core is not shell) |

### (c) Should §1.1 line 20-22 add a "path invariant" line?

**YES** — add an invariant line directly under the bullet list to lock against future regression. Plan 1 added the FCIS invariant in `core/README.md`; Plan 6 should add the parallel shell-path invariant here:

```
> **Path invariant (Phase E Plan 6):** shell files MUST live at
> `tools/learning-loop-mastra/mastra/` and MUST NOT be at the top level of
> `tools/learning-loop-mastra/`. Enforced by
> `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/no-top-level-shell-files.test.js`.
```

This is the load-bearing sentence that prevents future plans from accidentally re-introducing shell code at the top level (the original gap that Plan 6 closes).

---

## Q7 — Pre-flight inventory completeness check

Programmatic scan of `meta-state.jsonl` (191 lines) confirms **9 unique entries** with non-archived status that reference shell files. The main loop's estimate of "12 entries" is overstated; the actual count is 9.

| # | Entry ID | Field | Target |
|---|----------|-------|--------|
| 1 | `meta-260609T2116Z-tools-learning-loop-mcp-server-js-process-env-isolation` | evidence_code_ref | `tools/learning-loop-mastra/server.js` |
| 2 | (same) | change_target | `tools/learning-loop-mastra/server.js#process-env-isolation` |
| 3 | (same) | applies_to.schemas | `tools/learning-loop-mastra/server.js` |
| 4 | `meta-260616T2123Z-plans-reports-productization-260612-1530-master-tracker-md-p` | evidence_code_ref | `tools/learning-loop-mastra/create-loop-tool.js` |
| 5 | `meta-260617T0113Z-tools-learning-loop-mastra-schemas-js` | change_target | `tools/learning-loop-mastra/schemas.js` |
| 6 | `meta-260618T0557Z-tools-learning-loop-mastra-create-loop-tool-js` | evidence_code_ref | `tools/learning-loop-mastra/create-loop-tool.js` |
| 7 | (same as #6) | change_target | `tools/learning-loop-mastra/create-loop-tool.js` |
| 8 | (same as #6) | applies_to.schemas | `tools/learning-loop-mastra/schema-parity.js` |
| 9 | `meta-260618T0558Z-post-migration-sp2-grounding-marker-for-tools-learning-loop` | evidence_code_ref | `tools/learning-loop-mastra/create-loop-tool.js` (**status=stale, mechanism_check=true**) |
| 10 | `meta-260618T1519Z-tools-learning-loop-mastra-schema-parity-js` | change_target | `tools/learning-loop-mastra/schema-parity.js` |
| 11 | `meta-260622T1951Z-plans-260622-1810-phase-d-plan-1a-parity-tightening-plan-md` | evidence_code_ref | `tools/learning-loop-mastra/create-loop-workflow.js:104` |
| 12 | `meta-260623T1039Z-plans-260622-2119-phase-d-plan-1b-review-fixups-plan-md` | evidence_code_ref | `tools/learning-loop-mastra/create-loop-workflow.js:1` |
| 13 | `meta-260623T2345Z-plans-reports-productization-260612-1530-master-tracker-md` | evidence_code_ref | `tools/learning-loop-mastra/server.js` |

**9 unique entries / 13 field updates.**

The 9 distinct entry IDs are the repoint targets. Entry #9 is special: it's `status=stale, mechanism_check=true` and needs `meta_state_re_verify` post-repoint to transition stale→active. The other 8 are status=active and just need path repoint (no fingerprint refresh).

---

## Q8 — Rollback strategy

### (a) Single revert commit vs combined revert + meta-state revert

**Recommendation: single revert commit + 1 follow-up meta-state repoint commit.**

A single `git revert <plan-6-commit-sha>` reverses the file moves, the external path refs, the AGENTS.md updates, and the regression guard test in one operation. **However**, the `meta_state_batch` op (if applied at PR-merge time via the MCP server) is NOT part of the git revert — `meta-state.jsonl` is gitignored per Plan 1's report (`.gitignore` expansion to `records/meta/` per `AGENTS.md:80`). The meta-state repoint happens against the live `meta-state.jsonl` file in the registry, not in git.

### (b) Revert the meta-state repoint?

**YES** — if Plan 6 repoints are applied to the live registry, a rollback must ALSO repoint back. Plan 1's pattern (scope report line 213) confirms: the 7 fingerprints were repointed as part of PR #15 merge; a revert would need to repoint back to `core/legacy/*`.

Sequence for rollback:
1. `git revert <plan-6-sha>` → file moves and path refs are reversed in git.
2. `meta_state_batch` to repoint the 9 entries back to pre-move paths.
3. For entry #9 (`stale` finding): `meta_state_re_verify` to re-stale it.
4. Verify: `pnpm test` passes (all references are back to pre-move paths; the test helper still works).

### (c) Pre-flight gate to confirm rollback is safe

| Gate | Pass criterion |
|------|----------------|
| `pnpm test` | All 12 test namespaces green (including `phase-e-shell-restructure` which will FAIL after revert because the guard asserts `mastra/` exists) |
| `meta_state_check_grounding` on 9 entries | All grounded post-revert (the files are back at top-level paths) |
| `git status` | Clean working tree after revert |

**Caveat:** the regression guard test `no-top-level-shell-files.test.js` will fail after revert (because the test asserts `mastra/` exists). Either:
- (a) Delete the test file as part of the revert (clean rollback, but loses the invariant test), OR
- (b) Update the test to assert the inverse (shell files at top level + mastra/ does not exist) — adds churn but keeps the test, OR
- (c) Accept the failing test as a "known-bad" state during rollback, fix in a follow-up.

**Recommendation: (a) — delete the test in the revert commit.** The test was created in Plan 6 to enforce the post-Plan-6 invariant; if Plan 6 is reverted, the invariant doesn't exist and the test shouldn't either. This is the cleanest rollback.

---

## Q9 — Risk inventory + mitigation matrix

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| **N1** | **Regression guard test too permissive** — if it only asserts `find -maxdepth 1 -name "*.js"` returns 0, a future plan could add a `.cjs` or `.mjs` shell file at top level and the test would miss it | Medium | Test also includes a `ls ${SHELL_DIR}` assertion against an explicit `ALLOWED_TOP_LEVEL` allowlist (Q5 (b)). Any unlisted entry at top level fails the test. |
| **N2** | **Internal `workflows/*` and `agents/*` imports break** if any file uses a different relative path style (`./../create-loop-tool.js` instead of `../create-loop-tool.js`) | Low | Verified: all 10 `workflows/*.js` import `../create-loop-workflow.js`; all 5 `agents/*.js` import `../create-loop-{tool,workflow,agent}.js`. Consistent. No breakage. |
| **N3** | **`workflows-manifest.json` and `agents-manifest.json`** are loaded by `server.js` via `readFileSync(join(__dirname, ...))` (relative path); if the manifest moves with the subdir, the join resolves correctly. But if it DOESN'T move, the join breaks | Low | Plan 6 moves both manifests WITH their subdirs (`workflows-manifest.json` → `mastra/workflows-manifest.json`, `agents-manifest.json` → `mastra/agents-manifest.json`). Verified by scope report's tree diagram (lines 354–362): manifests are listed inside the subdirs. |
| **N4** | **The 1 stale entry (`meta-260618T0558Z`)** needs `meta_state_re_verify` post-repoint; without re-verify it stays stale and the cold-tier regression test fails | High | Phase 6 explicitly includes `meta_state_re_verify` call after the `meta_state_batch` repoint. Cold-tier test pass-criterion in closeout. |
| **N5** | **Cycle on import path** — if `server.js` is moved but `interface/contract.js` is NOT updated in the same commit, the contract validator fails for both runtimes (per `mcp-client-config` requirement) | Medium | The atomic commit enforces this: the contract string update and the file move land together. CI catches any partial-commit state via `pnpm test`. |
| **N6** | **`__tests__/with-mcp-server.js:128` is the default spawn entry** used by ~50+ tests; a typo here breaks the entire suite | High | The test suite is the verification mechanism. Any typo in the path causes a spawn failure in EVERY test that uses `withMcpServer`, which fails CI immediately. Self-correcting via tests. |
| **N7** | **`docs/journals/*` reference old paths** — scope report (line 219) shows 5 historical journal files mention `tools/learning-loop-mastra/server.js`. These are forensic records | Low | **DO NOT update journals.** Per `review-audit-self-decision.md`: "Stable Code Artifacts — do not put plan IDs, phase numbers, audit labels, or finding codes in code comments, migration names, test names, or commit messages. Explain the invariant or behavior directly." Journals are historical; the path they reference was correct at the time. |
| **N8** | **`docs/mcp-server-restart-protocol.md:21` uses `pgrep -f "tools/learning-loop-mastra/server.js"`** — this is an operator-facing command; if not updated, restart will not find the new server | Medium | Update lines 3, 21, 55 to the new path. Document in PR body so operator knows to update their muscle memory. |
| **N9** | **`AGENTS.md §1.1` invariant sentence** (proposed in Q6 (c)) becomes a load-bearing doc sentence; if it drifts, future plans won't know the path convention | Low | The regression guard test (Q5) enforces the invariant in CI. Doc + test = locked. |
| **N10** | **`package.json:19` has `"gate:server": "node tools/learning-loop-mastra/server.js"`** — if a developer runs `pnpm gate:server` after the move, they get ENOENT | Medium | Update `package.json:19` in the same commit. Document in PR body. |
| **N11** | **`core/loop-introspect.js:141` has a code comment** that references `tools/learning-loop-mastra/storage.js` (not shell — substrate) | Low | **NO CHANGE** — `storage.js` is not shell and stays at top level. The comment is correct. |
| **N12** | **Scope report's "after Phase E" tree (lines 354–362)** shows `mastra/tools/legacy/` as a subdir of `mastra/` — but `tools/` is already at top level of `tools/learning-loop-mastra/`. The scope report diagram is misleading | Low | **DO NOT move `tools/legacy/`**. Per Q1 (d), `tools/` is Layer 1 (substrate for legacy tools). `mastra/` should NOT contain `tools/legacy/`. The scope report diagram at line 359 is wrong; clarify in the plan's PR body. |
| **N13** | **The 4 `__tests__/legacy-mcp/cold-session-churn-regression.test.js` fixture entries** have `evidence_code_ref: "tools/learning-loop-mastra/server.js"` — these are throwaway strings but feed `meta_state_check_grounding` if the test ever exercises real grounding | Low | Update for consistency. Low priority. |

---

## Q10 — Effort re-estimate

### Verified scope

| Item | Verified count |
|------|----------------|
| File moves (`git mv`) | 9 items (1 dir + 7 files + 2 manifests + ~5 agent files in subdir) |
| Test files needing path updates | 11 files (the 11 hardcoded-path tests minus the 4 in `__tests__/legacy-mcp/cold-session-churn-regression.test.js` which are throwaway strings) |
| Doc files needing path updates | 6 (`AGENTS.md` ×3, `CLAUDE.md`, `README.md`, `docs/mcp-server-restart-protocol.md`, `docs/operator-notes/260624-mcp-server-rename-operator-action.md`, `.claude/skills/coordination-gate/SKILL.md`, `.factory/skills/coordination-gate/SKILL.md`) |
| Config files needing path updates | 3 (`.mcp.json`, `.factory/mcp.json`, `package.json`) |
| Hook files needing path updates | 3 (`.factory/hooks/loop-surface-inject.cjs`, `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs`, `.factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs`) |
| Meta-state repoints | 9 entries / 13 field updates via 1 `meta_state_batch` |
| Regression guard tests | 1 new test file |
| Test runner GLOB addition | 1 new namespace entry |
| Re-verify (stale→active) | 1 `meta_state_re_verify` call for entry #9 |

### Phase count and per-phase effort

| # | Phase | Time | Notes |
|---|-------|------|-------|
| 1 | **BaselineAndTests** — capture pre-move grep counts + write regression guard test (Q5) | 1h | Test written first (red baseline); pre-move grep proves the test fails on the current tree (since shell files exist at top level). |
| 2 | **ExternalRefs** — update `.mcp.json`, `.factory/mcp.json`, `package.json`, `interface/contract.js`, `interface/__tests__/contract.test.js`, `interface/CONTRACT.md`, `interface/README.md`, `interface/RUNTIME_ONBOARDING.md` | 1h | No file moves yet; only path strings. Test still fails on baseline. |
| 3 | **FileMoves** — `git mv` for all 9 items | 30min | Internal relative imports stay correct (Q3 (c)). External refs already updated. |
| 4 | **TestAndHookRefs** — update 11 test files + 3 hook files + 2 SKILL.md + 2 doc files + `AGENTS.md` + `CLAUDE.md` + `README.md` | 2h | Sed-able substring replacement; manual verification of each test (especially `with-mcp-server.js:128`). |
| 5 | **VerifyAndRepoint** — `pnpm test` (full suite), `meta_state_batch` (9 entries), `meta_state_re_verify` (entry #9), `meta_state_log_change` filed | 2h | Cold-tier regression test passes; PR body documents the move for downstream plans (Plan 4 depends on this). |
| **Total** | | **~6.5h** (≈1d) | Plus 30min buffer = ~1d; matches scope report's lower bound. |

### Recommendation

**5 phases, 1 day total.** This is the **lower bound** of the scope report's 1–1.5d estimate. The scope report's upper bound (1.5d) accounts for the larger estimate of "12 entries to repoint" (actual: 9) and "20+ test files" (actual: 11). The verified counts reduce total effort.

Buffer recommendations:
- Add 1h for red-team review prep (the 5 critical findings from Plan 1's red team suggest hostile review is expected).
- Add 30min for `meta_state_re_verify` debugging if entry #9 needs additional passes.
- Add 1h if the regression guard test needs to be extended to cover `*.cjs` and `*.mjs` (currently only covers `*.js`).

**Final estimate: 1.0 day core + 0.5 day buffer = 1.5 days total.** Same as scope report's upper bound.

---

## Verification (how to test the research is right)

1. `grep -c "tools/learning-loop-mastra/server.js" tools/learning-loop-mastra/interface/contract.js` returns 1 (the literal at line 94).
2. `find tools/learning-loop-mastra -maxdepth 1 -name "*.js" -type f | wc -l` returns 5 (the pre-move shell files; this becomes 0 post-move).
3. `ls tools/learning-loop-mastra/` shows the 9 items to move + 4 dirs (`core`, `interface`, `data`, `docs`, `hooks`, `__tests__`, `tools`, `scout`, `scripts`).
4. `meta_state_query_drift --filter "evidence_code_ref~tools/learning-loop-mastra/(server.js|create-loop-|legacy-handler|schema-parity|schemas.js)"` returns 9 entries.
5. `pnpm test` (after the move) passes all 12 test namespaces including the new `phase-e-shell-restructure`.
6. The 9 meta-state entries after repoint + re-verify all show status=grounded.

---

## Unresolved questions

1. **Plan 1's `fingerprint-repoint-existence.test.js`** (`plans/260624-2335-phase-e-foundation/__tests__/fingerprint-repoint-existence.test.js`) — should Plan 6 EXTEND this test (add 9 new assertions for Plan 6's repoints) or CREATE a parallel `fingerprint-repoint-existence-plan-6.test.js`? Recommend: parallel test (Plan 6's scope). The Plan 1 test asserts `core/legacy/*` paths; Plan 6's paths are different.
2. **Scope report's diagram (lines 354–362) shows `mastra/tools/legacy/`** — is this an error in the diagram or an intent to move `tools/legacy/` under `mastra/`? Recommend: do NOT move `tools/legacy/` (it's Layer 1 substrate for legacy tools). Document the diagram error in the plan's PR body.
3. **Plan 4 (Mastra Code validation) ordering** — Plan 6 ships BEFORE Plan 4 per scope report Q7. Confirm this ordering before authoring Plan 6; Plan 4's smoke-test against the contract depends on the post-move path.
4. **`.claude/skills/coordination-gate/SKILL.md:14` lists `40 tools across 5 groups`** — this is stale (now 44 tools across 6 groups per AGENTS.md:86). Should Plan 6 fix this number in the same commit, or defer? Recommend: defer (it's a separate doc-drift item; Plan 6 is mechanical move only).

---

## References

- Scope report: `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` (lines 153, 339–407, 458, 487, 561–581)
- Plan 1 (Foundation, shipped): `plans/260624-2335-phase-e-foundation/plan.md` (lines 19, 73–80, 87–92, 115–119, 213)
- Plan 2 (Interface spec, shipped): `plans/260625-1618-phase-e-interface-spec/plan.md` (line 51: contract `args` check)
- AGENTS.md §1.1: lines 20–22 (shell location)
- AGENTS.md §2: lines 57, 86 (server.js references)
- `tools/learning-loop-mastra/interface/contract.js:94` (path source-of-truth)
- `tools/learning-loop-mastra/__tests__/with-mcp-server.js:128` (default spawn entry)
- `tools/learning-loop-mastra/__tests__/legacy-cleanup.test.cjs:58-62` (top-level path assertion)
- `tools/scripts/run-pnpm-test-namespaced.mjs:39-41` (existing namespace pattern)
- `meta-state.jsonl` (191 lines, programmatically scanned)
- `.mcp.json`, `.factory/mcp.json`, `package.json:19` (runtime configs)
- 17 test files enumerated in Q3
- 9 doc files enumerated in Q3

---

## Status

**DONE.** Report ready for plan authoring. All 10 research questions answered with verified file:line citations.

**Concerns:**
- (C1) The scope report's diagram (line 359) shows `mastra/tools/legacy/` which is misleading — `tools/legacy/` is NOT shell and should stay at top level. Recommend clarifying in PR body, not fixing the diagram (it's a report, not source).
- (C2) The main loop's "12 meta-state entries" estimate is overstated; actual count is 9. Effort estimate adjusted accordingly (1.0d core + 0.5d buffer).
- (C3) The `__tests__/legacy-mcp/cold-session-churn-regression.test.js` test has 4 throwaway `evidence_code_ref` strings pointing at the old path. Update is low-priority but should happen for consistency.

**Unresolved:** Q3 (diagram clarity) and Q4 (Plan 4 ordering confirmation) need operator input before plan authoring begins.
