# Code Review — runtime-state ledger vs budget tracking lifecycle

- **Range:** `ffab787..7d217f9` (last 4 commits, 40 files, +1524/−910)
- **Plan:** `plans/260724-1119-runtime-state-ledger-vs-budget-tracking-lifecycle/`
- **Method:** 3 parallel code-reviewer scopes (core / handlers+manifests / tests+docs); top findings independently verified against code by controller.
- **Tests:** reviewers ran vitest on touched suites — 39/39 gate tests, 5/5 new tests, 27+75 cjs suites pass.

## Verdict

**SHIP WITH FIXES** — the kind/status machinery, gate scoping, prune removal, and vnstock collapse are correctly implemented and spec-compliant on most checks. Two integrity gaps in the lifecycle's fail-closed story and one phase-spec requirement silently dropped (R2 preflight TTL) should be fixed or explicitly accepted before merge.

## Critical

None.

## Important

1. **Fail-open at the parse level defeats the R1 fail-closed invariant** — `core/runtime-state.js:41`. `readRuntimeStateRows` does `catch { return null }` on malformed lines; `readBudgetTrackingState` (:314-360) consumes it, so a corrupted stop/pause line is skipped before validation ever runs — a stopped surface silently un-stops on both the gate AND writer paths. The documented invariant ("a stopped surface must not silently un-stop because the parser skipped a malformed line") is only enforced for *parseable* rows with invalid status. Fix: surface malformed-line counts from the JSONL reader (e.g. `{rows, malformed}` or onCorrupt callback) so the budget reader can throw on any dropped line.

2. **Record handler fail-opens on corrupt budget-state read** — `tools/handlers/runtime-state-record-tool.js:84-89`. `isSurfacePaused` throws by design (R1), but the record path catches and sets `surfacePaused = false` ("mirrors inbound-state"). Inbound-state is a read gate (fail-open correct); the record path is the mutation boundary the core module says must fail-closed. One malformed line → a stopped surface accepts new records. Fix: return a structured `corrupt_state` error, or document why record is exempt.

3. **R2 preflight-marker TTL dropped without a recorded decision** — `core/runtime-tracking.js:52-56`. Phase-02 explicitly required: "fix the preflight marker TTL — make it call `readPreflightMarker` (30-min TTL at gate-logic.js:545) OR consume/delete the marker after stop" and its acceptance list says "preflight TTL fixed". Shipped code is still bare `existsSync`, with a comment asserting operator-controlled freshness. This is a phase-spec requirement commented away, not a validated design fork (no D-entry covers it). Fix per phase-02, or record an explicit accepted-risk decision.

4. **D8 one-canonical-id-per-surface not enforced** — `runtime-state-record-tool.js:90`. A second `budget-state` record with a *different* id for the same `affected_system` succeeds while the canonical entity is active (the guard only fires when `id === affected_system`). `readBudgetTrackingState` then resolves surface state latest-fileIdx-wins across all ids (runtime-state.js:353-360), so the newer id silently hijacks the surface lifecycle. Nothing distinguishes "restart after stop" (intended) from "parallel second entity while active". Fix: reject new-id budget-state writes when surface state is not stopped/null — or amend D8 docs to say surface-level latest-wins is intended.

5. **`isSurfacePaused` is surface-level, not per-id as D1 describes** — `core/runtime-state.js:353-360`. Stop-terminal-per-id + restart-by-new-id works only because the restart row is appended later; any late-appended lifecycle row for the old stopped id re-blocks the whole surface. Same root cause as #4; fix together.

## Minor

6. Dead ternary `kind === "ledger-event" ? "active" : "active"` — record-tool.js:106; also no path to record `status:"initial"`. Collapse or implement the mapping.
7. Misleading error payload `{ok:false, paused:true}` when blocked by *stopped* — record-tool.js:94; include actual status.
8. Stop on already-stopped id returns `ok:true, already_stopped:true` (idempotent) while resume/pause-from-stopped error — pick one posture, document.
9. Resume on never-tracked surface (null state) succeeds and creates an active entity — resume-tool.js:42-58; reject null/initial or document.
10. TOCTOU on all three lifecycle tools (state check outside registry lock) — acknowledged in pause comment; single-operator scale makes it acceptable, but "stopped is terminal" is not atomic.
11. Legacy rows without `kind` silently excluded from gate observations — `core/file-readers.js:70`. Fine for this repo (all 34 rows have kind), but `readRuntimeStateRows` runs against arbitrary `GATE_ROOT` repos; a kind-less legacy sidecar goes silent with no warning. Consider missing-kind → budget-state for reads.
12. `appendOrFindDispatchLedgerEvent` (runtime-state.js:103-121) skips `assertKindConditionalStatus` — invariant enforced at one of two append boundaries.
13. Dead code: `atomicRewriteSidecar` (runtime-state.js:129), `RUNTIME_TRACKING_PATH/SCHEMA/VERSION` consts, three no-op sidecar shims that return `[]` unconditionally (would silently lie to a future caller).
14. E2E "row count ≥33" unasserted — `runtime-state-vnstock-collapse-e2e.test.js:120` asserts exactly 22 on a synthetic 20-row fixture; the real 34-row sidecar is never exercised at scale.
15. Stale comments claiming prune exists: `workflow-parity.test.cjs:126,130`, `cold-session-enumerate-mastra.test.cjs:73`, `tool-deletion-coverage.test.js:46`; `docs/loop-engine.md:85` still calls the shipped lifecycle "the open direction".
16. Plan IDs / red-team codes (R5, R8, D8, R13, plan 260724-1119) pervade new code comments and test names — violates the stable-code-artifacts rule; pervasive enough to look like an accepted local convention. Decide either way.
17. Test dead code: unused `expect` import (no-delete-to-clear-gate.test.js:19); imported-then-voided `readRuntimeStateRows` (vnstock-collapse-e2e:132-133).
18. DRY: `readBudgetTrackingState` re-implements the max_by(version)/timestamp/fileIdx dedup from `readRuntimeStateRowsLatest` — filter-then-reuse.

## Verified good

- Gate fail-open vs writer fail-closed split consistent at both read-gate call sites (inbound-state.js:141-145, evaluate-inbound-gate.js:159-166).
- Kind+status filter applied before dedup (R11) at file-readers.js:70 and inbound-state.js getSidecar; ledger-event fully out of the stale scan.
- vnstock collapse non-destructive: 34 rows (≥33), all 21 vnstock-system ledger rows + colliding re-pin preserved; canonical row is id `vnstock`, `status:"stopped"`, not the colliding id.
- `assertKindConditionalStatus` enforced at the real mutation boundary, not a Zod refine (R3 lesson applied).
- Regression guard uses `>=` non-decreasing row count with the public pause tool as lever (R8).
- The 6 flagged assertion flips are fixture re-types (ledger-event → budget-state) preserving original assertions; the one genuine inversion is correct under new semantics and documented.
- Prune fully removed from all live surfaces (manifests, CLI_WRITE_TOOLS, hooks, docs); remaining hits are historical.
- docs/runtime-contract.md L2 lifecycle matches implementation; architecture.md flipped off "open design".

## Open questions for the operator

1. Findings 1-3: fix now, or record explicit accepted-risk decisions? #3 in particular reverses a phase-spec requirement without a validation-log entry.
2. Findings 4-5: is surface-level latest-wins the intended semantic (amend D1/D8 docs), or should record enforce one live canonical id per surface?
3. Idempotent stop (finding 8): intended contract?
