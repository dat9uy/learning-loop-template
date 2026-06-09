# Journal: Stale-flag redesign planning

**Date**: 2026-06-09
**Author**: ck:plan (Droid session)
**Plan**: plans/260609-stale-flag-redesign/plan.md
**Status**: Plan complete; awaiting cook

## What was planned

A 3-phase TDD plan (Red / Green / Refactor+closeout) for the
stale-flag redesign. Closes the recursion where the TTL finding
`meta-260608T0847Z-ttl-expire-system-...` was auto-resolved by
the very system it described. Ships:

- `stale` status (non-terminal; replaces `resolved_by: "auto-resolve"` on TTL)
- `meta_state_re_verify` MCP tool (`META_STATE_VERIFY_EXEC=1` gate)
- `meta_state_supersede` MCP tool (`OPERATOR_MODE=1` gate)
- `core/verification-runner.js` (cmd-allowlist + `shell: false` + 10s timeout)
- `re_verify` recommendation branch in `derive-status.js#computeRecommendation`
- Fix for the second auto-resolve-by-clock path in `meta_state_list`
- Backfill of 2 affected findings via `meta_state_supersede`
- ~15 new TDD tests across 4 new test files + 1 added assertion

## Key decisions made during planning

1. **Scope expansion**: the brainstorm only fixed `meta_state_sweep`,
   but `meta_state_list` (lines 47-53) had the same auto-resolve-by-clock
   pattern. Operator approved in scope question 1 to fix both in the
   same plan.

2. **Plan structure**: brainstorm had 8 phases; user said "make it
   self-contained since ck:cook will run the plan in the fresh context
   session" — restructured to 3 TDD phases matching the workspace's
   most recent precedent plans (260605-superseded, 260606-rule-loop-design,
   260606-cold-session-test-rule, 260608-1015-meta-state-patch,
   260608-2255-index-extractor).

3. **`META_STATE_VERIFY_EXEC=1`** (not `OPERATOR_MODE`): finer control
   for the exec surface; matches the brainstorm's design. Reasoning:
   exec surface is fundamentally riskier than resolve, so the gate
   deserves its own env var.

## Red team findings applied

Self-executed 3-lens review (parallel `code-reviewer` subagents returned
empty "Plan is up-to-date" with no findings; planner applied lenses
directly). 10 findings, 10 accepted:

- 1 critical: `core/meta-state.test.js` had 3+ `checkExpiry` tests
  asserting `"expired"` return value; the plan only mentioned updating
  `meta-state-sweep.test.js`. Added sub-step 1.0 to fix.
- 2 high: `cold-session-discoverability.test.cjs` has 4 `status: "expired"`
  fixture references that the new model invalidates (added sub-step 5.5);
  `DISCOVERABILITY_HINTS` still says "5 statuses" (added to sub-step 1.3).
- 1 high: T7 test in Phase 1 cannot be cleanly red (it asserts
  behavior that Phase 2 sub-step 1.1 also changes) — split for clarity.
- 3 medium: test count inconsistency (reconciled to 15/~855);
  `query-drift.test.js` and `gate-resolution-evidence.test.js`
  use `expired` as fixture but for non-stale purposes (verified
  unaffected); T6 import-time failure is acceptable red.
- 3 low: roll-back plan; journal placeholder values; warm-tier test
  verification.

## Open questions resolved

- Ship independently (no cross-plan blockers).
- Fix both auto-resolve paths in the same plan.
- 3 TDD phases, self-contained.
- `META_STATE_VERIFY_EXEC=1` (separate from `OPERATOR_MODE`).

## Next step

Awaiting user decision. The plan is ready for `/ck:cook
plans/260609-stale-flag-redesign/plan.md` in a fresh context session.
Phase 1 is already marked `in-progress` via `ck plan check 1 --start`.
