---
phase: 6
title: "Integration & Final Validation"
status: completed
priority: P1
effort: "3h"
dependencies: [1, 2, 3, 4, 5]
---

# Phase 6: Integration & Final Validation

## Overview

End-to-end validation of the three-layer defense. Simulate a full product-build workflow from plan creation through product code writes, verifying each layer catches violations appropriately. Validate compatibility with the pending surface-restructure plan. Final test suite run.

## Requirements

- **Functional**: Full workflow simulation: create product-build plan → gate warns/blocks → create decision records → gate allows → write product code → validator passes. Test warn and escalate modes. Test surface-first and flat path conventions.
- **Non-functional**: All existing tests continue to pass. No regression in gate performance. pnpm check completes in < 30s.

## Architecture

```
Integration Test Scenario
├── Setup: temp project with loop structure
├── Test 1: Missing decision records
│   ├── Write product-build plan → gate warns (warn mode)
│   ├── Write product code → gate warns
│   ├── Run validator → reports violations
│   └── Switch to escalate mode → gate blocks
├── Test 2: Present decision records
│   ├── Create decision record YAML
│   ├── Write product-build plan → gate allows
│   ├── Write product code → gate allows
│   └── Run validator → clean
├── Test 3: Surface-restructure compatibility
│   ├── Test flat paths (current)
│   ├── Test surface-first paths (future)
│   └── Verify both work
└── Cleanup: remove temp project
```

## Related Code Files

- **Create**: `tools/validate-plan-loop/integration.test.js` — end-to-end test
- **Run**: All existing test suites
  - `tools/constraint-gate/*.test.js`
  - `.claude/coordination/hooks/*.test.js`
  - `tools/validate-records/*.test.js`
- **Read**: `plans/260522-0000-records-surface-restructure/plan.md` — cross-plan compatibility check

## Implementation Steps

1. **Run existing test suites** (baseline):
   ```bash
   pnpm test
   pnpm validate:records
   pnpm check
   ```
   Record pass/fail baseline. Any pre-existing failures must be documented.

2. **Write integration test** (`integration.test.js`):
   - Create temporary directory with minimal loop structure
   - `records/observations/` (with active observation for evidence)
   - `records/decisions/` (initially empty)
   - `plans/` (empty)
   - `product/` (empty)
   - Simulate:
     a. Write plan.md with `tags: [product-build]` and `surfaces: [product]`
     b. Verify gate warns (warn mode)
     c. Verify gate blocks (escalate mode)
     d. Create `records/decisions/decision-test.yaml`
     e. Write plan.md again → gate allows
     f. Write `product/api/test.py` → gate allows
     g. Run validator → clean
   - Clean up temp directory

3. **Test surface-restructure compatibility**:
   - Verify gate handles both:
     - `records/decisions/*.yaml` (flat, current)
     - `records/product/decisions/*.yaml` (surface-first, future)
   - If surface-restructure plan has merged, verify surface-first paths work
   - If not merged, verify flat fallback still works

4. **Performance check**:
   - Time `pnpm check` before and after changes
   - Gate hook latency: verify < 50ms for content scan
   - Validator latency: verify < 1s for 50 plans

5. **Cross-plan dependency check**:
   - Read `plans/260522-0000-records-surface-restructure/plan.md`
   - Verify our changes don't conflict with pending phases
   - If conflicts found, document and escalate

6. **Final run**:
   ```bash
   pnpm test
   pnpm validate:records
   pnpm check
   pnpm validate:plan-loop  # new script from phase 4
   ```

## Success Criteria

- [ ] All existing tests pass (no regressions)
- [ ] Integration test passes (full workflow simulation)
- [ ] Gate latency < 50ms for content scan
- [ ] Validator latency < 1s
- [ ] Warn mode allows with warning
- [ ] Escalate mode blocks without approval
- [ ] Surface-first and flat paths both supported
- [ ] No conflicts with pending surface-restructure plan
- [ ] `pnpm check` completes successfully

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Integration test is flaky | Use fixed temp paths; clean up in finally block |
| Surface-restructure plan conflicts | Document conflicts; coordinate with that plan's owner |
| Performance regression | Benchmark before/after; optimize if > 50ms gate latency |
| Existing test suite already failing | Document baseline; our changes must not add new failures |
| Cross-plan dependency was missed | Re-read surface-restructure plan phase 2 and phase 4 |
