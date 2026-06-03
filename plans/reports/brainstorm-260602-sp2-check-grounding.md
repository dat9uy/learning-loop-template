---
date: "2026-06-03T11:00:00Z"
status: locked
tags: [brainstorm, meta, meta-state, agent-affordances, mcp-tools, sp2, grounding, hash, drift, verifier]
related:
  - plans/reports/brainstorm-260602-meta-state-agent-affordances.md (parent design — SP0-SP3 decomposition)
  - plans/reports/brainstorm-260602-sp0-log-change.md (SP0 — shipped)
  - plans/reports/brainstorm-260602-sp1-derive-status.md (SP1 — shipped)
  - plans/260602-sp0-log-change/plan.md (SP0 plan — pattern reference)
  - plans/260602-sp1-derive-status/plan.md (SP1 plan — pattern reference)
  - tools/learning-loop-mcp/core/derive-status.js (SP1 sibling)
  - tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js (SP1 sibling tool)
  - tools/learning-loop-mcp/core/meta-state.js (META_STATE_FINDING_CATEGORIES export, schemas)
  - tools/learning-loop-mcp/core/slugify.js (SP0 extracted util)
  - tools/learning-loop-mcp/tools/meta-state-list-tool.js (entry_kind filter — sibling tool)
  - tools/learning-loop-mcp/tools/meta-state-log-change-tool.js (SP0 sibling tool)
  - tools/learning-loop-mcp/lib/gate-logging.js (gate log pattern)
  - tools/learning-loop-mcp/lib/resolve-root.js (root resolution)
  - meta-state.jsonl (18 finding entries + 1 change-log entry from SP0)
  - plans/260602-sp2-check-grounding/plan.md (to be created on plan handoff)
supersedes: []
source: brainstorm-session
---

# SP2 Design — `meta_state_check_grounding` (Grounding Check)

> **Status: Locked 2026-06-03.** Operator approval received in the SP2 brainstorm session (this report).
>
> **Scope of this report:** SP2 only. SP0 (self-modification) and SP1 (derivation query) are shipped; SP3 (drift query) is designed in the parent doc and not part of this report.
>
> **No code, no registry edits, no plan invocation in the brainstorm session that produced this doc.** Implementation happens via a follow-up `/ck:plan --tdd` consuming this report.

## Context

The parent doc (`brainstorm-260602-meta-state-agent-affordances.md`) decomposes the "agent self-management of meta-state" question into 4 sub-projects:

- **SP0: Self-modification affordance** — *shipped* (see `plans/260602-sp0-log-change/plan.md`)
- **SP1: Derivation query** — *shipped* (see `plans/260602-sp1-derive-status/plan.md`); 512 tests passing
- **SP2: Grounding check** — *this report* (design locked 2026-06-03; pending plan)
- SP3: Drift query (`meta_state_query_drift`) — not started

**Build order rationale (from parent doc):** SP2 depends on SP1's `signals.test_passed` field. SP3 aggregates SP1 + SP2 results. SP2 ships between them.

## Problem Statement

The agent can now derive an entry's status via SP1 (file existence, test existence). But **derivation is shallow** — it cannot detect that a referenced mechanism *changed in place*. A finding with `evidence_code_ref: "tools/learning-loop-mcp/lib/source-ref-validator.js"` returns `kind: "mechanism-shipped"` both when the file was last touched yesterday and when the file was last touched two months ago (when the finding was created).

SP2 closes this gap. The agent can ask "is the mechanism this entry references still live?" — file exists, **hash matches the snapshot at last check**, tests pass. Hash mismatch = **drift**. The agent decides what to do with the answer (refresh the fingerprint, resolve the entry, investigate).

**Acceptance criterion (end-to-end on 1 known finding):** Given a finding with `mechanism_check: true` and `evidence_code_ref: <file>`:

1. First `meta_state_check_grounding` call → computes SHA-256 of `<file>`, writes it to the entry as `code_fingerprint`, returns `status: "grounded"`, `fingerprint_was_recorded: true`.
2. Edit `<file>` (mutate bytes, keep path).
3. Second `meta_state_check_grounding` call → computes new SHA-256, compares to stored `code_fingerprint`, **mismatch** → returns `status: "drifted"`, `hash_match: false`, `drift_kind: "hash_mismatch"`.
4. Agent calls `meta_state_refresh_fingerprint({ id })` → updates `code_fingerprint` to the new hash, returns `status: "refreshed"`, `code_fingerprint: "sha256:<new>"`.
5. Third `meta_state_check_grounding` call → hash matches → `status: "grounded"`, `drift_kind: null`.

