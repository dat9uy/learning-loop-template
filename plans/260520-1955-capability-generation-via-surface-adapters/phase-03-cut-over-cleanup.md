---
phase: 3
title: "Cut-over + Cleanup"
status: completed
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: Cut-over + Cleanup

## Overview

Delete the old drift validator entirely. Update `pnpm check` to use `generate:capabilities --dry-run` instead of `validate:drift`. Verify no regressions in the validation pipeline.

## Requirements
- Functional: `tools/validate-capability-product-drift/` deleted
- Functional: `validate:drift` script removed from `package.json`
- Functional: `pnpm check` = `generate:capabilities --dry-run && validate:records && test`
- Non-functional: No stale references to deleted validator in docs or code

## Related Code Files
- Delete: `tools/validate-capability-product-drift/` (entire directory)
- Delete: `tools/generate-openapi/` (entire directory — superseded by FastAPI adapter)
- Modify: `package.json` — remove `validate:drift`, update `check` script

## Implementation Steps
1. Delete `tools/validate-capability-product-drift/` directory
2. Delete `tools/generate-openapi/` directory (OpenAPI generation now lives inside the FastAPI adapter)
3. Update `package.json`:
   - Remove `"validate:drift": "..."`
   - Update `"check": "pnpm generate:capabilities --dry-run && pnpm validate:records && pnpm test"`
4. Run `pnpm check` — must pass
5. Grep for stale references:
   - `grep -r "validate-capability-product-drift" . --include="*.md" --include="*.js" --include="*.json" --include="*.yaml"`
   - `grep -r "validate:drift" . --include="*.md" --include="*.js" --include="*.json"`
   - `grep -r "generate-openapi" . --include="*.md" --include="*.js" --include="*.json"`
6. Fix any found references

## Success Criteria
- [x] `tools/validate-capability-product-drift/` does not exist
- [x] `tools/generate-openapi/` does not exist
- [x] `pnpm check` passes end-to-end
- [x] No stale references to deleted tools anywhere in repo
- [x] Git diff shows only deletions and script updates

## Risk Assessment
| Risk | Mitigation |
|------|-----------|
| Something else depends on `generate-openapi.py` | Grep before delete; FastAPI adapter embeds same logic |
| `pnpm check` fails due to `--dry-run` exit code | Verify exit code behavior: diff → exit 1, no diff → exit 0 |
| Deleted tool referenced in historical docs/plans | Historical plans/journals are exempt per rules; only active docs matter |

## Security Considerations
- Deleting code reduces attack surface
- Verify no secrets or credentials in deleted directories before commit
