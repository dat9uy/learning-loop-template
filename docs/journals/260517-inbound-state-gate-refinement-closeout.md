# Inbound State Gate Refinement Closeout

**Date**: 2026-05-17 21:30
**Severity**: Medium
**Component**: `.claude/coordination/hooks/inbound-state-gate.cjs`
**Status**: Resolved

## What Happened

Executed plan `plans/260517-2130-inbound-state-gate-refinement/plan.md` via `/ck:cook --tdd`. Closed 5 functional gaps (F6-F7, F11, pattern-3 regex, observation_id fallback) and delivered 52 tests across 9 categories plus architecture docs. All 131 tests pass, 0 regressions.

## The Brutal Truth

Three known behaviors (F1 phantom escalation, F2 staleness divergence, F3 MCP ok-only staleness) were consciously documented rather than fixed. This feels like leaving landmines for the 2am debugger, but unifying them would have blown scope. The real frustration is that `findProjectRoot()` had a dead branch for 3 commits before we caught it — the gate silently fell back to `process.cwd()` in non-git environments, which could have caused marker files to scatter across the filesystem.

## Technical Details

- `findProjectRoot()` dead branch (F7): when `git rev-parse` failed, the catch block returned `process.cwd()` without checking `GATE_ROOT`, so test isolation env vars were ignored in non-git contexts.
- `observation_id` fallback (M-02): `observation.id ?? observation.observation_id ?? 'unknown'` — the original code only checked `observation.id`, causing undefined IDs when upstream sent `observation_id`.
- Pattern 3 regex: added `(?:it is|it's)` to match uncontracted forms like "it is working".
- Question filter (F11): `/?\s*$/` skip on utterances ending with `?` to reduce false-positive pattern matches.
- Test suite uses `spawnSync` (not direct `require`) per F15 to exercise realistic module resolution.

## What We Tried

- Direct `require()` of the gate module in tests — abandoned because module-level side effects (env parsing) ran before test setup could inject mocks. Spawn isolation solved it.
- Fixing F1/F2/F3 in this pass — rejected after estimating 2+ hours of cross-file staleness algorithm unification. Deferred to future gate v2.

## Root Cause Analysis

The dead branch survived because we had no tests exercising the non-git path. The gate was developed inside a git repo, so the failure mode was invisible. Classic "works on my machine" — except the machine was every dev environment, and the failure was every CI container.

## Lessons Learned

1. **Test the failure path first.** If your feature has a fallback, write the test that forces the fallback before the happy path.
2. **Env-var injection points need explicit test coverage.** `GATE_ROOT` and `GATE_MARKER_PATH` were added for test isolation but never verified in non-git contexts.
3. **Documented-known-behavior is still debt.** F1-F3 are ticking clocks. If the next person hits them at 2am, the journal entry won't save them — only a fix will.

## Next Steps

- [ ] Unify staleness algorithms (F2) across inbound/outbound/MCP — owner: future gate v2 owner, timeline: unplanned
- [ ] Review F1 phantom escalation after next production observation storm — owner: on-call
- [ ] Backfill non-git `findProjectRoot()` test if CI ever runs outside git context — owner: infrastructure
