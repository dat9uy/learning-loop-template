---
phase: 3
title: "dead-glob-cleanup"
status: pending
priority: P2
dependencies: [phase-01-runner-script]
effort: "S"
---

# Phase 3: dead-glob-cleanup

## Overview

Drop the 2 dead globs (`scout/*.test.js`, `evals/*.test.js`) from the test runner's glob list. The brainstorm claimed 3 dead globs; R1 empirically found only 2 (the third, `mastra/*.test.js`, has 8 live files and 45 tests).

## Why drop dead globs

- **Empty globs add zero wall-clock** but also provide zero signal
- **Empty globs add noise to the runner output** (an `[empty-glob] ==> start` / `[empty-glob] ==> pass` with no tests)
- **They mask the suite's real shape** — when the runner reports "9 globs passed", the operator trusts that number; 11 with 2 empty is misleading
- **They are YAGNI** — the `scout` and `evals` directories exist but the test files have been removed (or never created)

## Requirements

- **Functional:** the runner's `GLOBS` array contains 9 entries, not 11
- **Non-functional:** no regression in coverage (the 2 dropped globs are confirmed dead)

## R1 Empirical Evidence

| Glob | Files matched (find) | Files matched (runtime) | Verdict |
|---|---|---|---|
| `tools/learning-loop-mcp/scout/*.test.js` | 7 (test fixtures) | 0 | **Dead** — matches fixture files under `test-fixtures/mini-codebase/__tests__/`, not live tests |
| `tools/learning-loop-mcp/evals/*.test.js` | 0 | 0 | **Dead** — directory exists but no `.test.js` files |
| `tools/learning-loop-mastra/__tests__/*.test.js` | 8 | 8 | **Live** — has 8 files, 45 tests, 1.6s wall-clock |
| All other 8 globs | varies | varies | **Live** — verified in R1 timing table |

## Related Code Files

- **Modify:** `tools/scripts/run-pnpm-test-namespaced.mjs` — drop the 2 entries from `GLOBS` array

## Implementation Steps

1. **Confirm the 2 globs are dead** with one more `find`:
   ```bash
   find . -name "*.test.js" -path "./tools/learning-loop-mcp/scout/*" 2>/dev/null
   find . -name "*.test.js" -path "./tools/learning-loop-mcp/evals/*" 2>/dev/null
   ```
   Expected: 7 fixture files (scout) and 0 files (evals). The 7 scout matches are under `tools/learning-loop-mcp/scout/test-fixtures/mini-codebase/__tests__/` — they are test inputs, not test runners.
2. **Edit the runner script** to drop the 2 entries:
   ```js
   // REMOVED: { ns: 'scout', pattern: 'tools/learning-loop-mcp/scout/*.test.js' },
   // REMOVED: { ns: 'evals', pattern: 'tools/learning-loop-mcp/evals/*.test.js' },
   ```
3. **Verify the runner now reports 9 globs:**
   ```bash
   node tools/scripts/run-pnpm-test-namespaced.mjs 2>&1 | head -20
   ```
   Expected: 9 `[<ns>] ==> start` lines.
4. **Verify total wall-clock is ≤ 30s** (relaxed from ≤ 15s per Red Team H19; Phase 1 + Phase 4 add 2 new test files to glob 1, growing the baseline by ~50-200ms). The 12.87s R1 baseline predates the new test files; the relaxed threshold absorbs the new test files plus cross-machine variance.

## Success Criteria

- [ ] `GLOBS` array in the runner has 9 entries
- [ ] `node tools/scripts/run-pnpm-test-namespaced.mjs` reports 9 namespaces
- [ ] Total wall-clock ≤ 15s (matches pre-cleanup baseline of 12.87s + small overhead)
- [ ] No regression in test coverage (all live tests still run)
- [ ] Documentation: add a comment in the runner script explaining why the 2 globs were dropped (cite R1 §Dead-glob verification)

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| A scout or evals test is added in the future and the dropped glob is missed | Low | Low | Comment in runner script cites R1 evidence; git blame on the drop line shows the decision |
| Operator expected the 2 globs to remain for forward-compat | Low | Low | Open Question #1 surfaces this to operator at plan closeout |
| The 7 fixture files under `scout/test-fixtures/` are misinterpreted as live tests | Low | Low | Comment in runner script names the path explicitly; CI cannot mistake them (they don't end in `.test.js` at the right depth) |
