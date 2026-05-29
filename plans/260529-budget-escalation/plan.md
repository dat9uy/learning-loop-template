---
title: "Scoped Budget Escalation in Constraint Gate"
description: "Fix the bug where exhausted domain budgets globally escalate any constrained command, regardless of constraint type match. The gate should only escalate when the command's constraint matches the budget's constraint type."
status: completed
priority: P1
branch: "main"
tags: [budget, gate, observation, fix, tdd]
blockedBy: []
blocks: []
created: "2026-05-29T09:10:19.150Z"
createdBy: "ck:plan"
source: skill
---

# Scoped Budget Escalation in Constraint Gate

## Overview

The gate's `makeGateDecision` treats any exhausted budget as a global escalation, blocking any command that matches a constraint pattern. A `pnpm add` (constraint: `package-manager`) gets blocked by the `vnstock` budget because the gate does not check whether the budget's `constraint_type` matches the command's `constraintMatch`. The error message also blames the wrong constraint: `"Budget exhausted for constraint 'package-manager'"` when the actual exhausted budget is `vendor-api`.

This plan implements Option A from `plans/reports/brainstorm-260529-budget-escalation-observation-scoping.md`: scope the budget escalation so that a `vendor-api` budget only escalates `vendor-api` commands, a `sudo` budget only escalates `sudo` commands, etc.

## Background

From `docs/journals/260527-workflow-coordination-integration.md` (Part 2, Debug Session):

> The gate conflates "any budget is exhausted" with "this specific command is blocked by that budget."
> The error message `"Budget exhausted for constraint 'package-manager'"` is counter-intuitive because adding a dev dependency does not consume a vendor device slot.

The current flow in `bash-gate.js`:

```
readBudgets() -> evaluateBudget() -> ANY exhausted budget triggers escalation
makeGateDecision(constraintMatch, observationStatus, budgetStatus)
  -> budgetStatus.exhausted -> escalate for constraintMatch (WRONG)
```

The fix:

```
readBudgets() -> evaluateBudget() -> returns { exhausted, constraint_type, external_system, resource }
makeGateDecision(constraintMatch, observationStatus, budgetStatus)
  -> budgetStatus.exhausted && budgetStatus.constraint_type === constraintMatch -> escalate (CORRECT)
```

## Phases

| Phase | Name | Status | Effort |
|-------|------|--------|--------|
| 1 | [Tests-First](./phase-01-tests-first.md) | Completed | 1h |
| 2 | [Gate Logic Refactor](./phase-02-gate-logic-refactor.md) | Completed | 1h |
| 3 | [Test Update](./phase-03-test-update.md) | Completed | 1h |
| 4 | [Integration Validation](./phase-04-integration-validation.md) | Completed | 1h |

## Dependencies

### Cross-Plan
- None. This is a targeted bug fix with no file overlap with active plans.

### Informed By
- `plans/reports/brainstorm-260529-budget-escalation-observation-scoping.md` — the brainstorm that identified this bug.
- `docs/observation-vs-meta-state.md` — the separation between gate (meta-level) and agent (domain-level).

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| Existing tests pass because they test the buggy behavior | Medium | Phase 3 updates all tests that assert `escalate` where `block` is correct |
| `evaluateBudget` API change breaks downstream consumers | Low | Only `gate-logic.js` and `bash-gate.js` consume it; both updated in this plan |
| Budget check removed entirely for mismatched constraints | Low | This is the correct behavior per the brainstorm report |

## Success Metrics

| Metric | Target |
|--------|--------|
| `pnpm add` no longer blocked by `vnstock` budget | Yes |
| `vendor-api` command with exhausted budget escalates correctly | Yes |
| Error message includes `external_system` and `resource` | Yes |
| All 224 tests pass | Yes |
| `cross-surface.test.js` updated for correct behavior | Yes |
