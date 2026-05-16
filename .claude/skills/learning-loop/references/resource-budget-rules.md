# Resource Budget Rules

Use these as hard constraints when a learning-loop task involves external systems with irreversible state.

## Core Rules

1. **Plans with irreversible operations MUST declare a resource budget.**
   - Every plan that can consume, modify, or exhaust an external resource must reference a budget record.
   - No budget = no state-changing actions.

2. **Agent MUST check budget before any budget-consuming action.**
   - Call `pnpm check:budget -- --system {system} --resource {resource}` as the primary data source.
   - Do not read budget YAML directly; the tool is the single source of truth.

3. **ANY check failure on a budget-consuming action = STOP (not fix-and-retry).**
   - Exit code 1 (budget exhausted) → block immediately.
   - Exit code 2 (error) → block and report to operator.
   - Do not rationalize, retry, or work around a budget failure.

4. **Validation window: no state-changing actions between clearance and final report.**
   - When `validation_window.active` is true, all state-changing actions are deferred.
   - The window opens when an operator requests validation and closes when the operator confirms.

5. **After a budget-consuming action, the agent reports result and waits for operator confirmation.**
   - The agent does not proceed to the next budget-consuming action until the operator updates the budget YAML.

6. **Operator-only writes to budget YAML; agent reads only.**
   - The agent never modifies `records/observations/*-resource-budget.yaml`.
   - Only the operator increments `current`, resets state, or opens/closes validation windows.

7. **Staleness check: warn if `last_verified` is older than 7 days (fixed threshold).**
   - If the budget data is stale, the agent emits a WARNING and asks the operator to confirm the external system state before acting.
   - The 7-day threshold is fixed; it is not configurable per budget.
