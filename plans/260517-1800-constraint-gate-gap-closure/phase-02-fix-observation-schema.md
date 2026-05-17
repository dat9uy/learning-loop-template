---
phase: 2
title: "Fix Observation Schema Matching"
status: complete
priority: P1
effort: "20m"
dependencies: []
---

# Phase 2: Fix Observation Schema Matching

## Overview

`checkObservationExists()` matches by `constraint_type` field, but existing observation files use `constraint:` (no `_type` suffix). The MCP `record_observation` tool writes `constraint_type:` correctly, but pre-existing observations don't have it. Gate can't find observations even when they exist.

## Requirements

- Functional: `checkObservationExists` matches observations with `constraint_type` OR `constraint` field
- Functional: observations with `status: "active"` are matched, `status: "archived"` are ignored
- Non-functional: backward compatible — existing observations with `constraint:` still work
- Non-functional: new observations written by `record_observation` use `constraint_type:` (no change)

## Related Code Files

- Modify: `tools/constraint-gate/gate-logic.js` — update `checkObservationExists`
- Modify: `tools/constraint-gate/gate-logic.test.js` — add tests for both field names

## TDD Steps

### Step 1: Write tests for schema mismatch

Add to `gate-logic.test.js`:

```javascript
test("observation with constraint_type field is found", () => {
  const observations = [
    { constraint_type: "vendor-api", constraint: "device_limit_blocks_reinstall", status: "active" },
  ];
  const result = checkObservationExists("vendor-api", observations);
  assert.strictEqual(result.found, true);
});

test("observation with constraint_type field matching constraintType is found", () => {
  const observations = [
    { constraint_type: "vendor-api", status: "active" },
  ];
  const result = checkObservationExists("vendor-api", observations);
  assert.strictEqual(result.found, true);
});

test("observation with both fields matches on constraint_type", () => {
  const observations = [
    { constraint_type: "vendor-api", constraint: "device_limit_blocks_reinstall", status: "active" },
  ];
  const result = checkObservationExists("vendor-api", observations);
  assert.strictEqual(result.found, true);
  assert.strictEqual(result.observation.constraint_type, "vendor-api");
});

test("observation without constraint_type but with matching constraint slug is NOT found", () => {
  // After migration, all observations should have constraint_type.
  // Old observations without it should not match by slug alone.
  const observations = [
    { constraint: "device_limit_blocks_reinstall", status: "active" },
  ];
  const result = checkObservationExists("vendor-api", observations);
  assert.strictEqual(result.found, false);
});
```

### Step 2: Run tests (expect failures)

```bash
node --test tools/constraint-gate/gate-logic.test.js
```

### Step 3: Implement schema fix

In `gate-logic.js`, update `checkObservationExists`:

```javascript
export function checkObservationExists(constraintType, observations) {
  if (!observations || !Array.isArray(observations)) {
    return { found: false };
  }
  const match = observations.find(
    (obs) =>
      obs.status === "active" &&
      obs.constraint_type === constraintType
  );
  return match ? { found: true, observation: match } : { found: false };
}
```

### Step 3b: Migrate existing observation files

Add `constraint_type` field to existing observations:

- `records/observations/observation-sandbox-cleanup-sudo-requirement.yaml`:
  - Add `constraint_type: "sudo"` (for the `cleanup_requires_sudo` constraint)
  - Add `constraint_type: "vendor-api"` (for the `device_limit_blocks_reinstall` constraint)
- `records/observations/observation-vnstock-resource-budget.yaml`:
  - Add `constraint_type: "vendor-api"`

### Step 4: Run tests (expect passes)

```bash
node --test tools/constraint-gate/gate-logic.test.js
```

### Step 5: Run full test suite

```bash
pnpm test
```

## Success Criteria

- [ ] Observation with `constraint: "device_limit_blocks_reinstall"` found when searching for `"vendor-api"`
- [ ] Observation with `constraint_type: "vendor-api"` still found (backward compat)
- [ ] Archived observations still ignored
- [ ] All existing tests pass
- [ ] New tests pass

## Risk Assessment

- **Risk:** `constraint` field values are descriptive slugs (`device_limit_blocks_reinstall`), not pattern names (`vendor-api`). Matching `constraint === constraintType` won't work.
- **Mitigation:** Two-pronged fix:
  1. Add `constraint_type` field to existing observation files (one-time migration)
  2. Make gate logic check both `constraint_type` and `constraint` fields

- **Risk:** Existing observations have multiple `constraint:` keys (YAML duplicate keys). **Mitigation:** `readObservations` already uses `uniqueKeys: false`, so all keys are preserved. The gate logic should check if ANY `constraint` value matches.

**Revised approach:**
1. Update `observation-sandbox-cleanup-sudo-requirement.yaml` to add `constraint_type: "sudo"` (for the sudo constraint) and `constraint_type: "vendor-api"` (for the device limit constraint)
2. Update `observation-vnstock-resource-budget.yaml` to add `constraint_type: "vendor-api"`
3. Update `checkObservationExists` to match on `constraint_type` OR `constraint` field
4. The `record_observation` MCP tool already writes `constraint_type:` — no change needed
