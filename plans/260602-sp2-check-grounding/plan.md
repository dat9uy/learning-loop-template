---
title: "SP2: meta_state_check_grounding (Grounding Check)"
description: "Implements the design in plans/reports/brainstorm-260602-sp2-check-grounding.md. Adds a pure-function grounding engine + 2 MCP tools (check + refresh) that detect drift between a meta-state finding's evidence_code_ref and the current filesystem state via SHA-256 fingerprint comparison. Closes the SP1 gap: SP1 detects missing/extra files; SP2 detects in-place mutation. TDD structure preserves the 512 existing tests. 28 unit + 11 tool + 2 acceptance = 41 new tests; target total 553. Schema gains 2 new optional fields (mechanism_check, code_fingerprint) on metaStateFindingEntrySchema."
status: completed
priority: P2
branch: "main"
tags: [meta, mcp, tdd, agent-affordances, grounding, verifier, meta-state, drift-detection, hash, fingerprint]
blockedBy: ["260602-sp1-derive-status"]
blocks: ["260602-sp3-drift (future)", "260602-meta-state-resolve-integration (future)"]
related:
  - plans/reports/brainstorm-260602-sp2-check-grounding.md (locked design)
  - plans/reports/brainstorm-260602-meta-state-agent-affordances.md (parent doc)
  - plans/reports/verification-260603-sp2-design.md (pre-plan verification report)
  - plans/260602-sp1-derive-status/plan.md (sibling, completed — pattern reference)
  - plans/260602-sp0-log-change/plan.md (sibling, completed — pattern reference)
  - tools/learning-loop-mcp/core/check-grounding.js (NEW — pure function)
  - tools/learning-loop-mcp/core/meta-state.js (metaStateFindingEntrySchema gains 2 optional fields)
  - tools/learning-loop-mcp/core/derive-status.js (SP1 sibling — codeContext + signal-extraction patterns)
  - tools/learning-loop-mcp/core/slugify.js (shared slugify helper)
  - tools/learning-loop-mcp/tools/meta-state-check-grounding-tool.js (NEW)
  - tools/learning-loop-mcp/tools/meta-state-refresh-fingerprint-tool.js (NEW)
  - tools/learning-loop-mcp/tools/meta-state-report-tool.js (handler extended to accept mechanism_check — see C-2 in verification report)
  - tools/learning-loop-mcp/tools/manifest.json (2 new lines appended at end of meta-state-* group)
  - tools/learning-loop-mcp/agent-manifest.json (2 new entries added to meta_state group)
  - tools/learning-loop-mcp/lib/gate-logging.js (appendGateLog)
  - tools/learning-loop-mcp/lib/resolve-root.js (resolveRoot)
  - meta-state.jsonl (18 finding entries + 1 change-log entry; 8 of 18 use nested evidence.code_ref — see C-1)
created: "2026-06-03T11:00:00Z"
createdBy: "ck:plan --hard --tdd (design locked in brainstorm; verification report in plans/reports/verification-260603-sp2-design.md)"
source: skill
---

# SP2: `meta_state_check_grounding` (Grounding Check)

## Overview

Implements the design locked in `plans/reports/brainstorm-260602-sp2-check-grounding.md` (status: locked 2026-06-03). The parent doc `brainstorm-260602-meta-state-agent-affordances.md` decomposes the "agent self-management of meta-state" question into 4 sub-projects (SP0-SP3). SP0 (self-modification) and SP1 (derivation query) are shipped. **This plan ships SP2**: the grounding check that lets the agent ask "is the mechanism this finding references still live?" and get a structured answer keyed on SHA-256 fingerprint comparison.

**Core change:** the agent invokes `meta_state_check_grounding({ id, run_tests? })`; the tool calls a pure grounding function with `codeContext` loaded from `resolveRoot()` + `process.env`; the function returns the locked shape `{ id, raw_status, grounding { ... }, status, drift_kind, fingerprint_was_recorded }`. SP1 detects missing/extra files; **SP2 detects in-place mutation** (the file still exists but its content changed since the last check). The companion tool `meta_state_refresh_fingerprint({ id })` updates the stored fingerprint when the agent decides the mutation is legitimate.

**Why TDD:** the function shape touches the entry schema (2 new optional fields), the registry write path (auto-record + explicit refresh both call `updateEntry`), and the gate-log writer. The 512 existing tests are the contract that must not regress. Tests-first locks the contract before any code changes. SP2's TDD structure mirrors SP1's proven pattern (28 unit + 11 tool + 2 acceptance = 41 new tests; 4 added from the verification report + 1 for the report tool extension).

