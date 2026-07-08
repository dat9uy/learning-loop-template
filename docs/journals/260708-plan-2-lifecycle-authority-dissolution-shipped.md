# Plan 2: Lifecycle authority dissolution — Shipped 2026-07-08

## Scope

- Dissolved per-invocation `OPERATOR_MODE` env-var authority gate into once-per-session `LOOP_SESSION_MODE=live|autonomous` (default `autonomous`, fail-closed).
- 3 class-approval tools refuse with `live_session_required` when unset/`autonomous`; succeed when `live`:
  - `meta_state_promote_rule`
  - `meta_state_supersede`
  - `meta_state_dispatch_finding` (commit stage)
- Open tools (`resolve` / `re_verify` / `archive` / `report` / `log_change` / `propose_design` / `patch`) unchanged — no new gate.
- Created `tools/lib/session-mode.js` (one shared `isLiveSession()` helper, imported via `#lib/session-mode.js`).
- Migrated 8 test files (env sets: `OPERATOR_MODE=1` → `LOOP_SESSION_MODE=live`; refusal assertions: `operator_role_required` → `live_session_required`).
- Updated 3 comment/prompt strings (`runtime-state-record-tool.js:9`, `core/runtime-state.js:13`, `core/loop-introspect.js:258` Rec 10 dispatch protocol prompt).
- Added `__tests__/lib/session-mode.test.js` (8 boundary cases: unset / `autonomous` / `live` / empty / case-variants / legacy truthy / garbage / teardown restore).

## Verification

- New unit test: 8/8 pass.
- 5 focused gated-tool tests green (`meta-state-promote-rule-rule-entry`, `integration-promoted-rule`, `meta-state-dispatch-finding-tool`, `meta-state-dispatch-ttl-and-close-flow`, `meta-state-stale-flag`).
- Full legacy-mcp suite: 1078 pass / 0 fail / 1 skip.
- `__tests__/lib/` suite (gate-logging + session-mode): 14/14 pass.
- Grep audit clean: `OPERATOR_MODE` zero in source + test surface; `operator_role_required` zero; `isLiveSession` exactly 3 imports + 3 call sites in the 3 gate-site files (helper lives in `tools/lib/`).

## SP2 fingerprint drift handling

Editing `loop-introspect.js` (Rec 10 prompt string), `meta-state-promote-rule-tool.js`, and `meta-state-supersede-tool.js` invalidated the SHA-256 fingerprint baseline in `file-index.jsonl` for those paths. The cold-tier regression test pinned 3 open findings (`mechanism_check: true`) to those paths and failed with `drift_kind=hash_mismatch`. Resolution: 3 calls to `meta_state_refresh_file_index` re-grounded the affected findings (1 each). This is the canonical O(1)-per-file-change operator flow documented in the SP2 design — no test weakened, no finding cascade-closed.

## Acceptance criteria

- [x] `OPERATOR_MODE` absent from gate sites + test files (only intentional test-descriptions in `session-mode.test.js` asserting back-compat refusal).
- [x] `LOOP_SESSION_MODE=autonomous`/unset → 3 gated tools return `live_session_required`.
- [x] `LOOP_SESSION_MODE=live` → 3 gated tools succeed.
- [x] Open tools unchanged.
- [x] No grant machinery; `*_by`/`*_at` fields unchanged.
- [x] Full suite green; no test weakened.

## Design surface

- Tracker: `plans/reports/from-problem-solving-to-plan-split-260707-0812-rec12-lifecycle-pr-tracker-report.md` (Plan 2 of 4).
- Design source: `plans/reports/brainstorm-260706-0958-record-lifecycle-authority-redesign-report.md` (P3 + Q11).
- Resolved questions (Validation Session 1): helper location = `tools/lib/` via `#lib/`; reason rename = `live_session_required`; accepted value = strict `=== "live"` (clean break from `OPERATOR_MODE`).
- Dependency: Plan 1 (`260707-0812-lifecycle-status-stale-mechanism`, shipped PR #38). Plan 2 uses the new `open` status model but does not overlap Plan 1 files.

## Next plans

- Plan 3 (Rec 12 L1 trigger + symmetry): comment-aware updates referring to this authority result; `log_change` is trigger-gated, not authority-gated.
- Plan 4 (Rec 12 closed loop (b)+(c)): surfaces symmetric bookkeeping.