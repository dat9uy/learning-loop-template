---
phase: 5
title: "Schema Documentation"
status: pending
priority: P3
effort: 30m
dependencies: []
---

# Phase 5: Schema Documentation

## Overview

Document that observation and resource-budget schemas are independent (NOT inheritance). Add `constraint_type` field convention to observation docs. Clarify that both schemas coexist in `records/observations/` directory.

## Context Links

- Observation schema: `schemas/observation.schema.json`
- Budget schema: `schemas/resource-budget.schema.json`
- Brainstorm: `plans/reports/brainstorm-20260517-constraint-gate-architecture.md` (Schema Clarification section)

## Requirements

- Remove inheritance claim — schemas are independent, share only `id` field and directory
- Document `constraint_type` field convention for observations (used by constraint gate matching)
- Document that `constraint` field is a freeform extension (not in schema, used by gate logic)
- Update `docs/artifact-reference.md` with clarification
- No schema structural changes (fields unchanged)

## Related Code Files

- Modify: `docs/artifact-reference.md` (add clarification)

## Implementation Steps

1. Read current `docs/artifact-reference.md`
2. Add section clarifying schema relationship:
   - `observation.schema.json` and `resource-budget.schema.json` are independent schemas
   - Both coexist in `records/observations/` directory
   - Shared: `id` field convention
   - Budget is NOT a specialization of observation
3. Document `constraint_type` convention:
   - Observations may include `constraint_type` field (e.g., `sudo`, `docker`)
   - Used by constraint gate for matching against constrained actions
   - Not enforced by schema (freeform extension)
4. Verify `pnpm validate:records` still passes

## Success Criteria

- [ ] No false inheritance claim in docs
- [ ] `constraint_type` convention documented
- [ ] `pnpm validate:records` still passes (no structural changes)

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Docs update conflicts with other plans | Read current artifact-reference.md first |
| Existing docs reference inheritance | Search for "extends" or "inherit" and correct |

## Regression Gate

```bash
pnpm validate:records
```
