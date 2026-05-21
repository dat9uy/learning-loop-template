---
capability: meta
dimension: static
scope: governance
validation_status: passed
---

# Resource Budget Procedural Rules

## Findings

- [resource-budget-rules] External systems with irreversible operations need structural enforcement via resource budget observations, not just agent memory.
- [four-step-flow] Budget observation tracks state; `check_gate` or `pnpm check:budget` returns JSON; skill gates prompt generation; operator-only writes mutate budget YAML.
- [budget-declaration] Plans with irreversible operations MUST declare a resource budget before execution.
- [check-failure-stop] ANY check failure on a budget-consuming action = STOP, not fix-and-retry.
- [operator-confirmation] After a budget-consuming action, agent reports result and waits for operator confirmation before proceeding.
- [validation-window] No state-changing actions between clearance and final report; window semantics enforced by observation staleness check.
- [dependency-chain-trace] When guard/gate blocks an action, trace full dependency chain back to resource budgets before attempting workarounds; if chain ends at exhausted budget, report constraint immediately.
- [agent-restriction] Agent never mutates budget YAML directly; operator updates after each action.

## Observation

Resource budgets govern external systems where actions cannot be undone: vendor device registration, production database writes, rate-limited endpoints. The learning-loop skill acts as gatekeeper, checking resource state before producing prompts for budget-consuming actions.

## Trigger

- Event class: plan-involving-irreversible-operations
- Threshold: N=1
- Action when triggered: declare resource budget, run `check_gate` or `pnpm check:budget`, respect validation window, trace dependency chain on block.
