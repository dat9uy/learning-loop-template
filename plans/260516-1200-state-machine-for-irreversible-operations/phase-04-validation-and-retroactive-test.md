---
phase: 4
title: "Validation + Retroactive Test"
status: pending
priority: P2
effort: "2h"
dependencies: [1, 2, 3]
---

# Phase 4: Validation + Retroactive Test

## Overview

Prove the mechanism works with structural tests, then retroactively validate against the vnstock phase2 failure. No vendor interaction, no Docker, no slots consumed.

## Requirements

- Functional: four structural tests prove gating works (block on exhausted, constrain on available, defer on window active, warn on stale); retroactive test proves phase2 failure would have been prevented
- Non-functional: tool tests run via `pnpm test`; structural tests are manual skill invocations documented in journal

## Related Code Files

- Modify: `tools/check-budget/check-budget.test.js` (expand from Phase 2)
- Modify: `records/observations/observation-vnstock-resource-budget.yaml` (test scenarios)
- Read (for retroactive analysis): `docs/journals/260516-vnstock-phase2-validation-session-critique.md`, `plans/260515-vnstock-installer-rewrite/plan.md.archived-20260516`

## Implementation Steps

1. **Structural test: budget exhausted → block signal**
   - Set budget YAML to `current: 1, budget: 1`
   - Invoke skill with intent "run vnstock installer validation"
   - Verify output is BLOCKED signal, not a prompt
   - Verify output includes current state (1/1) and operator action required

2. **Structural test: budget available → constrained prompt**
   - Set budget YAML to `current: 0, budget: 1`
   - Invoke skill with intent "run vnstock installer validation"
   - Verify output is a prompt containing:
     - "Budget: 0/1 remaining" or equivalent
     - Hard-stop language ("ANY check failure = STOP")
     - "Operator must update budget YAML after this action"

3. **Structural test: validation window active → deferred signal**
   - Set budget YAML to `validation_window: { active: true, ... }`
   - Invoke skill with intent "run vnstock installer validation"
   - Verify output is DEFERRED signal with window protocol

4. **Structural test: stale budget → warning**
   - Set budget YAML to `last_verified: "2026-05-01T00:00:00Z"` (15 days ago)
   - Invoke skill with intent "run vnstock installer validation"
   - Verify output includes staleness warning

5. **Retroactive validation: would phase2 failure have been prevented?**
   - Walk through the phase2 critique timeline with the new rules:
     - After first validation run (installer succeeded, import check failed) → would skill have blocked?
     - During local Python import tests → would validation window have prevented?
     - "PENDING RE-RUN" rationalization → would hard-stop rule have caught it?
   - Document findings: which failures prevented, which still possible
   - Identify any gaps in the rules

6. **Run full test suite**: `pnpm test` to verify all tool tests pass

7. **Write journal entry**: document the validation results and retroactive analysis

## Success Criteria

- [ ] Structural test 1: budget exhausted → BLOCKED signal returned
- [ ] Structural test 2: budget available → constrained prompt with budget context
- [ ] Structural test 3: validation window → DEFERRED signal returned
- [ ] Structural test 4: stale budget → WARNING in output
- [ ] Retroactive analysis: phase2 failure walk-through documented
- [ ] All tests pass via `pnpm test`
- [ ] Journal entry written

## Risk Assessment

- Low risk: tests use mock YAML, no vendor interaction
- Retroactive analysis may reveal gaps in rules — document as follow-up items, not blockers
- Agent rationalization is behavioral, not structural — structural gates reduce risk but cannot eliminate it entirely
