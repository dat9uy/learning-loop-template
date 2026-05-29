---
phase: 1
title: "Tests-First"
status: completed
effort: "1h"
dependencies: []
---

# Phase 1: Tests-First

## Overview

Write tests that capture the correct behavior for scoped budget escalation. These tests will fail against the current implementation. The bug is: `evaluateBudget` returns a boolean, and `makeGateDecision` escalates for any exhausted budget regardless of constraint match.

## Requirements

- **Functional:** `evaluateBudget` returns `constraint_type`, `external_system`, `resource` alongside `exhausted` and `windowActive`.
- **Functional:** `makeGateDecision` only escalates when the exhausted budget's `constraint_type` matches the command's `constraintMatch`.
- **Functional:** `makeGateDecision` error message includes `external_system` and `resource`.

## Test Plan

### Unit tests for `gate-logic.js` (new file: `__tests__/gate-logic-budget.test.js`)

1. `makeGateDecision` with `constraintMatch: "vendor-api"` and budget with `constraint_type: "vendor-api"` and `exhausted: true` → escalates
2. `makeGateDecision` with `constraintMatch: "package-manager"` and budget with `constraint_type: "vendor-api"` and `exhausted: true` → ok (no escalation)
3. `makeGateDecision` with `constraintMatch: "sudo"` and budget with `constraint_type: "sudo"` and `exhausted: true` → escalates
4. `makeGateDecision` with `constraintMatch: "vendor-api"` and budget with `constraint_type: "vendor-api"` and `exhausted: true` → error message includes `external_system` and `resource`
5. `makeGateDecision` with `constraintMatch: "vendor-api"` and budget with `constraint_type: "vendor-api"` and `windowActive: true` → escalates
6. `makeGateDecision` with `constraintMatch: "vendor-api"` and budget with `constraint_type: "vendor-api"` and `exhausted: false` → ok

### Unit tests for `evaluateBudget` (in `__tests__/gate-logic-budget.test.js`)

1. `evaluateBudget` with `budget: 1, current: 1` → returns `{ exhausted: true, remaining: 0, constraint_type: "vendor-api", external_system: "vnstock_vendor", resource: "device_slots" }`
2. `evaluateBudget` with `budget: 1, current: 0` → returns `{ exhausted: false, remaining: 1, ... }`
3. `evaluateBudget` with missing fields → returns `{ exhausted: false, windowActive: false }` (fail-open)

## Success Criteria

- [x] `__tests__/gate-logic-budget.test.js` created with all test cases
- [x] Tests run and fail against current implementation (TDD red phase)
- [x] Tests cover the four scenarios in the bug report
- [x] No changes to existing test files in this phase
