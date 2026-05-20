---
title: "Capability-to-Product Validation Tool"
description: "Build surface-based drift validator using OpenAPI for HTTP/REST and regex for TanStack, with extensible parser registry"
status: completed
priority: P2
effort: "5h"
branch: "main"
tags: [infra, validation, backend, frontend]
blockedBy: []
blocks: []
created: "2026-05-20"
---

# Capability-to-Product Validation Tool

## Overview

Build a surface-based drift validator that checks whether product code implements every `route_class` declared in capability records. This makes the Layer 2 (Surface Mapping) → Layer 3 (Product Implementation) connection machine-checkable per the three-layer capability model defined in `plans/reports/brainstorm-20260520-three-layer-capability-model.md`.

The validator uses a **parser registry keyed by `surface`** (not `stack`). Current surfaces:
- `HTTP/REST` → Generate OpenAPI spec from FastAPI app, validate against JSON
- `TanStack Start route` → Regex parser for route definitions

This design makes adding future surfaces (gRPC, GraphQL, Django REST) a matter of registering one parser function. The architecture is documented explicitly in `docs/operator-guide.md` under capability validation.

## Cross-Plan Dependencies

| Relationship | Plan | Status |
|-------------|------|--------|
| Prerequisite | `260520-1650-reground-capability-records-rename-runtime-probe` | completed |

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Research & Design](./phase-01-research-design.md) | Completed |
| 2 | [Implement Validator](./phase-02-implement-validator.md) | Completed |
| 3 | [Tests & Integration](./phase-03-tests-integration.md) | Completed |

## Dependencies

- Brainstorm report: `plans/reports/brainstorm-20260520-three-layer-capability-model.md`
- Existing validation framework: `tools/validate-records/`
- Capability records: `records/capabilities/capability-fastapi-reference-rest.yaml`, `capability-tanstack-reference-render.yaml`
- Product code: `product/api/src/main.py`, `product/web/src/router.tsx` and route files
- OpenAPI generator: `tools/generate-openapi/generate-openapi.py` (new)

## Validation Log

### Verification Results
- Claims checked: 6
- Verified: 6 | Failed: 0 | Unverified: 0
- Tier: Standard
- OpenAPI generation verified at `product/api/src/main.py` with `vnstock_data` stubbing — produces 4 paths including all 3 reference routes
- Surface field verified on both capability records (`HTTP/REST`, `TanStack Start route`)

### Validation Session 1 — Architecture Decisions
- **OpenAPI vs regex for HTTP/REST:** User confirmed OpenAPI is correct. Plan pivoted from FastAPI regex to OpenAPI generation.
- **Parser registry keyed by `surface`:** User validated concern about FastAPI-structure coupling. Surface-based registry eliminates stack-specific coupling.
- **Integration:** Separate script (`validate:drift`), separate CI step. Hard failures on drift.
- **API router discovery:** Flat scan of `product/api/src/routers/*.py` via OpenAPI generation (no file walking needed).

### Validation Session 2 — Implementation Decisions
- **OpenAPI caching:** Regenerate every time. No stale cache risk.
- **Validation direction:** One-way only (capability → product). Internal routes like `/health` are not flagged.
- **Tool location:** New directory `tools/validate-capability-product-drift/`. Clean separation from record validation.

### Whole-Plan Consistency Sweep
- No contradictions found. All phase files reference OpenAPI + surface registry consistently.
- Phase 2 `Related Code Files` lists `tools/generate-openapi/generate-openapi.py` and `tools/validate-capability-product-drift/` — matches tool location decision.
- Phase 3 `Integration Wiring` documents `validate:drift` as standalone script — matches integration decision.
- No stale regex API parser references remain in any phase file.
