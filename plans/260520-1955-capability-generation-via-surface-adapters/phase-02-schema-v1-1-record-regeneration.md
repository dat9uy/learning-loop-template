---
phase: 2
title: "Schema v1.1 + Record Regeneration"
status: completed
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Schema v1.1 + Record Regeneration

## Overview

Transition capability schema to v1.1: make `id`, `status`, `created_at`, `updated_at`, `source_refs`, `supersedes` optional. Regenerate the two existing capability records using the new adapters. Validate that `pnpm validate:records` still passes.

## Requirements
- Functional: v1.1 schema validates both old hand-written records and new generated records
- Functional: Regenerated records use minimal format (`type`, `schema_version`, `stack`, `surface`, `maps[]`)
- Non-functional: Zero downtime — existing records stay valid during transition

## Architecture

Schema v1.1 is a backward-compatible stepping stone. All previously required fields become optional. No new fields are added — the schema simply relaxes requirements so generated minimal records validate.

## Related Code Files
- Modify: `schemas/capability.schema.json`
- Modify: `records/capabilities/capability-fastapi-reference-rest.yaml`
- Modify: `records/capabilities/capability-tanstack-reference-render.yaml`

## Implementation Steps
1. Update `schemas/capability.schema.json`:
   - Change `schema_version` const from `"1.0"` to `"1.1"` (or make it enum `["1.0", "1.1"]`)
   - Remove `id`, `status`, `created_at`, `updated_at`, `source_refs`, `supersedes` from `required`
   - Keep all properties in `properties` so old records still validate
2. Run `pnpm generate:capabilities` to regenerate the two records
3. Verify generated records match expected output:
   - `capability-fastapi-reference-rest.yaml`: 3 maps with `source` only
   - `capability-tanstack-reference-render.yaml`: 2 maps with `source` only
4. Run `pnpm validate:records` — must pass
5. Run `pnpm test` — must pass
6. Keep `schemas/capability-v1.1.schema.json` as a copy during transition window (removed in Phase 5 after v2.0 is stable)

## Success Criteria
- [x] `schemas/capability.schema.json` validates as v1.1
- [x] Old hand-written records (if any existed) would still pass v1.1
- [x] Regenerated records pass `pnpm validate:records`
- [x] Generated records contain only `type`, `schema_version`, `stack`, `surface`, `maps[]` with `source`
- [x] `capability-v1.1.schema.json` preserved as transition backup

## Risk Assessment
| Risk | Mitigation |
|------|-----------|
| Schema change breaks other record types | `capability.schema.json` is isolated; run full `validate:records` to confirm |
| Generated records lose information operators care about | Document in operator-guide that `route_class`/`response_class` are intentionally dropped; agents read product code for details |

## Security Considerations
- Schema relaxation does not introduce injection vectors
- `generated` flag is advisory only; no enforcement logic depends on it
