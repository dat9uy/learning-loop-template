---
phase: 1
title: "Research & Design"
status: completed
priority: P2
effort: "1h"
dependencies: []
---

# Phase 1: Research & Design

## Context Links

- Brainstorm report: `plans/reports/brainstorm-20260520-three-layer-capability-model.md`
- Capability records: `records/capabilities/capability-fastapi-reference-rest.yaml`, `capability-tanstack-reference-render.yaml`
- API product code: `product/api/src/main.py`, `product/api/src/routers/reference.py`
- Web product code: `product/web/src/router.tsx`, `product/web/src/routes/reference/equity.tsx`, `product/web/src/routes/reference/company.$symbol.tsx`
- Existing validator: `tools/validate-records/validate-records.js`, `tools/validate-records/record-loader.js`, `tools/validate-records/record-validation-rules.js`
- API tests (stubbing pattern): `product/api/tests/test_reference.py`

## Overview

Design a surface-based drift validator. For `HTTP/REST` surfaces, generate OpenAPI spec from FastAPI app and validate capability records against it. For `TanStack Start route` surfaces, use regex parser. Design an extensible parser registry so future surfaces plug in without touching existing code.

## Key Insights

- **OpenAPI is the canonical HTTP/REST surface description.** FastAPI generates it natively. Capability `route_class: GET /reference/equity` maps directly to `openapi.paths["/reference/equity"].get`.
- **OpenAPI generation is viable.** The test suite already stubs `vnstock_data` before importing the router (`tests/test_reference.py:7-10`). Reuse this pattern in a Python script that imports `src.main`, calls `app.openapi()`, and outputs JSON.
- **Parser registry keyed by `surface`, not `stack`.** The capability record's `surface` field (`HTTP/REST`, `TanStack Start route`) is the stable discriminator. Future surfaces (gRPC, GraphQL, Django REST) register one parser each.
- **API `route_class` format:** `<METHOD> <path>` e.g. `GET /reference/equity`
- **Web `route_class` format:** `<path>` e.g. `/reference/equity` or `/reference/company/$symbol`
- **Record loader** already filters by `type: capability` and exposes `__file`, `surface`, `maps[]`

## Requirements

- Functional: Design OpenAPI generation script for FastAPI app
- Functional: Design OpenAPI-to-capability comparison logic
- Functional: Design regex parser for TanStack routes
- Functional: Design surface-based parser registry
- Non-functional: No AST dependencies for any parser
- Non-functional: Error messages must cite capability record file, map index, expected route, and surface type

## Architecture

### Data Flow

```
capability records (records/capabilities/*.yaml)
  → loadRecords() → filter type===capability
    → group by surface
      → surface === "HTTP/REST"
        → run generate-openapi.py (stubs vnstock_data, imports app, outputs JSON)
        → parseOpenApiPaths(openapiJson) → Map<"METHOD path", true>
      → surface === "TanStack Start route"
        → parseTanStackRoutes(root) → Map<path, true>
      → surface === unknown
        → warning: unsupported surface, drift check skipped
    → compare maps[].route_class against extracted routes
      → drift errors: "capability drift: {file} map[{i}] route_class {route} not found (surface: {surface})"
```

### Parser Registry

```javascript
const surfaceParsers = {
  "HTTP/REST": validateHttpRestDrift,
  "TanStack Start route": validateTanStackDrift,
};
```

**Adding a future surface:** Register one function in `surfaceParsers`. No changes to `validateCapabilityProductDrift` core logic.

### OpenAPI Generation

**Script:** `tools/generate-openapi/generate-openapi.py`
- Stubs `vnstock_data` (same pattern as `tests/test_reference.py`)
- Imports `src.main` from `product/api`
- Calls `app.openapi()`
- Prints JSON to stdout

**Node.js validator** runs it via `child_process.spawn` with `cwd: product/api` and `python` from `.venv`, or reads a cached `product/api/openapi.json`.

### TanStack Parser

Same as original design:
- Read `router.tsx`, extract `import { xyzRoutePath } from './routes/...'`
- Extract `createRoute({ path: xyzRoutePath })`
- Read route files, extract `export const xyzRoutePath = '...'`
- Return lookup map of paths

## Related Code Files

- Read: `tools/validate-records/record-loader.js`
- Read: `records/capabilities/capability-fastapi-reference-rest.yaml`
- Read: `records/capabilities/capability-tanstack-reference-render.yaml`
- Read: `product/api/src/routers/reference.py`
- Read: `product/api/tests/test_reference.py` (stubbing pattern)
- Read: `product/web/src/router.tsx`
- Read: `product/web/src/routes/reference/equity.tsx`
- Read: `product/web/src/routes/reference/company.$symbol.tsx`

## Implementation Steps

1. Verify OpenAPI generation works manually:
   ```bash
   cd product/api && uv run python -c "
   import sys, types
   sys.modules['vnstock_data'] = types.ModuleType('vnstock_data')
   sys.modules['vnstock_data'].Reference = object
   from src.main import app
   import json
   print(json.dumps(app.openapi()))
   " > /tmp/openapi.json
   ```
2. Verify OpenAPI JSON contains paths `/reference/equity`, `/reference/company/{symbol}`, `/reference/search`
3. Draft surface-based parser registry interface
4. Draft TanStack regex patterns
5. Define drift error message format
6. Document extensibility: how to add a new surface parser

## Tests Before

No new tests in this phase. Ensure existing suite passes before proceeding.

## Refactor

Read-only analysis. No code changes.

## Tests After

Document design decisions in phase file `Key Insights` section.

## Regression Gate

```bash
pnpm validate:records && pnpm test
```
Must pass with zero errors before proceeding to Phase 2.

## Success Criteria

- [x] OpenAPI generation script runs successfully and produces valid JSON
- [x] OpenAPI JSON contains all 3 declared API routes
- [x] Regex patterns match all current web routes
- [x] Parser registry interface designed and documented
- [x] Manual verification: current capability records vs product code = zero drift

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| OpenAPI generation fails due to vnstock_data import | Reuse proven test stubbing pattern; if still fails, fall back to regex parser as v1 |
| OpenAPI JSON schema changes between FastAPI versions | Parse only `paths` object; ignore other fields |
| New stack types added later (mobile, CLI) | Surface parser registry is the extension point; document in operator guide |

## Security Considerations

- OpenAPI generation script runs locally with mocked external dependency
- No network calls during generation
- File reads constrained to `product/` directory

## Next Steps

- Phase 2: Implement OpenAPI generator, TanStack parser, surface registry, and drift validator
