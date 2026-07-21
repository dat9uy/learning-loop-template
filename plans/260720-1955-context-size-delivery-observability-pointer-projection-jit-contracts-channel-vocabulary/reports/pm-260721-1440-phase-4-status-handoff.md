# Project status — Phase 4 handoff

**Date:** 2026-07-21 14:40 (Asia/Bangkok)
**Plan:** plans/260720-1955-context-size-delivery-observability-pointer-projection-jit-contracts-channel-vocabulary/
**Branch:** plan-260721-sessionstart-steering-injection-is-push-dependent-and-silent
**Status:** in-progress (4 of 6 phases complete; 1 known test failure; 2 phases remaining)

## Plan phases

| # | Phase | Status | Notes |
|---|---|---|---|
| 1 | Baseline measurement + tests-before | complete | `measure-context-surfaces.mjs` shipped; `reports/baseline-260720-measurements.md` written. |
| 2 | MCP wire slimming (JIT + glossary) | complete | Manifest tool portion 39,905 bytes (was 67,255B). `mcp-wire-budget.test.js` green. |
| 3 | SessionStart hint pointer projection | complete | Hook combined output 5,120 chars (was 13,088). Both `.claude` hooks emit pointers + pull-path header. |
| 4 | Delivery classifier + inbound-gate pull pointer | partial | `delivery-classify.mjs` + inbound-gate once-per-session emit shipped. One cross-surface test failure (test-side fix needed). |
| 5 | Docs — channel vocabulary promotion (L2 → merged table) | not started | `docs/architecture.md` needs the channel column; `mcp-tool-schema-architecture.md` needs the JIT section; `loop-engine.md` one cross-ref line. |
| 6 | Verification — measurement harness re-run + hard budgets | not started | Final verification report at `reports/verification-260720-final.md`; loop bookkeeping (resolve finding, log change-log, relationship note on constraint finding). |

## What landed in this session

- `tools/scripts/measure-context-surfaces.mjs` (Phase 1)
- `tools/learning-loop-mastra/core/field-glossary.js` (Phase 2)
- JIT `patch_schema` payloads in `meta-state-patch-tool.js#invalid_field` and `#empty_patch`; `meta-state-batch-tool.js#buildInvalidFieldResult` (Phase 2)
- Glossary wired into `loop-describe-tool.js` cold tier (post-cache-read) (Phase 2)
- Schema description shortening across `core/meta-state.js`, `tools/handlers/*` (Phase 2)
- `buildDiscoverabilityPointers` + `buildProcessPointers` in `core/loop-introspect.js`; both SessionStart hooks emit pointer projection (Phase 3)
- `tools/scripts/delivery-classify.mjs` (Phase 4)
- `buildSteeringPointer` in `core/evaluate-inbound-gate.js`; once-per-session pointer emit + try/catch fallback in `hooks/universal/inbound-gate.js` (Phase 4)

## Known test failure (test-side fix only)

`tools/learning-loop-mastra/__tests__/legacy-mcp/cross-surface.test.js` — `inbound-gate: normal message emits pointer once per session` case. The test runs the hook twice (claude + droid) and expects symmetric output. The Phase 4 pointer contract is once-per-session, so the second call sees the first call's `.inbound-pointer-surfaced` token and emits nothing. Fix options: split into first-call + suppressed-call subtests; clear the pointer token between calls; or run each call in its own temp GATE_ROOT. **The implementation is correct per the plan spec; do not revert the pointer emit.**

## Test snapshot at session end

- `mcp-wire-budget.test.js`: 1/1 green (39,905B)
- `field-glossary.test.js`: 2/2 green
- `meta-state-patch-jit-payload.test.js`: 4/4 green
- `meta-state-patch-tool.test.js`: 17/17 green
- `meta-state-batch-tool.test.js`: 17/17 green
- `meta-state-patch-derived-schema.test.js`: 3/3 green
- `meta-state-report-description.test.js`: 3/3 green
- `runtime-state-metadata-validation.test.js`: 6/6 green
- `runtime-state-record-tool.test.js`: 3/3 green
- `meta-state-log-change-tool.test.js`: present but not in legacy-mcp test runner
- `session-start-inject-discoverability.test.cjs`: 11/11 green
- `session-start-inject-process-hints.test.cjs`: 2/2 green
- `inbound-state-gate.test.cjs`: 1/1 green (warn-only helper)
- `loop-introspect.test.js`: 6/6 green
- `cross-surface.test.js`: 7/8 green (inbound-gate case fails — see handoff prompt)
- `delivery-classify.test.js`: 1/1 green

Total green: ~100/101; 1 known failure (test fixture, not code regression).

## Handoff prompt (paste in a fresh session)

See `phase-04-delivery-classifier-inbound-gate-pull-pointer.md` § "Handoff prompt" — covers the test fix, the classifier row reset, the Phase 5/6 docs work, and the loop bookkeeping.

## Unresolved

1. `syn`-profile delivery row — the `syn` transcript directory is not present in this checkout; honor the honesty flag and record documented-degradation in the verification report. Do not invent a row.
2. Phase 5 (docs) and Phase 6 (verification + bookkeeping) are not yet started.
3. Cross-surface test fixture: see handoff prompt.
