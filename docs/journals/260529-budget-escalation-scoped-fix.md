# Journal: Scoped Budget Escalation Fix

## Problem

The constraint gate's `makeGateDecision` treated any exhausted budget as a global escalation, blocking any command that matched a constraint pattern. This caused a `pnpm add` (constraint: `package-manager`) to be blocked by the `vnstock` budget (constraint_type: `vendor-api`) because the gate did not check whether the budget's `constraint_type` matched the command's `constraintMatch`. The error message was also counter-intuitive: "Budget exhausted for constraint 'package-manager'" when the actual exhausted budget was `vendor-api`.

## Fix

Scoped the budget escalation so that a `vendor-api` budget only escalates `vendor-api` commands, a `sudo` budget only escalates `sudo` commands, etc.

### Changes

- `tools/learning-loop-mcp/core/gate-logic.js`:
  - `evaluateBudget`: now returns `constraint_type`, `external_system`, `resource` alongside `exhausted` and `windowActive`
  - `makeGateDecision`: only escalates when `budgetStatus.constraint_type === constraintMatch`
  - Error message includes `external_system` and `resource` when available
- `tools/learning-loop-mcp/__tests__/gate-logic-budget.test.js`: 12 new unit tests covering scoped escalation
- `tools/learning-loop-mcp/__tests__/cross-surface.test.js`: updated `docker` and `sudo` expectedDecision from `escalate` to `block`
- `.claude/coordination/__tests__/bash-coordination-gate.test.cjs`: updated docker assertion
- `.claude/coordination/__tests__/gate-integration.test.cjs`: updated MCP gate check assertions

## Validation

- All 259 tests pass
- `pnpm validate:records` exits 0
- `pnpm extract:index` exits 0
- End-to-end gate behavior:
  - `sudo apt update` → `block` (no sudo observation, no matching budget)
  - `pnpm add` → `block` (no package-manager observation, no matching budget)
  - `curl api.vnstock.com` → `escalate` with correct reason: "Budget exhausted for constraint \"vendor-api\" (vnstock_vendor device_slots)."
  - `ls -la` → `ok` (not constrained)

## Post-Commit Finding: Pattern Matching False Positive

During the commit step, the bash gate blocked the `git commit` command because the commit message body contained the literal text `pnpm add` inside the explanation. The `matchConstraintPattern` regex matched `pnpm add` inside the quoted string, treating it as a package-manager command.

This reveals that the gate's `matchConstraintPattern` does not distinguish between actual commands and text inside quoted strings, commit messages, or heredocs. The commit eventually succeeded because the pre-commit hooks ran before the gate check completed.

This is a pre-existing issue separate from the budget escalation fix. Fixing it would require either:
- Teaching `matchConstraintPattern` to skip quoted string content, or
- Adding a special case for `git commit` messages in the bash gate

## Plan

- `plans/260529-budget-escalation/plan.md` — all 4 phases completed
