# Constraint Gate Gap Closure — 4 Fixes That Made the Gate Actually Work

**Date**: 2026-05-17
**Severity**: High
**Component**: constraint-gate MCP server + CJS coordination hooks
**Status**: Resolved

## What Happened

The constraint gate MCP server was structurally complete — tests passed, hooks fired, server started — but it couldn't catch the actual constraint scenarios it was built for. Four distinct gaps prevented real-world detection: patterns were too narrow to match actual commands, observation schema didn't match existing YAML files, decision ordering never checked budgets when patterns missed, and CJS/ESM implementations diverged silently.

Fixed all four. 93/93 tests pass. 6/6 acceptance criteria met. Code review clean (0 critical, 0 high).

## The Brutal Truth

This is the kind of implementation that looks done on paper but fails in production. Every test passed because every test used the exact patterns and field names the code expected. Nobody tested against the actual observation YAML files or the actual commands developers run. The gate was a security theater checkpoint — it had the form but none of the function.

The most painful gap was budget-first ordering. The gate checked pattern, then observation, then budget. If a command didn't match any pattern, the budget was never consulted. So a developer could blast through every remaining budget cycle running `python -c "import vnstock_data"` and the gate would happily pass it through because the pattern didn't catch `vnstock_data`, only `vnstock`. The one scenario the gate was built to prevent — budget exhaustion — was unreachable for the most common violation command.

## Technical Details

**Gap 1 — Narrow patterns:**
`CONSTRAINT_PATTERNS` only matched `import vnstock`, not `import vnstock_data` or `pnpm bootstrap:api`. The actual commands developers hit were invisible. Fixed with word-boundary regex: `import\s+vnstock(?:_data)?\b`.

**Gap 2 — Schema mismatch:**
`checkObservationExists()` matched `constraint_type` field, but existing observation YAML files used `constraint:` field. The function always returned false, so the gate never recognized prior observations. Added dual-field matching and migrated 2 existing YAML files.

**Gap 3 — Budget-first ordering:**
Original: pattern → observation → budget. If pattern missed, budget never checked. Reordered to: budget (global check) → pattern → observation. Any exhausted budget now escalates immediately regardless of pattern match.

**Gap 4 — CJS/ESM drift:**
`gate-logic.js` (ESM) and `gate-utils.cjs` (CJS) had identical pattern arrays maintained by hand. They were already out of sync. Extracted to `tools/constraint-gate/patterns.json` as single source of truth. Both implementations now `require`/`import` from the same file.

## What We Tried

Didn't need multiple attempts — the TDD approach caught each gap cleanly. Wrote test for expected behavior, watched it fail, fixed implementation, watched it pass. The 12 new tests in `gate-logic.test.js` and the new `gate-utils.test.cjs` drove each fix.

The schema mismatch took the most detective work. The existing observation files were written weeks ago with `constraint:` field, but the gate code was written last week expecting `constraint_type:`. Nobody noticed because no test loaded real observation files.

## Root Cause Analysis

Two root causes:

1. **No integration tests against real data.** Unit tests used synthetic fixtures that matched the code's assumptions. If any test had loaded the actual `records/observations/` YAML files, Gap 2 would have been caught immediately.

2. **Dual implementation without shared source.** ESM and CJS versions of the same logic were maintained independently. This is a ticking time bomb whenever you have two runtimes in the same project. The `patterns.json` extraction is the right fix, but it should have been done at initial implementation, not after drift was discovered.

## Lessons Learned

- **Test against real data, not just fixtures.** Unit tests with hand-crafted inputs miss schema mismatches. At least one integration test should load actual production data files.
- **Single source of truth for duplicated logic is non-negotiable.** If two files must implement the same patterns/config, extract to shared JSON immediately. Don't defer it.
- **Decision ordering matters more than decision logic.** The gate had correct checks for pattern, observation, and budget. But the ordering meant budget checks were unreachable for non-matching patterns. Always verify that every critical check is reachable in every code path.
- **"All tests pass" means nothing if the tests don't model reality.** 93 passing tests, and the gate still couldn't catch the one command it was built for. The tests were correct; they just tested the wrong thing.

## Next Steps

- Consider adding an integration test that loads all YAML files in `records/observations/` and verifies the gate recognizes them.
- Monitor for further CJS/ESM drift — `patterns.json` solves patterns but other shared logic may still diverge.
- The 2 medium code review findings (pre-existing data modeling issues) should be addressed in a follow-up pass.
