# Cook completion — Vitest recurrence telemetry and unexpected-match classification

**Plan:** `plans/260809-1538-vitest-recurrence-telemetry-and-unexpected-match-classification/`
**Date:** 2026-08-09
**Mode:** auto (no human review gates) — but the MANDATORY code-review gate caught 2 critical defects that were fixed and re-reviewed before handoff.
**Status:** ALL PHASES COMPLETE — full suite 3352 passed / 4 skipped / 0 failed.

## Summary

Repaired the L2 event contract behind the Vitest recurrence finding. A promoted-rule match is now deterministic gate telemetry; only an evaluator-proven `unexpected-match` event (inert-data origin + trusted producer marker) enters automatic `recurring-false-positive` recurrence filing. The gate and tracker share a pure mode-aware command-classification substrate (`core/command-classification.js`).

## What shipped (by phase)

| Phase | Deliverable | Result |
|---|---|---|
| 1 | RED contract baseline + regression matrix | 15 RED assertions across 5 test files; event vocabulary frozen; effective-rule (v0/v1/v2 → v2) noted for Phase 5 |
| 2 | `core/command-classification.js` pure classifier | 39 tests; gate/recurrence/event modes; dual-view inert-span provenance; fail-closed (`classification_error` → unknown/unclassified, never throws) |
| 3 | Evaluator provenance + decision telemetry | `applyPromotedRules` returns `event_source`/`match_origin`/`candidate_kind`; separate `ok`+`unexpected-match` non-permission telemetry; decision-log serializes optional provenance; toolchain tagged `toolchain-failure-capture`; RED dropped 15 → 11 |
| 4 | Recurrence candidate filtering | `isUnexpectedMatchCandidate` (exact trio) + `isRecurrenceGroupableEntry` partitioner; cross-surface disagreement fails closed; `privacySafeSample` (hash-only); 11 RED → 0; toolchain branch unchanged |
| 5 | Contract drift + cross-surface validation | `test-output-contract-drift.test.cjs` (16 tests); projection parity byte-identical; Mastracode pull-only asserted; effective rule v2 confirmed; `docs/loop-engine.md` corrected (2 stale statements) |

## Critical review cycle (2 defects caught and fixed)

1. **Telemetry short-circuit masked real violations** (R1-D1): `return prov` on the first inert match exited the rule loop → a real violation from a later rule was allowed. Fixed with `pendingTelemetry` deferral to after the loop; real escalate wins inline.
2. **Forgeable decision-log rows** (R1-D2 + R2-NEW-1): `.gate-decision.log` was not a gated path, so bash commands AND Write/Edit tools could append forged producer-trio rows the tracker trusts. Fixed both seams: per-surface bash patterns (`DECISION_LOG_WRITE_PATTERNS`, dedicated reason, path-variant coverage) and a write-gate `decision-log` rule (`DECISION_LOG_PATHS`).
3. **LOW cleanups** (R2): unused `matched` param removed; stale "RED" test comment updated; conservative over-match documented.

## Verification

- Full project suite: **3352 passed | 4 skipped | 0 failed** (re-run independently at least 4× across the review cycle).
- 11 originally-RED recurrence-eligibility tests GREEN; positive pins (explicit unexpected-match → 1 finding; toolchain → 1 finding) GREEN.
- Runtime-agnostic audit: 6/6 on `command-classification.js` and `recurrence-tracker.js`.
- Drift test proves package scripts / JSON reporter / parser exit codes / effective rule / canonical hint contract agree; Mastracode pull-only.

## Files changed (git)

- 18 modified + 9 new (see `git status`). Key new: `core/command-classification.js`, `core/command-classification.test.js`, `__tests__/legacy-mcp/command-classification-contract.test.js`, `__tests__/test-output-contract-drift.test.cjs`.
- Reports: 5 phase reports + this completion report in `plans/reports/fullstack-phase{1..5}-260809-1656-*.md`.
- Docs: `docs/loop-engine.md` (2 stale unconditional-recurrence statements corrected).

## Unresolved / deferred

- None within this plan's scope. The 3 remaining `rule-no-raw-stdout-vitest` registry rows (v0/v1/v2) are legitimate versioned history; the drift test resolves through canonical max-version and reports disagreement without suppressing.
