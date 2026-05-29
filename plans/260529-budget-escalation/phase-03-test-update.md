---
phase: 3
title: "Test Update"
status: completed
effort: "1h"
dependencies: [2]
---

# Phase 3: Test Update

## Overview

Update existing tests that assert the old buggy behavior. The `cross-surface.test.js` has `sudo` and `docker` test cases that expect `escalate` but currently pass because the bash hook's test environment has no observations/budgets. We need to audit all test assertions and ensure they reflect the new behavior.

## Files to Review

1. `__tests__/cross-surface.test.js` — audit `bashTestCases` and `writeTestCases`
2. `__tests__/old-validate-records-function.test.js` — if it references budget behavior
3. `__tests__/mcp-lifecycle-integration.test.js` — if it references gate decisions
4. `__tests__/meta-state-integration.test.js` — if it references gate severity

## Analysis of `cross-surface.test.js`

The test cases in `cross-surface.test.js`:

```javascript
const bashTestCases = [
  { name: "docker command blocked", expectedDecision: "escalate" },
  { name: "sudo command blocked", expectedDecision: "escalate" },
  { name: "ls command allowed", expectedDecision: null },
  { name: "records redirect blocked", expectedDecision: "block" },
];
```

These tests run against the bash hook (`bash-gate.js`) in a clean environment. The hook reads observations from the repo's `records/observations/` directory. Since the test environment has no active observations, `checkObservationExists` returns `found: false`, which causes `makeGateDecision` to return `decision: "block"` (not `escalate`).

Wait — the tests expect `escalate` but the environment has no observations. Let me re-read the hook to understand how this passes.

The hook does:
```javascript
const budgets = readBudgets(root);
let budgetStatus = { exhausted: false, windowActive: false };
for (const budget of budgets) {
  const status = evaluateBudget(budget);
  if (status.exhausted || status.windowActive) {
    budgetStatus = status;
    break;
  }
}
```

If `readBudgets` finds the actual `observation-vnstock-resource-budget.yaml` (budget: 1, current: 1), then `budgetStatus` is `exhausted: true`. The current `makeGateDecision` then escalates for any `constraintMatch`. So `sudo` and `docker` get `escalate` because the vnstock budget is exhausted.

**This is the bug.** The test environment reads the real repo's observations. The `cross-surface.test.js` test passes because the real vnstock budget is exhausted, and the current code escalates ALL constrained commands.

After the fix:
- `docker` command (constraintMatch: `docker`) + budget (constraint_type: `vendor-api`) → `block` (no observation for docker, and budget mismatch)
- `sudo` command (constraintMatch: `sudo`) + budget (constraint_type: `vendor-api`) → `block` (no observation for sudo, and budget mismatch)

So the test cases must be updated to expect `block` for `docker` and `sudo`, not `escalate`.

## Changes

1. Update `cross-surface.test.js`:
   - `docker command blocked` → expectedDecision: `block` (was `escalate`)
   - `sudo command blocked` → expectedDecision: `block` (was `escalate`)

2. If any other tests assert `escalate` for non-matching constraints, update them to `block` or `ok`.

3. Consider adding new test cases to `cross-surface.test.js` that verify the scoped escalation:
   - `vendor-api command with exhausted budget` → expectedDecision: `escalate` (with vendor-api observation)

   However, this requires creating a test observation file. Better to keep this in the unit test `gate-logic-budget.test.js`.

## Success Criteria

- [x] `cross-surface.test.js` updated: `docker` and `sudo` expect `block` not `escalate`
- [x] All other tests audited and updated if they assert old behavior
- [x] `pnpm test` passes (all 259 tests)
- [x] No new test failures introduced