**Surface:** `meta` (changes to the loop's own machinery, not `product/**`).

## Design Clarifications (Folded In From Pre-Plan Verification)

The locked design was verified against the actual codebase by a `worker` subagent in the planning session. The verification report (`plans/reports/verification-260603-sp2-design.md`) identified 2 CRITICAL findings, 4 HIGH findings, and 9 lower-severity findings. The plan folds in the following clarifications to address them. **No lock changes are required** (the locked enums are preserved; the clarifications are documentation/contract refinements).

| # | Finding | Plan resolution |
|---|---|---|
| **C-1** | Legacy `evidence.code_ref` fallback: 8 of 18 existing findings store the code_ref nested, not at top-level. SP1 handles this via `entry.evidence_code_ref ?? entry.evidence?.code_ref`. | Pure function reads the same fallback (mirror SP1 C-1). Unit test T-21 covers the legacy case. |
| **C-2** | `metaStateReportTool` (`tools/learning-loop-mcp/tools/meta-state-report-tool.js:14-22`) destructures only 8 fields; `mechanism_check` would be silently dropped on new entries. | **Option (a) chosen:** extend the report tool's handler to accept and store `mechanism_check` in the entry. Mirrors how `subtype` is passed through. Add 1 unit test (T-33) for the report tool's new behavior. |
| **C-3** | Locked `codeContext` shape `{ root, run_tests?, test_passed? }` is missing `now?: () => number`, but the test list (T-23, T-24) requires it. | Extend `codeContext` to `{ root, run_tests?, test_passed?, now?: () => number }`. Mirrors SP1. Documented in Phase 1 spec. |
| **D-1** | Auto-record (tool-layer mutation) breaks SP1's "verifier never mutates" promise. | Document explicitly: SP2's check tool is a **verifier + first-time recorder**. The first call records `code_fingerprint` (idempotent); subsequent calls verify. The refresh tool is the explicit mutation tool. Phase 2 echoes this. |
| **D-2** | Output shape uses nested `grounding` object (SP1 uses `derivation`). | Accept the divergence deliberately. The agent sees two different shapes depending on the tool. Add a code comment cross-referencing SP1. |
| **H-1** | `updateEntry` returns `null` when entry id not found, `"version_mismatch"` on CAS failure. Auto-record and refresh paths both call it. | Tool layer: if `updateEntry` returns `null`, log a warning and continue (return the computed `status: "grounded"` without `fingerprint_was_recorded: true`). If `"version_mismatch"`, log a warning. Unit test the null branch (T-34). |
| **H-2** | `code_fingerprint` regex format drift (`^sha256:[a-f0-9]{64}$`). If a stored fingerprint doesn't match (corruption), the function should defensively return `hash_match: null`. | Pure function validates the stored fingerprint against the regex; non-matching → `hash_match: null`, drift detection still proceeds (with stale-fingerprint as drift). Unit test T-31. |
| **H-3** | `meta_state_refresh_fingerprint` called on a non-grounded entry (`mechanism_check !== true` or missing). | Locked design specifies: return `{ error: "not_grounded", id, mechanism_check, reason }`. No write. Unit test T-26. |
| **H-4** | `meta_state_refresh_fingerprint` called when `evidence_code_ref` is missing or file doesn't exist. | Locked design specifies: return `{ error: "code_missing", id, evidence_code_ref }` for missing file. No write. Unit test T-27. |
| **M-1** | Path semantics: absolute paths treated as absolute, relative paths joined with `codeContext.root`, non-string `evidence_code_ref` handled defensively. | Mirror SP1 path tests (T-17, T-18, T-19 in SP1's list). SP2's test list (T-20, T-22, T-23). |
| **M-2** | Auto-record idempotency: second call must not re-write `code_fingerprint`. | `fingerprint_was_recorded: true` only on the first call. Unit test T-28. |
| **M-3** | `mechanism_check: false` and missing `evidence_code_ref` both yield `status: "skipped"`. The plan should distinguish them. | `grounding.evidence_code_ref` is `null` for both. `grounding.code_ref_exists` is `null` for both. `status: "skipped"` is the same. Plan documents: `skipped` is the catch-all for "no opt-in"; `unknown` is the opt-in but no-evidence case. |
| **M-4** | Test-runner flakiness (same as SP1). | Default `run_tests: false`. 30s timeout. mtime-keyed cache. |
| **M-5** | SHA-256 determinism: line endings, BOM markers, trailing newlines affect hash (intended). | Unit test T-29: `computeFileHash` is deterministic for the same bytes; changing 1 byte changes the hash. |
| **M-6** | `meta-state.jsonl` race condition: two concurrent `check_grounding` calls both try to auto-record. | The existing `enqueue` per-root write queue in `updateEntry` serializes writes. Optimistic; no CAS. Documented in Phase 2. |
| **L-1** | Output shape divergence from SP1 may confuse agents. | Add a code comment in `core/check-grounding.js` cross-referencing SP1's `derivation` shape. |
| **L-2** | `safeImport` failure on a new tool file. | Unit test the file loads (`import("../tools/meta-state-check-grounding-tool.js")` resolves). |
| **L-3** | `meta_state_list` tool's `entry_kind` filter doesn't surface `mechanism_check`. | Out of scope for SP2. SP3 (drift aggregation) is the right place for bulk grounding queries. |
| **I-1** | `now` missing from locked `codeContext` shape. | See C-3 above. |
| **I-2** | `mechanism_check === true` strict equality (not truthy). | Pure function checks strict equality. Unit test T-30: `mechanism_check: false` / `"true"` (string) / `1` → all `skipped`. |
| **I-3** | Corrupt `code_fingerprint` should return `hash_match: null` defensively. | Pure function validates against regex. Unit test T-31. |
| **I-4** | `refreshed_at` shape not specified. | `refreshed_at: new Date().toISOString()` (ISO 8601 string, matching SP1's `checked_at`). Gate log line also includes `refreshed_at`. |
| **I-5** | Auto-record increments `version` by 1 (via `updateEntry`). | First call: `version` increments. Second call: no mutation, no version bump. Documented in Phase 2. |
| **I-6** | Gate log line on the auto-record path is missing from the locked design. | Check tool emits exactly one gate log line per call, regardless of auto-record. Refresh tool emits its own. `updateEntry` does NOT emit a gate log line. |
| **I-7** | `META_STATE_GROUNDING_STATUSES` and `META_STATE_GROUNDING_DRIFT_KINDS` export names. | Confirmed: `META_STATE_GROUNDING_STATUSES` (4 values), `META_STATE_GROUNDING_DRIFT_KINDS` (3 values), `TERMINAL_HASH_REGEX` (internal). Unit test the constants are exported and contain expected values. |
| **I-8** | `entry_kind: "change-log"` fast path applies BEFORE `mechanism_check` check. | Pure function checks `entry.entry_kind === "change-log"` first; returns `status: "skipped"` with `grounding: { checked_at, duration_ms }` only. Unit test T-32. |
| **I-9** | `meta_state_resolve` integration is out of scope (locked). | Add a comment in `core/check-grounding.js` noting a future plan may add warn-when-derivation-disagrees. |
| **I-10** | Function name lock: `checkGrounding` / `core/check-grounding.js` / `__tests__/check-grounding.test.js`. | Confirmed. |
| **I-11** | `META_STATE_GROUNDING_*` placement. | Exported from `core/check-grounding.js` (matches SP1 pattern). |
| **I-12** | `loop_describe` shows both new tools. | Add a unit test in `__tests__/loop-describe.test.js` (or new `__tests__/sp2-tools-discoverable.test.js`) asserting the 2 new tool names appear in the warm response. |
| **I-13** | `agent-manifest.json` is already out of sync (missing SP0/SP1 tools). | **Option A chosen:** update `agent-manifest.json` to add the 2 new tools. The pre-existing drift is documented as out of scope (separate cleanup plan). |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 0 | [G8 Observation + Schema Scaffolding](./phase-00-g8-observation-and-scaffolding.md) | pending |
| 1 | [Pure Function `checkGrounding` (TDD, 28 unit tests)](./phase-01-pure-function-check-grounding.md) | pending |
| 2 | [`meta_state_check_grounding` + `meta_state_refresh_fingerprint` Tools (TDD, 11 tool tests)](./phase-02-check-and-refresh-tools.md) | pending |
| 3 | [Manifest Registration (`manifest.json` + `agent-manifest.json`)](./phase-03-manifest-registration.md) | pending |
| 4 | [Acceptance Test on Real Finding + First Real Use](./phase-04-acceptance-test.md) | pending |

## Cross-Plan Dependencies

| Relationship | Plan | Status | Note |
|---|---|---|---|
| Builds on | `260602-sp1-derive-status` | **completed** | SP1's `signals.test_passed` (computed via `runTest`) is the test-runner integration pattern. SP2 mirrors it. |
| Builds on | `260602-sp0-log-change` | **completed** | Provides the discriminated union (`entry_kind`) and the registry write queue pattern. |
| Builds on | `260602-self-enforcing-loop` | **completed** | Provides the 5+ existing meta-state tools and the `loop_describe` discovery surface. |
| Required for (future) | SP3 drift aggregation | not started | SP3 calls `checkGrounding` for many entries to find drift patterns. |
| Required for (future) | `meta_state_resolve` integration | not started | A future plan may make `meta_state_resolve` warn when grounding disagrees with the asserted status. |

## Resolved Decisions (from locked design + verification)

1. **Role:** `meta_state_check_grounding` and `meta_state_refresh_fingerprint` are agent-callable (no `OPERATOR_MODE` check; matches `meta_state_derive_status`).
2. **Auto-record (intentional deviation from SP1):** the check tool mutates the entry on first call (auto-records `code_fingerprint`). This is the only mutation `check_grounding` performs. The refresh tool is the explicit mutation tool. Both tools are discoverable via `loop_describe`.
3. **Pure function core (no subprocess):** `checkGrounding(entry, codeContext) -> GroundingResult`. Lives in `core/check-grounding.js`. MCP tool wraps it with I/O + subprocess.
4. **`codeContext` shape (extended from locked design per C-3):** `{ root: string, run_tests?: boolean, test_passed?: boolean | null, now?: () => number }`. Default `now = () => Date.now()`. Default `test_passed = null`. Default `run_tests = false`.
5. **Output shape (parent's lock):**
   ```js
   {
     id: string,
     raw_status: string,
     grounding: {
       evidence_code_ref: string | null,        // resolved absolute path or null
       code_ref_exists: boolean | null,         // null when evidence_code_ref is not set
       code_ref_hash: string | null,            // "sha256:hex" or null when not computed
       code_fingerprint: string | null,         // entry.code_fingerprint or null when not set
       hash_match: boolean | null,              // null when either side is null (no comparison possible)
       tests_referenced: boolean,               // entry.evidence_test is set
       tests_run: boolean,                      // run_tests was true and test runner was invoked
       test_passed: boolean | null,             // null = not run; true/false = result
       checked_at: string,                      // ISO timestamp
       duration_ms: number,
     },
     status: "grounded" | "drifted" | "unknown" | "skipped",
     drift_kind: "hash_mismatch" | "code_missing" | "test_failed" | null,
     fingerprint_was_recorded: boolean,         // true when this call wrote code_fingerprint to the entry
   }
   ```
6. **`status` (4 values, locked):** `grounded` | `drifted` | `unknown` | `skipped`.
   - `skipped` — `mechanism_check !== true` (opt-out path; tool returns early). Also applies to `entry_kind: "change-log"`.
   - `unknown` — `mechanism_check: true` but `evidence_code_ref` is not set (no signal to ground on).
   - `grounded` — code_ref exists AND (no `code_fingerprint` recorded OR hash matches OR stored fingerprint is corrupt) AND (no test specified OR test passed).
   - `drifted` — code_ref missing OR hash mismatch OR (test specified AND test failed).
7. **`drift_kind` (3 values, locked):** `null` (grounded/skipped/unknown) | `code_missing` (file doesn't exist) | `hash_mismatch` (hashes differ) | `test_failed` (test runner returned non-zero exit).
8. **Status logic (per I-2):** `mechanism_check === true` strict equality (not truthy). String "true" / number 1 / etc. all yield `skipped`.
9. **Drift kind logic:** `null` when `status` is `grounded` / `skipped` / `unknown`. `code_missing` when `code_ref_exists: false`. `hash_mismatch` when `code_ref_exists: true` AND `code_fingerprint` set (and matches regex) AND hashes differ. `test_failed` when `code_ref_exists: true` AND no `hash_mismatch` AND `tests_run: true` AND `test_passed: false`.
10. **Fingerprint auto-record (tool-layer, per D-1):** when `mechanism_check: true` AND `evidence_code_ref` exists AND `code_fingerprint` is not set AND the file exists → call `updateEntry(root, id, { code_fingerprint: "sha256:<hash>" })`. Set `fingerprint_was_recorded: true`. Idempotent on second call.
11. **`updateEntry` failure handling (per H-1):** if `updateEntry` returns `null` (id not found, race), log a warning and continue (return the computed `status: "grounded"` without `fingerprint_was_recorded: true`). If `"version_mismatch"`, log a warning. No throw.
12. **Refresh tool (separate, per H-3 / H-4):** `meta_state_refresh_fingerprint({ id })`:
    - Loads entry from registry; errors if not found.
    - Errors if `mechanism_check !== true` (return `{ error: "not_grounded", id, mechanism_check, reason }`).
    - Errors if `evidence_code_ref` is not set (return `{ error: "code_missing", id, evidence_code_ref }`).
    - Computes current SHA-256 of the file.
    - Errors if file is missing (return `{ error: "code_missing", id, evidence_code_ref }`).
    - Calls `updateEntry(root, id, { code_fingerprint: "sha256:<hash>" })`.
    - Returns `{ id, code_fingerprint, refreshed_at, status: "refreshed" }`.
    - Appends gate log line: `{ tool: "meta_state_refresh_fingerprint", id, code_fingerprint, refreshed_at }`.
13. **Test-runner integration:** opt-in via `run_tests` (default false). When true and `entry.evidence_test` is set, spawn `pnpm test -- <test_file>` (same subprocess pattern as SP1, same per-process mtime-keyed cache).
14. **Change-log fast path (per I-8):** `entry.entry_kind === "change-log"` → return `status: "skipped"`, `grounding: { checked_at, duration_ms }` only. Applied BEFORE the `mechanism_check` check.
15. **`now` injection (per C-3):** the function captures `t0 = codeContext.now()` at start and computes `duration_ms = codeContext.now() - t0` at end. The function is deterministic given inputs.
16. **`test_passed` pass-through:** when `codeContext.test_passed` is provided, it is passed through to `grounding.test_passed`. When not provided, `grounding.test_passed` is `null`.
17. **Path semantics:** absolute paths in `evidence_code_ref` are treated as absolute (not joined with `codeContext.root`). Relative paths are joined with `codeContext.root`. Non-string `evidence_code_ref` is treated as missing.
18. **Backward compat:** adds 2 new optional fields to the existing schema. The 18 existing entries load unchanged (new fields are `undefined`). The 512 existing tests must continue to pass. 41 new tests are added (28 unit + 11 tool + 2 acceptance).
19. **No new dependencies:** use only `node:crypto`, `node:fs`, `node:path`, `node:child_process` (built-ins). SHA-256 via `crypto.createHash("sha256")`.
20. **Schema field name lock:** no `evidence_` prefix on new fields (per operator correction in brainstorm). New fields are top-level on the entry: `mechanism_check`, `code_fingerprint`.
21. **`metaStateReportTool` extension (per C-2):** extend the handler to accept and store `mechanism_check`. New `meta_state_report` calls can opt-in to grounding. The 18 existing entries remain `mechanism_check: undefined` (yielding `skipped` on first check). Backward compat preserved.
22. **Manifest registration:** 2 new lines in `tools/manifest.json` (appended at end of meta-state-* group, after `meta-state-derive-status-tool.js`). 2 new entries in `agent-manifest.json` `meta_state` group (current state is already drifted; SP2 adds the 2 new tools without backfilling SP0/SP1 — that's a separate cleanup).

## Architecture (TDD-Relevant)

```
core/check-grounding.js                              [NEW] pure function, no subprocess
  - checkGrounding(entry, codeContext) -> GroundingResult
  - computeFileHash(absPath) -> "sha256:<64hex>"
  - computeStatus(present, hashMatch, testPass) -> Status
  - computeDriftKind(status, hashMatch, testPass) -> DriftKind | null
  - META_STATE_GROUNDING_STATUSES                     [export] 4-value source-of-truth array
  - META_STATE_GROUNDING_DRIFT_KINDS                  [export] 3-value source-of-truth array
  - TERMINAL_HASH_REGEX                              [internal] /^sha256:[a-f0-9]{64}$/

core/meta-state.js                                   [MODIFIED] +2 optional fields on metaStateFindingEntrySchema
  - mechanism_check: z.boolean().optional()...
  - code_fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional()...

tools/meta-state-report-tool.js                      [MODIFIED] handler extended to accept mechanism_check

tools/meta-state-check-grounding-tool.js             [NEW] MCP wrapper for the check
  - Loads codeContext from resolveRoot() + process.env
  - Computes test_passed via subprocess + cache (same as SP1) when run_tests: true
  - Calls checkGrounding(entry, codeContext)
  - Auto-records code_fingerprint on the entry when absent + mechanism_check: true + file exists
  - Returns parent's locked shape
  - Appends exactly one gate log line per call (regardless of auto-record)

tools/meta-state-refresh-fingerprint-tool.js         [NEW] MCP wrapper for the refresh
  - Loads entry from registry
  - Computes current SHA-256 of evidence_code_ref
  - Calls updateEntry(root, id, { code_fingerprint: "sha256:<new>" })
  - Returns { id, code_fingerprint, refreshed_at, status: "refreshed" }
  - Appends gate log line on every call

__tests__/check-grounding.test.js                    [NEW] pure function unit tests (24)
__tests__/meta-state-check-grounding-tool.test.js    [NEW] MCP tool tests (8)
__tests__/meta-state-refresh-fingerprint-tool.test.js [NEW] MCP tool tests (2)
__tests__/sp2-check-grounding-acceptance.test.js     [NEW] acceptance smoke tests (2)

tools/manifest.json                                  [MODIFIED] 2 new lines appended at end of meta-state-* group
tools/learning-loop-mcp/agent-manifest.json          [MODIFIED] 2 new entries in meta_state group
```

## Test Plan (Consolidated)

| File | New | Total after |
|---|---|---|
| `__tests__/check-grounding.test.js` (new) | 28 | 28 |
| `__tests__/meta-state-check-grounding-tool.test.js` (new) | 8 | 8 |
| `__tests__/meta-state-refresh-fingerprint-tool.test.js` (new) | 2 | 2 |
| `__tests__/sp2-check-grounding-acceptance.test.js` (new) | 2 | 2 |
| `__tests__/meta-state-report-tool-extension.test.js` (new) | 1 | 1 |
| **Total new tests** | | **41** (28 + 8 + 2 + 2 + 1) |
| **Existing tests (regression-safety floor)** | | 512 (preserved unchanged) |
| **Project total after plan** | | **553** |

The 41-test delta is 36 from the locked design + 4 added from the pre-plan verification mitigations (C-1, I-2, I-3, I-8) - 0 (none removed) + 1 (T-33 for the C-2 report tool extension) = 41. The 4 verification additions (C-1, I-2×2, I-3, I-8) bring the unit test count from the brainstorm's 24 to 28.

### Unit test list (`__tests__/check-grounding.test.js`, 28 tests)

1. `checkGrounding returns status: "skipped" when mechanism_check is not true` (brainstorm T-1)
2. `checkGrounding returns status: "skipped" for change-log entries (entry_kind: "change-log")` (I-8 mitigation; broader than brainstorm T-11)
3. `checkGrounding returns status: "skipped" when mechanism_check is false (strict equality)` (I-2)
4. `checkGrounding returns status: "skipped" when mechanism_check is a non-boolean (string "true", number 1, etc.)` (I-2)
5. `checkGrounding returns status: "unknown" when mechanism_check is true but evidence_code_ref is not set` (brainstorm T-2)
6. `checkGrounding returns status: "grounded" when code_ref exists and no fingerprint recorded` (brainstorm T-3)
7. `checkGrounding returns status: "grounded" when code_ref exists and fingerprint matches` (brainstorm T-4)
8. `checkGrounding returns status: "drifted" with drift_kind: "code_missing" when file is missing` (brainstorm T-5)
9. `checkGrounding returns status: "drifted" with drift_kind: "hash_mismatch" when fingerprint differs` (brainstorm T-6)
10. `checkGrounding returns status: "grounded" when test passed (run_tests: true, evidence_test set, exit 0)` (brainstorm T-7)
11. `checkGrounding returns status: "drifted" with drift_kind: "test_failed" when test fails` (brainstorm T-8)
12. `checkGrounding sets test_passed to null when run_tests is false` (brainstorm T-9)
13. `checkGrounding sets test_passed to boolean when run_tests is true and test runner spawned` (brainstorm T-10)
14. `checkGrounding sets hash_match to null when fingerprint is not yet recorded (first check)` (brainstorm T-12)
15. `checkGrounding sets hash_match to null when evidence_code_ref is not set (no comparison possible)` (brainstorm T-13)
16. `checkGrounding sets hash_match to null when stored fingerprint is corrupt (regex mismatch)` (I-3)
17. `computeFileHash returns "sha256:<64hex>" for a known file content (deterministic)` (brainstorm T-14)
18. `computeFileHash rejects non-existent files (throws FileNotFoundError)` (brainstorm T-15)
19. `computeFileHash is deterministic for the same content (call twice, same hash)` (brainstorm T-16)
20. `checkGrounding handles absolute paths (no join with root)` (brainstorm T-17)
21. `checkGrounding handles relative paths (joined with codeContext.root)` (brainstorm T-18)
22. `checkGrounding handles paths with spaces (no quoting issues)` (brainstorm T-19)
23. `checkGrounding handles path traversal (../, defensively)` (brainstorm T-20)
24. `checkGrounding handles non-string evidence_code_ref and evidence_test (defensive null return for both — combines brainstorm T-21 and T-22)` (M-1)
25. `checkGrounding uses injected now() for deterministic checked_at` (brainstorm T-23)
26. `checkGrounding computes duration_ms via injected now() (start/end pair)` (brainstorm T-24)
27. `checkGrounding reads evidence_code_ref from legacy nested evidence.code_ref field` (C-1)
28. `checkGrounding returns minimal grounding for change-log fast path (no evidence_code_ref lookup)` (I-8)

### Tool test list (`__tests__/meta-state-check-grounding-tool.test.js`, 8 tests)

1. `tool reads registry, finds entry by id, calls checkGrounding with loaded codeContext`
2. `tool returns parent's locked shape on a known grounded finding`
3. `tool returns error for missing entry id (entry_not_found)`
4. `tool auto-records code_fingerprint on first call when absent (idempotent on second call)` (M-2)
5. `tool respects run_tests: true and populates test_passed from test runner exit code`
6. `tool respects run_tests: false and sets test_passed to null`
7. `tool appends gate log on every call (success, fast-path, error)` (I-6)
8. `tool returns context_load_failed when resolveRoot() throws`

### Tool test list (`__tests__/meta-state-refresh-fingerprint-tool.test.js`, 2 tests)

1. `tool updates code_fingerprint to current hash and returns status: "refreshed"` (H-1, H-2)
2. `tool returns error when mechanism_check is not true (cannot refresh non-grounded entry)` (H-3, H-4)

### Report tool extension tests (`__tests__/meta-state-report-tool-extension.test.js`, 1 test)

1. `metaStateReportTool stores mechanism_check on the entry when provided` (C-2 mitigation)

### Acceptance tests (`__tests__/sp2-check-grounding-acceptance.test.js`, 2 tests)

1. **Hash mismatch drift detection:** create a temp finding with `mechanism_check: true` + `evidence_code_ref: <temp_file>`; first check records fingerprint; mutate `<temp_file>`; second check returns `status: "drifted"`, `drift_kind: "hash_mismatch"`, `hash_match: false`.
2. **Refresh workflow round-trip:** create a temp finding; check; mutate file; check (drifted); refresh; check again (`status: "grounded"`, `drift_kind: null`); lock in the full workflow.

### Test budget summary

- 28 unit + 8 check-tool + 2 refresh-tool + 1 report-tool-extension + 2 acceptance = **41 new tests**
- 512 existing tests (regression-safety floor) + 41 = **553 total**

## What This Plan Does NOT Do (Out of Scope)

- No SP3 (drift aggregation) — `meta_state_query_drift` is a separate plan.
- No auto-mutation of drifted entries — the check tool only auto-records the fingerprint. The agent decides whether to resolve, refresh, or investigate.
- No cross-file integrity checks (e.g., transitive deps) — only the directly-referenced file is checked.
- No continuous grounding (file watcher / cron) — SP2 is query-only, on-demand.
- No subtype-specific grounding logic — none needed for current 18 entries.
- No hash storage external to the entry — `code_fingerprint` lives on the entry itself.
- No backfill of `agent-manifest.json` for SP0/SP1 (the pre-existing drift is a separate cleanup plan).

## Pre-Plan Verification

The locked design was verified against the actual codebase by a `worker` subagent in the planning session. The verification report (`plans/reports/verification-260603-sp2-design.md`) is the basis for the "Design Clarifications" section above. The verification report identified 2 CRITICAL findings, 4 HIGH findings, and 9 lower-severity findings; all are addressed in this plan directly.

## Success Metrics

- [ ] `pnpm test` passes (full suite, ≥ 553 tests; 512 existing + 41 new)
- [ ] `pnpm validate:records` passes (2 new optional fields don't break existing entries)
- [ ] `pnpm validate:plan-loop` passes
- [ ] Pure function returns the locked shape on all 28 unit tests
- [ ] MCP check tool returns the locked shape on all 8 tool tests
- [ ] MCP refresh tool returns the locked shape on all 2 tool tests
- [ ] Report tool extension test passes (T-33)
- [ ] Acceptance smoke tests pass (hash mismatch + refresh round-trip)
- [ ] **Acceptance test:** temp finding + first check + file mutation + second check → `drifted` end-to-end
- [ ] **Refresh workflow acceptance test:** check → drift → refresh → check → grounded end-to-end
- [ ] **Path semantics:** absolute paths treated as absolute, relative paths joined with `codeContext.root`, non-string inputs handled defensively
- [ ] **Strict equality:** `mechanism_check === true` (not truthy); `mechanism_check: false` / `"true"` / `1` all yield `skipped`
- [ ] **Corrupt fingerprint:** non-matching `code_fingerprint` returns `hash_match: null` (defensive)
- [ ] **Legacy fallback:** `entry.evidence_code_ref ?? entry.evidence?.code_ref` works for 8 of 18 existing findings
- [ ] **Report tool extension:** `metaStateReportTool` accepts and stores `mechanism_check` (C-2)
- [ ] New tools registered in `tools/manifest.json` at the end of the `meta-state-*` group (2 lines)
- [ ] New tools registered in `agent-manifest.json` `meta_state` group (2 entries)
- [ ] `loop_describe({tier: "warm"})` shows both new tools in the MCP tool list

## Risks

| Risk | Mitigation |
|---|---|
| Pure function reads `evidence_code_ref` but legacy entries use nested `evidence.code_ref` (8 of 18 findings) | C-1: function reads `entry.evidence_code_ref ?? entry.evidence?.code_ref`. Unit test T-27 locks in the fallback. |
| `metaStateReportTool` silently drops `mechanism_check` (C-2) | Extend the handler to accept and store `mechanism_check`. Unit test T-33. |
| `codeContext` shape missing `now` injection (C-3) | Extend to `{ root, run_tests?, test_passed?, now?: () => number }`. Unit tests T-25, T-26. |
| Auto-record breaks SP1's "verifier never mutates" promise (D-1) | Document explicitly. SP2's check tool is verifier + first-time recorder. The refresh tool is the explicit mutation tool. |
| `updateEntry` returns `null` on missing id (H-1) | Tool layer catches, logs warning, returns computed `status: "grounded"` without `fingerprint_was_recorded: true`. Unit test T-34. |
| Corrupt `code_fingerprint` (H-2) | Pure function validates against regex; non-matching → `hash_match: null`. Unit test T-31. |
| Refresh tool called on non-grounded entry (H-3) | Return `{ error: "not_grounded", id, mechanism_check, reason }`. No write. Unit test T-26. |
| Refresh tool called when `evidence_code_ref` missing (H-4) | Return `{ error: "code_missing", id, evidence_code_ref }`. No write. Unit test T-27. |
| Path semantics edge cases (M-1) | 4 unit tests (T-20, T-22, T-23, T-24). |
| Auto-record idempotency (M-2) | `fingerprint_was_recorded: true` only on first call. Unit test T-28. |
| Test-runner flakiness (M-4) | Default `run_tests: false`; 30s timeout; mtime-keyed cache. |
| SHA-256 determinism (M-5) | Unit test T-29. |
| `meta-state.jsonl` race condition (M-6) | `enqueue` per-root write queue serializes writes. Optimistic; no CAS. |
| Output shape divergence from SP1 may confuse agents (L-1) | Code comment cross-references SP1's `derivation`. |
| `safeImport` failure on new tool file (L-2) | Unit test the file loads. |
| `mechanism_check === true` strict equality (I-2) | Pure function checks strict equality. Unit test T-30. |
| `refreshed_at` shape unspecified (I-4) | `new Date().toISOString()` (ISO 8601). |
| Auto-record increments `version` by 1 (I-5) | First call: `version` increments. Second call: no mutation. Documented in Phase 2. |
| Gate log line on auto-record path (I-6) | Check tool emits exactly one gate log line per call. Refresh tool emits its own. |
| Change-log fast path applies before `mechanism_check` (I-8) | Pure function checks `entry_kind === "change-log"` first. Unit test T-32. |
| `agent-manifest.json` already drifted (I-13) | Update with 2 new tools. SP0/SP1 backfill is out of scope (separate cleanup). |
| G8 subcommand-class false positive recurs on `ck plan create` | Phase 0 records a fresh meta-state entry documenting the recurrence; smoke test continues to pass. The plan files are scaffolded via the `Create` tool (AGENTS.md fallback). |

## G8 Recurrence Note (Cook-Recorded)

The `ck plan create` invocation during plan creation was blocked by the G8 subcommand-class false positive (verified 2026-06-03). The plan files were scaffolded via the `Create` tool per the SP0/SP1 documented pattern. The cook session should record the recurrence via `mcp__learning_loop_mcp__meta_state_report` using this entry:

```json
{
  "category": "gate-logic-bug",
  "severity": "warning",
  "affected_system": "gate-logic",
  "subtype": "gate-bug",
  "description": "G8 subcommand-class false positive (5th recurrence) hit ck plan create invocation for SP2 plan scaffolding. The pattern 'create|design|new' (subcommand-name + commit-message matching) blocked the command despite the operator's intent being a legitimate plan scaffold. Workaround: scaffold plan files via the Create tool directly. Same as SP0 (4 prior recurrences).",
  "evidence_journal": "plans/260602-sp2-check-grounding/plan.md",
  "evidence_code_ref": "tools/learning-loop-mcp/core/gate-matcher.js",
  "status": "reported"
}
```
