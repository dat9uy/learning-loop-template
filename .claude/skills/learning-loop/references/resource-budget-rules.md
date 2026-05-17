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
   - Protocol: operator clearance → agent executes validation → agent reports results → operator closes window.
   - During the window: no host-side actions that could mutate external system state (imports, API calls, cache writes).
   - If the agent needs debugging, it uses disposable environments (temp dirs, fresh containers) — never the host's live state.

5. **After a budget-consuming action, the agent reports result and waits for operator confirmation.**
   - The agent does not proceed to the next budget-consuming action until the operator updates the budget YAML.

6. **Operator-only writes to budget YAML; agent reads only.**
   - The agent never modifies `records/observations/*-resource-budget.yaml`.
   - Only the operator increments `current`, resets state, or opens/closes validation windows.

7. **Staleness check: warn if `last_verified` is older than 7 days (fixed threshold).**
   - If the budget data is stale, the agent emits a WARNING and asks the operator to confirm the external system state before acting.
   - The 7-day threshold is fixed; it is not configurable per budget.

8. **A validation run is PASS or FAIL. No partial credit.**
   - PASS = ALL verification checks pass (exit codes, imports, API calls, file state).
   - FAIL = ANY verification check fails.
   - The agent does not interpret partial success as "mostly working" or "needs a small fix."
   - On FAIL: STOP. Fix the artifact outside the budget-consuming environment. Get new operator clearance before retry.

9. **Fresh environment per validation attempt.**
   - Each validation attempt uses a clean environment (fresh container, clean temp dir, no prior state).
   - The agent MUST NOT reuse a previously used environment for a second attempt.
   - If the environment has residual state from a prior attempt (e.g., `.vnstock`, config files, partial installs), treat it as contaminated — create a new one.
   - Rationale: residual state can bypass idempotency checks, cause false positives/negatives, or trigger unintended side effects on external systems.

10. **Budget-consuming actions are one-shot until operator intervenes.**
    - After a budget-consuming action (whether PASS or FAIL), the agent reports results and STOPS.
    - The agent does not proceed to additional budget-consuming actions, fix-and-retry loops, or diagnostic runs that could affect external state.
    - Only the operator can authorize a subsequent attempt (by updating the budget YAML and confirming external system state).
