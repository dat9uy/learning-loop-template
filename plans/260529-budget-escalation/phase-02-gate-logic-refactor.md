---
phase: 2
title: "Gate Logic Refactor"
status: completed
effort: "1h"
dependencies: [1]
---

# Phase 2: Gate Logic Refactor

## Overview

Refactor `evaluateBudget` and `makeGateDecision` in `tools/learning-loop-mcp/core/gate-logic.js` to implement scoped budget escalation. The gate must only escalate when the exhausted budget's `constraint_type` matches the command's `constraintMatch`.

## Changes

### `evaluateBudget` (line ~88)

**Current:**
```javascript
export function evaluateBudget(budgetData) {
  if (!budgetData || typeof budgetData !== "object") {
    return { exhausted: false, windowActive: false };
  }
  const remaining = (budgetData.budget ?? 0) - (budgetData.current ?? 0);
  return {
    exhausted: (budgetData.current ?? 0) >= (budgetData.budget ?? 0),
    windowActive: budgetData.validation_window?.active === true,
    remaining,
  };
}
```

**Target:**
```javascript
export function evaluateBudget(budgetData) {
  if (!budgetData || typeof budgetData !== "object") {
    return { exhausted: false, windowActive: false };
  }
  const remaining = (budgetData.budget ?? 0) - (budgetData.current ?? 0);
  return {
    exhausted: (budgetData.current ?? 0) >= (budgetData.budget ?? 0),
    windowActive: budgetData.validation_window?.active === true,
    remaining,
    constraint_type: budgetData.constraint_type || null,
    external_system: budgetData.external_system || null,
    resource: budgetData.resource || null,
  };
}
```

### `makeGateDecision` (line ~104)

**Current:**
```javascript
if (budgetStatus?.exhausted || budgetStatus?.windowActive) {
  if (constraintMatch) {
    return {
      decision: "escalate",
      reason: budgetStatus.exhausted
        ? `Budget exhausted for constraint "${constraintMatch}".`
        : `Validation window active for constraint "${constraintMatch}".`,
      constraint_type: constraintMatch,
      observation_id: observationStatus?.observation?.id,
    };
  }
}
```

**Target:**
```javascript
if (budgetStatus?.exhausted || budgetStatus?.windowActive) {
  // Only escalate if the exhausted budget's constraint_type matches the command's
  if (constraintMatch && budgetStatus.constraint_type === constraintMatch) {
    const system = budgetStatus.external_system ? ` (${budgetStatus.external_system}` : "";
    const resource = budgetStatus.resource ? ` ${budgetStatus.resource}` : "";
    const suffix = system || resource ? `${system}${resource})` : "";
    return {
      decision: "escalate",
      reason: budgetStatus.exhausted
        ? `Budget exhausted for constraint "${constraintMatch}"${suffix}.`
        : `Validation window active for constraint "${constraintMatch}"${suffix}.`,
      constraint_type: constraintMatch,
      observation_id: observationStatus?.observation?.id,
    };
  }
}
```

## Risk: Side-Effect Import

The `side-effect-import` constraint is a hard block regardless of budget. This code path is unchanged:

```javascript
if (constraintMatch === "side-effect-import") {
  return { decision: "block", ... };
}
```

This is correct. `side-effect-import` is a meta-level safety gate, not a budgeted domain resource.

## Success Criteria

- [x] `evaluateBudget` returns `constraint_type`, `external_system`, `resource`
- [x] `makeGateDecision` only escalates when budget `constraint_type` matches command `constraintMatch`
- [x] Error message includes `external_system` and `resource` when available
- [x] `side-effect-import` hard block unchanged
- [x] Phase 1 tests pass (green phase)
