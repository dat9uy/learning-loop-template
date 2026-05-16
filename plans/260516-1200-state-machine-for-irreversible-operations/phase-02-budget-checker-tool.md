---
phase: 2
title: "Budget Checker Tool"
status: completed
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 2: Budget Checker Tool

## Overview

Build `tools/check-budget/check-budget.js` — a single self-contained Node.js script that reads budget YAML, validates against schema, and returns pass/fail + JSON state. This is the primary data source for the skill's gating logic.

## Requirements

- Functional: reads budget YAML, validates schema, checks `current < budget`, checks staleness (fixed 7-day threshold), outputs JSON state
- Non-functional: single self-contained file (~50 lines), not modular; exit codes: 0 = budget available, 1 = budget exhausted, 2 = error

## Related Code Files

- Create: `tools/check-budget/check-budget.js`
- Create: `tools/check-budget/check-budget.test.js`
- Modify: `package.json` (add `check:budget` script)
- Read (for patterns): `tools/validate-records/validate-records.js`, `schemas/resource-budget.schema.json`

## Implementation Steps

1. Create `tools/check-budget/` directory

2. Write `check-budget.js` (single self-contained file, no modular split):
   - Accept `--system` and `--resource` args (filter which budget to check)
   - Read all YAML files in `records/observations/` matching `*-resource-budget.yaml`
   - Validate each against `schemas/resource-budget.schema.json` using ajv
   - For matching budget: check `current >= budget` → exit 1 (exhausted)
   - Check staleness: if `last_verified` is older than 7 days (fixed), add `stale: true` to output
   - Check `validation_window.active` → add to output
   - Output JSON to stdout: `{ system, resource, budget, current, remaining, stale, validation_window_active, last_verified }`
   - Exit 0 = budget available, exit 1 = budget exhausted, exit 2 = error (file not found, invalid YAML, schema validation failed)
   - Use ESM imports (matching existing tools), but keep everything in one file

3. Write `check-budget.test.js`:
   - Test: budget available (current < budget) → exit 0
   - Test: budget exhausted (current >= budget) → exit 1
   - Test: stale budget (last_verified > 7 days) → output includes `stale: true`
   - Test: validation window active → output includes `validation_window_active: true`
   - Test: missing file → exit 2
   - Test: invalid YAML → exit 2

4. Add to `package.json` scripts:
   ```
   "check:budget": "node tools/check-budget/check-budget.js"
   ```

5. Run `pnpm test` to verify all tool tests pass

## Success Criteria

- [ ] `check-budget.js` reads budget YAML and returns correct exit codes
- [ ] JSON output includes all required fields
- [ ] Staleness check works with fixed 7-day threshold
- [ ] All tests pass via `pnpm test`
- [ ] `pnpm check:budget` works from project root

## Risk Assessment

- Medium risk: must match existing tool patterns (ajv, yaml, Node.js)
- Schema may need refinement if validation reveals edge cases — iterate with Phase 1