This is the canonical "legitimate code change" workflow. The user (during brainstorm) explicitly surfaced this gap and asked which function would update the hash to resolve the hash mismatch — the answer is a separate `meta_state_refresh_fingerprint` tool, not a parameter on the check tool, because:

- **Separation of concerns:** check is a verifier (read + idempotent first-time record); refresh is a state mutation. Two gate-log events surface both, making the audit trail clearer.
- **Discoverability:** the refresh tool shows up in `loop_describe({tier: "warm"})`. The agent can find it without already knowing the parameter name.
- **Refactor pattern alignment:** the SP0/SP1 pattern is one tool per concern. Coupling check + refresh into one tool with a parameter would break the pattern.

## Evaluated Approaches

### Approach A — Two tools: check + refresh, with auto-record on first check (CHOSEN)

- `meta_state_check_grounding({ id, run_tests? })` — pure-function core (`checkGrounding`); auto-records `code_fingerprint` only when absent + `mechanism_check: true` + file exists. Returns drift on subsequent calls when hash mismatches.
- `meta_state_refresh_fingerprint({ id })` — explicit mutation; updates `code_fingerprint` to the current hash of `evidence_code_ref`. Idempotent.

**Pros:** Clear separation (verifier vs mutator). Both tools discoverable. Audit log shows distinct events. Both write to gate log. Pattern mirrors SP0 (one tool per concern).
**Cons:** Two tools to maintain. Mitigated: the second tool is a thin wrapper around the existing `updateEntry` (no new core logic).

### Approach B — One tool with `refresh: true` parameter (REJECTED)

`meta_state_check_grounding({ id, run_tests?, refresh? })` — when `refresh: true`, updates the fingerprint after computing.

**Pros:** Single tool, fewer surface area.
**Cons:** Check and refresh are semantically distinct. Coupling them hides the mutation from the discoverable surface. Gate log shows mixed check/refresh events without clear delineation. Breaks the SP0/SP1 one-tool-per-concern pattern.

### Approach C — Always-on grounding (no opt-in) (REJECTED)

All findings with `evidence_code_ref` get grounded automatically. No `mechanism_check` field.

