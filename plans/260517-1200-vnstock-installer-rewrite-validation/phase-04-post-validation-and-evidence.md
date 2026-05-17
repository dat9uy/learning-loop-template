---
phase: 4
title: "Post-Validation and Evidence"
status: pending
priority: P2
effort: "1h"
dependencies: [3]
---

# Phase 4: Post-Validation and Evidence

## Overview

After operator confirms validation results, close the validation window, update budget, create experiment record, and update relevant claims/observations. Zero slots consumed in this phase.

**Conditional:** Budget update depends on validation outcome. Failed validation may not have consumed a slot.

## Requirements

- Functional: budget YAML updated, validation window closed, experiment record created
- Non-functional: no state mutations until operator confirms Phase 3 results

## Related Code Files

- Modify: `records/observations/observation-vnstock-resource-budget.yaml` (operator writes)
- Create: `records/experiments/experiment-vnstock-installer-rewrite-validation-YYYYMMDDTHHMMSSZ.yaml`
- Read: `records/observations/observation-vnstock-device-slot-ledger.yaml`

## Implementation Steps

### Step 1: Operator confirms device state

Ask operator to check vendor UI at https://vnstocks.com/account?section=devices:
- Confirm exactly 1 device visible (validation passed) OR 0 devices (validation failed, slot not consumed)
- Confirm device registration timestamp matches validation run
- If unexpected state (2+ devices): investigate before proceeding

### Step 2: Close validation window

Operator updates budget YAML — preserve all existing fields, only change these:

```yaml
# CHANGES ONLY — preserve all other fields (id, schema_version, type, etc.)
validation_window:
  active: false
  opened_at: "<keep original value from Phase 1>"
  closed_at: "<current ISO-8601 timestamp>"
  reason: "validation completed"
```

### Step 3: Update budget (conditional on outcome — Finding #6)

**If validation PASSED** (operator confirms 1 device in UI):
```yaml
# CHANGES ONLY — preserve all other fields
current: 1
last_verified: "<current ISO-8601 timestamp>"
operator_notes: "Validation run completed. Device registered. Script with stale-container guard verified."
```

**If validation FAILED** (operator confirms 0 devices in UI):
```yaml
# CHANGES ONLY — preserve all other fields
current: 0
last_verified: "<current ISO-8601 timestamp>"
operator_notes: "Validation failed. No device registered. Slot not consumed. Fix script and retry."
```

If validation failed, the agent should NOT update `current` — the slot may not have been consumed. The operator decides whether to reset or investigate.

### Step 4: Create experiment record

Create `records/experiments/experiment-vnstock-installer-rewrite-validation-YYYYMMDDTHHMMSSZ.yaml`:

```yaml
id: experiment-vnstock-installer-rewrite-validation-YYYYMMDDTHHMMSSZ
type: experiment
status: verified  # or rejected
created_at: "<timestamp>"
capability: vnstock-data
hypothesis: "Rewritten install-vnstock.sh with stale-container guard correctly installs vnstock_data in fresh Docker container"
method: "Docker sandbox validation with --yes-i-know flag, named volume for .venv isolation"
result: "PASS"  # or "FAIL"
evidence:
  - type: script_output
    description: "Install script exit code and output"
  - type: api_response
    description: "vnstock_data.listing.all_symbols() response"
  - type: vendor_ui
    description: "Device count in vendor web UI"
findings:
  - "Install script exited 0"
  - "vnstock_data import check passed"
  - "API ping test passed"
  - "Stale-container guard did not trigger (fresh container)"
  - "Named volume prevented host filesystem mutation"
slot_impact:
  new_slot_consumed: true  # or false if validation failed before reaching installer
  total_after: 1           # or 0
```

### Step 5: Update slot ledger

If slot was consumed, append to `records/observations/observation-vnstock-device-slot-ledger.yaml`:
```yaml
- event: "validation run (rewrite)"
  date: "<timestamp>"
  slot_change: "+1"
  cumulative: "1/1"
  experiment: "experiment-vnstock-installer-rewrite-validation-..."
  notes: "Fresh Docker container, install script with stale-container guard, named volume for .venv"
```

### Step 6: Update claims/observations (if new findings)

If the validation revealed new findings (e.g., vendor behavior change, script edge case):
- Update relevant claim records
- Create new observation records if needed
- Update meta-reflection journal if significant

### Step 7: Run record validation

```bash
pnpm check
```
- Expect: all records valid, no cross-ref errors
- If fails: fix record issues before marking complete

## Success Criteria

- [ ] Operator confirmed device state (1 device if passed, 0 if failed)
- [ ] Validation window closed in budget YAML
- [ ] Budget updated correctly (current: 1 if passed, 0 if failed)
- [ ] Experiment record created with correct PASS/FAIL result
- [ ] Slot ledger updated (if slot consumed)
- [ ] Claims/observations updated if new findings
- [ ] `pnpm check` passes

## Risk Assessment

- Low risk: no budget-consuming actions, all operator-gated
- If `pnpm check` fails: fix record issues before marking complete
- Conditional budget update prevents false exhaustion from failed validations
