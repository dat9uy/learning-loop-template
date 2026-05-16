---
phase: 1
title: "Rules + Budget Schema"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Rules + Budget Schema

## Overview

Add state-machine rules to the learning-loop skill and create the budget YAML schema + initial vnstock budget file. No code changes — pure documentation and data.

## Requirements

- Functional: skill references include resource-budget rules; JSON schema validates budget YAML; initial vnstock budget file exists
- Non-functional: rules are clear enough that an agent cannot misinterpret them; schema catches malformed budgets

## Related Code Files

- Create: `.claude/skills/learning-loop/references/resource-budget-rules.md`
- Create: `schemas/resource-budget.schema.json`
- Create: `records/observations/observation-vnstock-resource-budget.yaml`

## Implementation Steps

1. Write `resource-budget-rules.md` in skill references:
   - Plans with irreversible operations MUST declare resource budget
   - Agent MUST check budget before any budget-consuming action
   - ANY check failure on budget-consuming action = STOP (not fix-and-retry)
   - Validation window: no state-changing actions between clearance and final report
   - After budget-consuming action, agent reports result and waits for operator confirmation
   - Operator-only writes to budget YAML; agent reads only
   - Staleness check: warn if `last_verified` is older than 7 days (fixed threshold)

2. Write `resource-budget.schema.json` in schemas/:
   - Fields: `id`, `external_system`, `resource`, `budget` (integer), `current` (integer), `last_verified` (datetime), `verification_method`, `operator_notes`, `validation_window` (object with `active`, `opened_at`, `closed_at`, `reason`)
   - Validation: `current <= budget`, `budget >= 1`, `last_verified` is valid ISO 8601

3. Write `observation-vnstock-resource-budget.yaml` in records/observations/:
   - `external_system: vnstock_vendor`
   - `resource: device_slots`
   - `budget: 1`
   - `current: 0` (operator cleared all devices)
   - `last_verified: 2026-05-16T04:00:00+07:00`
   - `validation_window: { active: false, opened_at: null, closed_at: null, reason: null }`

4. Update `learning-loop-rules.md` to reference the new resource-budget rules in the Source Docs section

## Success Criteria

- [ ] `resource-budget-rules.md` exists and covers all 7 rules
- [ ] `resource-budget.schema.json` validates the vnstock budget YAML
- [ ] `observation-vnstock-resource-budget.yaml` passes schema validation
- [ ] `learning-loop-rules.md` references the new rules file

## Risk Assessment

- Low risk: pure documentation and data files
- Schema may need iteration after Phase 2 tool consumes it — acceptable
