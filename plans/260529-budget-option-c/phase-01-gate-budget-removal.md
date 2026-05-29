---
phase: 1
title: "Gate Budget Removal"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Gate Budget Removal

## Overview

Remove the budget exhaustion escalation branch from `makeGateDecision` in `gate-logic.js`. Remove `budgetStatus` from the function signature. Remove the `readBudgets` and `evaluateBudget` loop from `bash-gate.js` and `write-gate.js`. Keep `budget-checker.js` and `check-budget-tool.js` as agent tools (no changes). Update all tests that expect `escalate` for budget exhaustion to expect `ok` instead.

## Requirements

- **Functional:** `makeGateDecision` accepts only `constraintMatch` and `observationStatus` (no `budgetStatus`)
- **Functional:** `bash-gate.js` no longer reads budget observations or evaluates budgets
- **Functional:** `write-gate.js` does not currently read budgets (no change needed, verified)
- **Functional:** `gate-tool.js` (MCP server) no longer reads budget observations or evaluates budgets
- **Functional:** `side-effect-import` hard block remains unchanged
- **Non-functional:** MCP server must be restarted after `gate-tool.js` change for new behavior to take effect
- **Functional:** `evaluateBudget` function remains in `gate-logic.js` for test/utility use, but is not called by the gate hooks
- **Non-functional:** All 224+ tests pass
- **Non-functional:** `cross-surface.test.js` assertions updated to match new behavior

## Architecture

### Gate Logic (target state)

```javascript
// makeGateDecision — budget branch removed
export function makeGateDecision(constraintMatch, observationStatus) {
  // Side-effect imports always block
  if (constraintMatch === "side-effect-import") {
    return {
      decision: "block",
      reason: `Importing vnstock_data triggers vendor authentication and may reactivate cleared devices. Use importlib.util.find_spec() for safe checks.`,
      constraint_type: constraintMatch,
      hard_block: true,
    };
  }

  // No constraint matched → ok
  if (!constraintMatch) {
    return { decision: "ok" };
  }

  // Constraint matched but no active observation → block
  if (!observationStatus?.found) {
    return {
      decision: "block",
      reason: `Constraint "${constraintMatch}" detected. No active observation found. Record an observation before proceeding.`,
      observation_required: true,
      constraint_type: constraintMatch,
    };
  }

  return { decision: "ok" };
}
```

### Bash Gate (target state)

```javascript
// Remove:
// const budgets = readBudgets(root);
// let budgetStatus = { exhausted: false, windowActive: false };
// for (const budget of budgets) { ... }

// Call makeGateDecision with 2 args instead of 3:
// const decision = makeGateDecision(constraintMatch, observationStatus);
```

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/core/gate-logic.js` — remove `budgetStatus` from `makeGateDecision` signature and body
- **Modify:** `tools/learning-loop-mcp/hooks/bash-gate.js` — remove `readBudgets` and `evaluateBudget` loop
- **Modify:** `tools/learning-loop-mcp/tools/gate-tool.js` — remove `readBudgets` and `evaluateBudget` loop; call `makeGateDecision` with 2 args
- **Modify:** `__tests__/cross-surface.test.js` — update expected decisions for `docker` and `sudo` from `block` to `ok` (since no observation + no budget = ok, wait — actually need to re-check. After Option A, `docker` and `sudo` expect `block` because no observation. After Option C, the same: no observation = block. The change is that `vendor-api` with exhausted budget no longer escalates, it just goes `ok` if observation exists, or `block` if no observation. The `cross-surface.test.js` cases don't have vendor-api observations, so they remain `block` for docker/sudo.)
- **Modify:** `__tests__/gate-logic-budget.test.js` — rename to `gate-logic-budget-legacy.test.js` and update to test `evaluateBudget` as a utility function, not `makeGateDecision` with `budgetStatus`

## Implementation Steps

1. **Write tests first** (TDD):
   - Create `__tests__/gate-logic-no-budget.test.js` with tests that assert `makeGateDecision` ignores budget
   - Add test: `makeGateDecision` with `vendor-api` constraint + no observation → `block`
   - Add test: `makeGateDecision` with `vendor-api` constraint + observation found → `ok` (even if budget is exhausted)
   - Add test: `makeGateDecision` with `side-effect-import` → `block` regardless of observation or budget

2. **Refactor `makeGateDecision`:**
   - Remove `budgetStatus` parameter from signature
   - Remove budget branch from body
   - Ensure `side-effect-import` block remains
   - Ensure `!observationStatus.found` block remains

3. **Update `bash-gate.js`:**
   - Remove `readBudgets` function call
   - Remove `evaluateBudget` import/use
   - Call `makeGateDecision` with 2 arguments

4. **Update `gate-tool.js` (MCP server):**
   - Remove `readBudgets` and `evaluateBudget` loop
   - Call `makeGateDecision` with 2 arguments
   - Update `gate_check` schema description if it mentions budget

5. **Verify `write-gate.js`:**
   - Confirm `write-gate.js` does not currently read budgets (red team finding #4)
   - No change needed if confirmed

6. **Update tests:**
   - `__tests__/gate-logic-budget.test.js` → update to test `evaluateBudget` in isolation, not through `makeGateDecision`
   - `__tests__/cross-surface.test.js` → docker/sudo remain `block` (no observation). Add vendor-api test case with observation and exhausted budget → `ok` (not `escalate`).
   - Add new test: `vendor-api` with observation and exhausted budget → `ok` (not `escalate`)

7. **Run `pnpm test`** — all tests must pass

## Success Criteria

- [x] `makeGateDecision` accepts 2 parameters (`constraintMatch`, `observationStatus`)
- [x] `bash-gate.js` no longer reads or evaluates budgets
- [x] `write-gate.js` verified to not read budgets (no change needed)
- [x] `gate-tool.js` no longer reads or evaluates budgets
- [x] `side-effect-import` hard block unchanged
- [x] `evaluateBudget` remains as a utility function (not removed, just not called by gate)
- [x] `__tests__/gate-logic-no-budget.test.js` created with TDD tests
- [x] `__tests__/gate-logic-budget.test.js` updated to test `evaluateBudget` in isolation
- [x] All 273 tests pass
- [x] `pnpm validate:records` exits 0
- [x] `pnpm extract:index` exits 0
