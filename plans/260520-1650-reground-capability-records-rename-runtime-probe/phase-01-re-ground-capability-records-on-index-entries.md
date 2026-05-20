---
phase: 1
title: "Re-ground capability records on index entries"
status: completed
priority: P1
effort: "30m"
dependencies: []
---

# Phase 1: Re-ground capability records on index entries

## Overview

Replace frozen-claim `source_refs` in capability records with live index entry references. This restores the agent-orientation chain: capability record → index assertion → evidence → experiment → runtime probe.

## Requirements

- Functional: `capability-fastapi-reference-rest` cites the live assertion about vnstock_data runtime surfaces.
- Functional: `capability-tanstack-reference-render` cites the same live assertion (web stack has no external library probes; it grounds on the API layer which is verified by the same runtime probe).
- Non-functional: `updated_at` bumped on both records.
- Non-functional: `pnpm validate:records` passes.

## Architecture

Current broken chain:
```
capability-fastapi-reference-rest
  → source_ref[0]: record:claim-product-fastapi-reference  (FROZEN)
  → source_ref[1]: local:product/api/capabilities/.../capability-01-reference.py

capability-tanstack-reference-render
  → source_ref[0]: record:claim-product-tanstack-reference-view  (FROZEN)
  → source_ref[1]: local:product/api/capabilities/.../capability-01-reference.py
```

Target chain:
```
capability-fastapi-reference-rest
  → source_ref[0]: record:assertion-vnstock-data-runtime-live-api-surfaces-verified  (LIVE)
  → source_ref[1]: local:product/api/capabilities/.../capability-01-reference.py

capability-tanstack-reference-render
  → source_ref[0]: record:assertion-vnstock-data-runtime-live-api-surfaces-verified  (LIVE)
  → source_ref[1]: local:product/api/capabilities/.../capability-01-reference.py
```

The live assertion is `records/index/assertion-vnstock-data-runtime-live-api-surfaces-verified.yaml` (id: `assertion-vnstock-data-runtime-live-api-surfaces-verified`), which asserts: "Live API calls across Reference, Market, Fundamental, Insights, and Macro surfaces succeed with metadata-only output capture."

## Related Code Files

- Modify: `records/capabilities/capability-fastapi-reference-rest.yaml`
- Modify: `records/capabilities/capability-tanstack-reference-render.yaml`

## Implementation Steps

1. Read `records/capabilities/capability-fastapi-reference-rest.yaml`.
2. Replace line 8:
   ```yaml
   # OLD
     - record:claim-product-fastapi-reference
   # NEW
     - record:assertion-vnstock-data-runtime-live-api-surfaces-verified
   ```
3. Update `updated_at` to current ISO timestamp.
4. Read `records/capabilities/capability-tanstack-reference-render.yaml`.
5. Replace line 8:
   ```yaml
   # OLD
     - record:claim-product-tanstack-reference-view
   # NEW
     - record:assertion-vnstock-data-runtime-live-api-surfaces-verified
   ```
6. Update `updated_at` to current ISO timestamp.
7. Run `pnpm validate:records` and fix any cross-reference errors.
8. Manually trace the agent-orientation flow to verify the chain is unbroken:
   - Read `capability-fastapi-reference-rest` → follow `source_refs[0]` → read `assertion-vnstock-data-runtime-live-api-surfaces-verified` → follow its `source_refs` → read evidence → read experiment → read probe.

## Success Criteria

- [x] `capability-fastapi-reference-rest.yaml` has `source_refs[0] == record:assertion-vnstock-data-runtime-live-api-surfaces-verified`.
- [x] `capability-tanstack-reference-render.yaml` has `source_refs[0] == record:assertion-vnstock-data-runtime-live-api-surfaces-verified`.
- [x] Neither record references any `record:claim-*` in `source_refs`.
- [x] `pnpm validate:records` passes.
- [x] Manual agent-orientation flow trace succeeds end-to-end.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Validator rejects new `source_refs` due to cross-ref schema constraints | Run `pnpm validate:records` immediately after edit; the assertion id exists and is active |
| Tanstack record referencing API-layer assertion feels semantically off | Documented in brainstorm: web stack probes the API layer (internal), not external libraries. Asymmetry is correct |
