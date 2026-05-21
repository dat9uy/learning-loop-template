---
phase: 6
title: "Test Suite & Final Validation"
status: pending
priority: P1
effort: "20m"
dependencies: [5]
---

# Phase 6: Test Suite & Final Validation

## Overview

Run the full test suite and validation pipeline against the migrated structure. Fix any remaining failures. Compare against phase 1 baseline.

## Requirements

- Functional: All tests pass.
- Functional: All validation passes.
- Non-functional: Baseline diff shows no regressions.

## Related Code Files

- All test suites in `tools/` and `.claude/coordination/__tests__/`

## Implementation Steps

1. Run `pnpm check`. Fix any new failures.
2. Run `pnpm extract:index`. Verify output.
3. Run full test suite: `npm test` or `pnpm test`.
4. Compare results against phase 1 baseline.
5. Fix any failing tests (likely test fixtures with hardcoded old paths that were missed in phases 2-3).
6. Run gate tests again to verify write-path observations still work.

## Tests Before

- Phase 1 baseline exists for comparison.

## Refactor

- Fix any remaining hardcoded paths in tests.
- Fix any edge cases discovered during full validation.

## Tests After

- All test suites pass.
- Validation passes.

## Success Criteria

- [ ] `pnpm check` exits 0
- [ ] `pnpm extract:index` exits 0
- [ ] Full test suite passes (0 failures)
- [ ] No regressions vs phase 1 baseline
- [ ] Gate tests verify write-path still works for evidence, index, capabilities

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Test failures from missed path updates | Phase 2-3 already updated most; fix stragglers here |
| Integration test failures | Run all integration tests including gate integration |

## Regression Gate

```bash
pnpm check && pnpm extract:index && npm test
```
