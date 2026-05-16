---
phase: 1
title: Schema + Migration
status: completed
priority: P1
effort: 30m
dependencies: []
---

# Phase 1: Schema + Migration

## Overview

Create `schemas/observation.schema.json` with loose common envelope. Migrate 3 existing observation files to add envelope fields (`type`, `schema_version`, `status`, `source_refs`, `created_at`, `updated_at`).

## Requirements

- Functional: schema validates all 3 existing observation files; files have `type: observation`
- Non-functional: schema is loose (no `additionalProperties: false`) so body fields stay freeform

## Related Code Files

- Create: `schemas/observation.schema.json`
- Modify: `records/observations/observation-vnstock-resource-budget.yaml`
- Modify: `records/observations/observation-vnstock-device-slot-ledger.yaml`
- Modify: `records/observations/observation-vnstock-import-reactivates-cleared-device.yaml`

## Implementation Steps

1. Create `schemas/observation.schema.json`:
   - Required: `id`, `schema_version`, `type`, `status`, `created_at`, `updated_at`, `source_refs`
   - `type`: const `"observation"`
   - `status`: enum `["active", "archived"]`
   - `source_refs`: array of strings, pattern `^(local|record|legacy):.+`
   - `notes`: optional string
   - No `additionalProperties: false`

2. Migrate `observation-vnstock-resource-budget.yaml`:
   - Add: `schema_version: "1.0"`, `type: observation`, `status: active`
   - Add: `created_at` (use `last_verified` value or current ISO timestamp)
   - Add: `updated_at` (current ISO timestamp)
   - Add: `source_refs: []` (no upstream refs)
   - Keep all existing body fields untouched

3. Migrate `observation-vnstock-device-slot-ledger.yaml`:
   - Add: `schema_version: "1.0"`, `type: observation`, `status: active`
   - Add: `source_refs: []`
   - Already has `created_at` and `updated_at` — keep as-is
   - Keep all existing body fields untouched

4. Migrate `observation-vnstock-import-reactivates-cleared-device.yaml`:
   - Add: `schema_version: "1.0"`, `type: observation`, `status: active`
   - Add: `source_refs: []`
   - Already has `created_at` and `updated_at` — keep as-is
   - Keep all existing body fields untouched

## Success Criteria

- [ ] `schemas/observation.schema.json` exists and is valid JSON Schema
- [ ] All 3 observation files have `type: observation` field
- [ ] All 3 observation files pass AJV validation against the new schema
- [ ] No body fields were lost or altered during migration

## Risk Assessment

- Low risk: purely additive schema and field additions
- Migration risk: YAML formatting changes — verify files still parse