**Pros:** Simpler schema.
**Cons:** Contradicts the parent doc's rationale ("opt-in because running the full test suite on every check is too slow"). Couples SP2 to all findings, including the 8 legacy entries that use the nested `evidence.code_ref` shape (per SP1's C-1 mitigation). High cost for low value (most findings don't need hash check).

### Approach D — Strictly read-only check (no auto-record) (REJECTED)

`meta_state_check_grounding` never writes. Agent must call a separate `meta_state_record_fingerprint` before the first check.

**Pros:** Verifier is purely read-only.
**Cons:** High friction. The agent must make two tool calls for the first check (record, then check). The `code_fingerprint` field is meant to be a passive snapshot; auto-recording on first check is the natural model. The "read-only verifier" principle applies to the *check* operation, not the *fingerprint record* operation. The record is a side effect of the agent's opt-in to grounding.

## Final Design (Locked)

### Architecture

```
core/check-grounding.js                              [NEW] pure function, no subprocess
  - checkGrounding(entry, codeContext) -> GroundingResult
  - computeFileHash(absPath) -> "sha256:<64hex>"
  - computeStatus(present, hashMatch, testPass) -> Status
  - computeDriftKind(status, hashMatch, testPass) -> DriftKind | null
  - META_STATE_GROUNDING_STATUSES                     [export] 4-value source-of-truth array
  - META_STATE_GROUNDING_DRIFT_KINDS                  [export] 3-value source-of-truth array
  - TERMINAL_HASH_REGEX                              [internal] /^sha256:[a-f0-9]{64}$/

tools/meta-state-check-grounding-tool.js             [NEW] MCP wrapper for the check
  - Loads codeContext from resolveRoot() + process.env
  - Computes test_passed via subprocess + cache (same as SP1) when run_tests: true
  - Calls checkGrounding(entry, codeContext)
  - Auto-records code_fingerprint on the entry when absent + mechanism_check: true + file exists
  - Returns parent's locked shape
  - Appends gate log on every call

tools/meta-state-refresh-fingerprint-tool.js         [NEW] MCP wrapper for the refresh
  - Loads entry from registry
  - Computes current SHA-256 of evidence_code_ref
  - Calls updateEntry(root, id, { code_fingerprint: "sha256:<new>" })
  - Returns { id, code_fingerprint, refreshed_at, status: "refreshed" }
  - Appends gate log on every call

__tests__/check-grounding.test.js                    [NEW] pure function unit tests (24)
__tests__/meta-state-check-grounding-tool.test.js    [NEW] MCP tool tests (8)
__tests__/meta-state-refresh-fingerprint-tool.test.js [NEW] MCP tool tests (2)
__tests__/sp2-check-grounding-acceptance.test.js     [NEW] acceptance smoke tests (2)

tools/manifest.json                                  [MODIFIED] 2 new lines in meta-state-* group
```

### Locked Decisions

1. **Schema addition:** two new optional fields on `metaStateFindingEntrySchema`:
   - `mechanism_check: z.boolean().optional().describe("Opt-in flag: include this finding in grounding checks. Default false. When true, checkGrounding computes and stores a SHA-256 fingerprint of evidence_code_ref.")`
   - `code_fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional().describe("SHA-256 of the file at evidence_code_ref at the time of last successful check. Set by SP2 on first check; updated by meta_state_refresh_fingerprint on explicit refresh.")`
2. **No "evidence" prefix on new fields:** the entry schema already has `evidence_journal`, `evidence_code_ref`, `evidence_test`. To avoid collision with the `records/meta/evidence/` artifact directory and the SP1 `signals` rename, new SP2 fields use no `evidence_` prefix. The rename is documented in the schema description.
3. **Pure function signature:** `checkGrounding(entry, codeContext) -> GroundingResult`. `codeContext` = `{ root: string, run_tests?: boolean, test_passed?: boolean | null }`. Default `run_tests: false`. The function does NOT call `updateEntry`; fingerprint auto-record is tool-layer concern.
4. **Output shape (check tool):**
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
5. **Status logic (4 values):**
   - `skipped` — `mechanism_check !== true` (opt-out path; tool returns early)
   - `unknown` — `mechanism_check: true` but `evidence_code_ref` is not set (no signal to ground on)
   - `grounded` — code_ref exists AND (no `code_fingerprint` recorded OR hash matches) AND (no test specified OR test passed)
   - `drifted` — code_ref missing OR hash mismatch OR (test specified AND test failed)
6. **Drift kind logic (3 values):**
   - `null` — when `status: "grounded"` or `skipped` or `unknown`
   - `code_missing` — when `code_ref_exists: false`
   - `hash_mismatch` — when `code_ref_exists: true` AND `code_fingerprint` set AND hashes differ
   - `test_failed` — when `code_ref_exists: true` AND (no hash_mismatch) AND `tests_run: true` AND `test_passed: false`
7. **Fingerprint auto-record (tool-layer):** when `mechanism_check: true` AND `evidence_code_ref` exists AND `code_fingerprint` is not set AND the file exists → call `updateEntry(root, id, { code_fingerprint: "sha256:<hash>" })` (via the existing registry write queue). Set `fingerprint_was_recorded: true` in the response. This is the only mutation `meta_state_check_grounding` performs.
8. **Refresh tool (separate):** `meta_state_refresh_fingerprint({ id })`:
   - Loads entry from registry; errors if not found.
   - Errors if `mechanism_check !== true` (can't refresh a non-grounded entry).
   - Errors if `evidence_code_ref` is not set.
   - Computes current SHA-256 of the file.
   - Errors if file is missing.
   - Calls `updateEntry(root, id, { code_fingerprint: "sha256:<hash>" })`.
   - Returns `{ id, code_fingerprint, refreshed_at, status: "refreshed" }`.
   - Appends gate log line: `{ tool: "meta_state_refresh_fingerprint", id, code_fingerprint }`.
9. **Test-runner integration:** opt-in via `run_tests` (default false). When true and `entry.evidence_test` is set, spawn `pnpm test -- <test_file>` (same subprocess pattern as SP1, same per-process mtime-keyed cache).
10. **Change-log entries:** skipped (return `status: "skipped"`, `grounding: { checked_at, duration_ms }` only). Same pattern as SP1's `no-signals` fast path.
11. **No auto-resolve:** SP2 only reports grounding status. The agent (or `meta_state_resolve`) decides.
12. **Backward compat:** adds 2 new optional fields to the existing schema. The 18 existing entries load unchanged (new fields are `undefined`). The 512 existing tests must continue to pass.
13. **No new npm dependencies:** use only `node:crypto`, `node:fs`, `node:path`, `node:child_process` (built-ins). SHA-256 via `crypto.createHash("sha256")`.

### The "Legitimate Code Change" Workflow

The user (during brainstorm) explicitly asked: "If we go to the auto-record on first check direction, what if the underlying code change? How the workflow solved that? And which function has the functionality to update the hash to resolve the hash mismatched?"

**Answer (locked):**

```
Step 1: Create finding with mechanism_check: true
        (via existing meta_state_report)

Step 2: First check
        meta_state_check_grounding({ id })
          → computes hash, stores as code_fingerprint (auto-record)
          → returns status: "grounded", fingerprint_was_recorded: true

Step 3: Code evolves (legitimate refactor of the mechanism)
        (someone edits the file at evidence_code_ref)

Step 4: Second check
        meta_state_check_grounding({ id })
          → computes new hash, compares to stored fingerprint
          → mismatch → status: "drifted", drift_kind: "hash_mismatch"

Step 5: Agent decides:
        (a) Drift is bad — mechanism was removed
            → leave fingerprint stale
            → call meta_state_resolve({ id, resolution: "..." })
        (b) Drift is good — mechanism evolved but still ships
            → call meta_state_refresh_fingerprint({ id })
              → updates code_fingerprint to current hash
              → returns status: "refreshed"

Step 6: Third check (confirms refresh worked)
        meta_state_check_grounding({ id })
          → hash now matches
          → status: "grounded", drift_kind: null
```

The two tools (`check` + `refresh`) are kept separate because:
- **Discoverability:** the refresh tool shows up in `loop_describe({tier: "warm"})`. The agent can find it without knowing the parameter name.
- **Audit clarity:** the gate log shows distinct check and refresh events. The two operations are different in intent (verifier vs mutator).
- **Pattern alignment:** the SP0/SP1 pattern is one tool per concern. Coupling check + refresh would break the pattern.

### Test Plan (36 new tests; mirrors SP1 structure)

**`__tests__/check-grounding.test.js` (24 unit tests, no subprocess for hash; mock filesystem for path):**

1. `checkGrounding returns status: "skipped" when mechanism_check is not true`
2. `checkGrounding returns status: "unknown" when mechanism_check is true but evidence_code_ref is not set`
3. `checkGrounding returns status: "grounded" when code_ref exists and no fingerprint recorded`
4. `checkGrounding returns status: "grounded" when code_ref exists, fingerprint matches`
5. `checkGrounding returns status: "drifted" with drift_kind: "code_missing" when file is missing`
6. `checkGrounding returns status: "drifted" with drift_kind: "hash_mismatch" when fingerprint differs`
7. `checkGrounding returns status: "grounded" when test passed (run_tests: true, evidence_test set, exit 0)`
8. `checkGrounding returns status: "drifted" with drift_kind: "test_failed" when test fails`
9. `checkGrounding sets test_passed to null when run_tests is false`
10. `checkGrounding sets test_passed to boolean when run_tests is true and test runner spawned`
11. `checkGrounding handles change-log fast path (status: "skipped", no grounding computation)`
12. `checkGrounding sets hash_match to null when fingerprint is not yet recorded (first check)`
13. `checkGrounding sets hash_match to null when evidence_code_ref is not set (no comparison possible)`
14. `computeFileHash returns "sha256:<64hex>" for a known file content (deterministic)`
15. `computeFileHash rejects non-existent files (throws FileNotFoundError)`
16. `computeFileHash is deterministic for the same content (call twice, same hash)`
17. `checkGrounding handles absolute paths (no join with root)`
18. `checkGrounding handles relative paths (joined with codeContext.root)`
19. `checkGrounding handles paths with spaces (no quoting issues)`
20. `checkGrounding handles path traversal (../, defensively)`
21. `checkGrounding handles non-string evidence_code_ref (defensive null return)`
22. `checkGrounding handles non-string evidence_test (defensive null return)`
23. `checkGrounding uses injected now() for checked_at (deterministic timestamp)`
24. `checkGrounding computes duration_ms via injected now() (start/end pair)`

**`__tests__/meta-state-check-grounding-tool.test.js` (8 tool tests, mock filesystem + subprocess):**

1. `tool reads registry, finds entry by id, calls checkGrounding with loaded codeContext`
2. `tool returns parent's locked shape on a known grounded finding`
3. `tool returns error for missing entry id (entry_not_found)`
4. `tool auto-records code_fingerprint on first call when absent (idempotent on second call)`
5. `tool respects run_tests: true and populates test_passed from test runner exit code`
6. `tool respects run_tests: false and sets test_passed to null`
7. `tool appends gate log on every call (success, fast-path, error)`
8. `tool returns context_load_failed when resolveRoot() throws`

**`__tests__/meta-state-refresh-fingerprint-tool.test.js` (2 tool tests):**

1. `tool updates code_fingerprint to current hash and returns status: "refreshed"`
2. `tool returns error when mechanism_check is not true (cannot refresh non-grounded entry)`

**`__tests__/sp2-check-grounding-acceptance.test.js` (2 acceptance smoke tests):**

1. **Hash mismatch drift detection:** create a temp finding with `mechanism_check: true` + `evidence_code_ref: <temp_file>`; first check records fingerprint; mutate `<temp_file>`; second check returns `status: "drifted"`, `drift_kind: "hash_mismatch"`, `hash_match: false`.
2. **Refresh workflow round-trip:** create a temp finding; check; mutate file; check (drifted); refresh; check again (`status: "grounded"`, `drift_kind: null`); lock in the full workflow.

**Test budget:** 36 new tests + 512 existing tests = **548 total** (target).

### Tool Identity (locked)

| Tool | Role | Side effects | Idempotency |
|---|---|---|---|
| `meta_state_check_grounding` | agent-callable | appends gate log; auto-records `code_fingerprint` only when absent | check is idempotent; auto-record is first-call-only |
| `meta_state_refresh_fingerprint` | agent-callable | appends gate log; calls `updateEntry` to set `code_fingerprint` | always writes (each call updates to current hash) |

### What SP2 Does NOT Do (Out of Scope)

- **SP3 (drift aggregation)** — separate brainstorm; SP3 calls `checkGrounding` for many entries to find drift patterns.
- **Auto-mutation of drifted entries** — the check tool never calls `meta_state_resolve`. The agent decides.
- **Cross-file integrity checks** (e.g., transitive deps) — only the directly-referenced file is checked.
- **Continuous grounding** (file watcher / cron) — SP2 is query-only, on-demand.
- **Subtype-specific grounding logic** — none needed for current 18 entries.
- **Hash storage external to the entry** — `code_fingerprint` lives on the entry itself; no parallel `records/meta/grounding/` directory.

### Success Metrics

- [ ] `pnpm test` passes (≥ 548 tests; 512 existing + 36 new)
- [ ] `pnpm validate:records` passes (new optional fields don't break existing entries)
- [ ] `pnpm validate:plan-loop` passes
- [ ] Acceptance test: temp finding + first check + file mutation + second check → `drifted` end-to-end
- [ ] Refresh workflow acceptance test: check → drift → refresh → check → grounded end-to-end
- [ ] New tools registered in `tools/manifest.json` in the `meta-state-*` group (2 lines)
- [ ] `loop_describe({tier: "warm"})` shows both new tools

### Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Adding schema fields breaks legacy 18 entries (none have `mechanism_check` or `code_fingerprint`) | Both fields are `z.optional()`. Existing entries load with `undefined` values. Unit test verifies all 18 existing entries can still be read after the schema change. |
| Auto-record of `code_fingerprint` is a write in a "verifier" tool | Documented explicitly in the tool's description. The alternative (require the agent to record the fingerprint manually) is more friction. Auto-record is idempotent — second call does not re-write. |
| SHA-256 computation slow for large files | SHA-256 of typical source files (10-50KB) is < 1ms. No streaming needed. Unit test verifies sub-100ms on 1MB file (T-24). |
| `code_fingerprint` regex format drift | Locked to `^sha256:[a-f0-9]{64}$` (canonical hex). Unit test verifies rejection of non-canonical formats. |
| `meta_state_refresh_fingerprint` accidentally called on a non-grounded entry | Tool returns structured error: `{ error: "not_grounded", id, mechanism_check, reason: "mechanism_check is not true; nothing to refresh" }`. No write. |
| `meta_state_refresh_fingerprint` called on a missing file | Tool returns structured error: `{ error: "code_missing", id, evidence_code_ref }`. No write. |
| Test-runner flakiness | Same as SP1: `run_tests: false` default; cache + 30s timeout. |
| Subprocess timeout (large test suite) | 30s timeout, same as SP1. For test suites > 30s, agent should run them out-of-band. |

## Cross-Plan Dependencies

| Relationship | Plan | Status | Note |
|---|---|---|---|
| Builds on | SP1 (`260602-sp1-derive-status`) | **completed** | SP2 reads `signals.test_passed` (the pure function passes it through; SP2's tool computes it). |
| Builds on | `260602-sp0-log-change` | **completed** | Provides the discriminated union (`entry_kind`) and the registry write queue pattern. |
| Builds on | `260602-self-enforcing-loop` | **completed** | Provides the existing `meta_state_*` tools and the `loop_describe` contract. |
| Required for (future) | SP3 drift aggregation | not started | SP3 calls `checkGrounding` for many entries to find drift patterns. |
| Required for (future) | `meta_state_resolve` integration with grounding | not started | A future plan may make `meta_state_resolve` warn when grounding disagrees with the asserted status. |

## Open Questions Resolved This Session

1. **Q1 (output shape):** New MCP tool + pure function, mirrors SP1. **Resolved.**
2. **Q2 (acceptance test):** 1 hash-mismatch case on a real finding. **Resolved.**
3. **Q3 (out of scope):** SP3 (drift aggregation) is separate. SP2 stops at per-entry grounding. **Resolved.**
4. **Q4 (constraints):** TDD structure mirrors SP1; no new npm deps; SHA-256; `core/check-grounding.js`. **Resolved.**
5. **Q5 (schema field):** `mechanism_check: true` (boolean opt-in) + `code_fingerprint: string` (recorded SHA-256). No `evidence_` prefix (per operator correction). **Resolved.**
6. **Q6 (test format):** 1 hash-mismatch acceptance test + 1 refresh round-trip acceptance test. **Resolved.**
7. **Q7 (cache):** Per-process mtime-based cache, same as SP1. **Resolved.**
8. **Q8 (tool surface):** `meta_state_check_grounding({ id, run_tests? })`. **Resolved.**
9. **Q9 (status enum):** 4 values: `grounded` | `drifted` | `unknown` | `skipped`. **Resolved.**
10. **Q10 (drift recovery workflow):** Surface raised by operator during brainstorm. Resolved by adding a separate `meta_state_refresh_fingerprint` tool (Approach A, rejected B/C/D). **Resolved.**

## Next Steps

1. Plan handoff via `/ck:plan --tdd` (deferred to a future session; this session ends here)
2. Plan phases: 0 = scaffolding, 1 = pure function (24 tests), 2a = check tool (8 tests), 2b = refresh tool (2 tests), 3 = manifest registration (2 lines), 4 = acceptance tests (2)
3. Red-team review after plan creation, before cook
4. Cook via `/ck:cook plan.md`
5. First real use: run `meta_state_check_grounding` on a finding with `evidence_code_ref` to demonstrate the workflow

## References

### Internal Design Artifacts

- `plans/reports/brainstorm-260602-meta-state-agent-affordances.md` — parent doc, SP2 section (now superseded by this report)
- `plans/reports/brainstorm-260602-sp1-derive-status.md` — SP1 dedicated design (locked, shipped)
- `plans/reports/brainstorm-260602-sp0-log-change.md` — SP0 dedicated design (locked, shipped)
- `plans/260602-sp1-derive-status/plan.md` — SP1 plan (pattern reference)
- `plans/260602-sp0-log-change/plan.md` — SP0 plan (pattern reference)
- Pattern 2 (verifier > generator): parent doc, lines 49-54
- YAGNI/KISS/DRY: brainstorm skill core principles

### Code References

- `tools/learning-loop-mcp/core/derive-status.js` — SP1 sibling pure function (architecture reference)
- `tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js` — SP1 sibling tool (wrapper pattern reference)
- `tools/learning-loop-mcp/core/meta-state.js` — registry source of truth, `updateEntry` write queue, `metaStateFindingEntrySchema` (the schema that gets 2 new optional fields)
- `tools/learning-loop-mcp/core/slugify.js` — shared slugify helper
- `tools/learning-loop-mcp/tools/meta-state-list-tool.js` — entry_kind filter (sibling tool)
- `tools/learning-loop-mcp/tools/meta-state-log-change-tool.js` — SP0 sibling tool
- `tools/learning-loop-mcp/lib/gate-logging.js` — `appendGateLog` (gate log pattern)
- `tools/learning-loop-mcp/lib/resolve-root.js` — `resolveRoot` (root resolution)
- `meta-state.jsonl` — 18 finding entries + 1 change-log entry as of 2026-06-03
