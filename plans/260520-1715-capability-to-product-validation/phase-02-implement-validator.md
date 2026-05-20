---
phase: 2
title: "Implement Validator"
status: completed
priority: P2
effort: "2h"
dependencies: [1]
---

# Phase 2: Implement Validator

## Context Links

- Phase 1 design: `./phase-01-research-design.md`
- OpenAPI generator: `tools/generate-openapi/generate-openapi.py`
- Surface registry module: `tools/validate-capability-product-drift/surface-registry.js`
- Drift validator module: `tools/validate-capability-product-drift/capability-product-drift.js`

## Overview

Implement the surface-based drift validator. Create the OpenAPI generation script, the surface parser registry, the OpenAPI path extractor, the TanStack regex parser, and the drift reporter.

## Key Insights

- OpenAPI generation reuses the same `vnstock_data` stubbing pattern as `tests/test_reference.py`
- `app.openapi()` returns a JSON object with `paths: { "/route": { "get": {...}, "post": {...} } }`
- `route_class: GET /reference/equity` normalizes to lookup key `"GET /reference/equity"`
- The surface registry is a plain object mapping `surface` strings to validator functions
- Adding a surface: export a function, register it in `surfaceRegistry`

## Requirements

- Functional: `generate-openapi.py` outputs valid OpenAPI JSON for the FastAPI app
- Functional: `parseOpenApiPaths(openapiJson)` returns `Map<"METHOD path", true>`
- Functional: `parseTanStackRoutes(routerTsxPath, root)` returns `Map<path, true>`
- Functional: `validateCapabilityProductDrift(records, root)` routes records to surface-specific validators
- Functional: Unsupported surfaces produce a warning, not an error
- Non-functional: All new code under 200 lines total
- Non-functional: Extensibility documented in code comments

## Architecture

### Module Layout

```
tools/validate-capability-product-drift/
├── generate-openapi.py          # Python script, stubs vnstock_data, outputs JSON
├── surface-registry.js          # Registry mapping surface → validator function
├── parsers/
│   ├── openapi-path-parser.js   # Parses OpenAPI JSON to route lookup map
│   └── tanstack-route-parser.js # Regex parser for TanStack routes
├── capability-product-drift.js  # Main validator: routes by surface, reports drift
└── capability-product-drift.test.js
```

### Surface Registry

```javascript
// surface-registry.js
import { validateHttpRestDrift } from "./validators/http-rest-validator.js";
import { validateTanStackDrift } from "./validators/tanstack-validator.js";

export const surfaceRegistry = {
  "HTTP/REST": validateHttpRestDrift,
  "TanStack Start route": validateTanStackDrift,
};

// To add a new surface:
// 1. Write validator function
// 2. Register it here
// 3. Document in docs/operator-guide.md
```

### OpenAPI Path Parser

```javascript
// parsers/openapi-path-parser.js
export function parseOpenApiPaths(openapiJson) {
  const routes = new Map();
  for (const [path, methods] of Object.entries(openapiJson.paths || {})) {
    for (const method of Object.keys(methods)) {
      if (["get", "post", "put", "delete", "patch"].includes(method)) {
        routes.set(`${method.toUpperCase()} ${path}`, true);
      }
    }
  }
  return routes;
}
```

### HTTP/REST Validator

```javascript
// validators/http-rest-validator.js
import { execSync } from "node:child_process";
import { parseOpenApiPaths } from "../parsers/openapi-path-parser.js";

export function validateHttpRestDrift(capabilityRecord, root) {
  const openapiJson = JSON.parse(
    execSync("uv run python tools/generate-openapi/generate-openapi.py", {
      cwd: join(root, "product", "api"),
      encoding: "utf8",
    })
  );
  const routes = parseOpenApiPaths(openapiJson);
  const errors = [];
  for (let i = 0; i < (capabilityRecord.maps || []).length; i++) {
    const map = capabilityRecord.maps[i];
    if (!routes.has(map.route_class)) {
      errors.push(
        `capability drift: ${capabilityRecord.__file} map[${i}] route_class "${map.route_class}" not found in OpenAPI spec (surface: HTTP/REST)`
      );
    }
  }
  return errors;
}
```

### TanStack Validator

Same regex-based approach as original design, but wrapped as a surface validator function.

## Related Code Files

- Create: `tools/generate-openapi/generate-openapi.py`
- Create: `tools/validate-capability-product-drift/surface-registry.js`
- Create: `tools/validate-capability-product-drift/parsers/openapi-path-parser.js`
- Create: `tools/validate-capability-product-drift/parsers/tanstack-route-parser.js`
- Create: `tools/validate-capability-product-drift/validators/http-rest-validator.js`
- Create: `tools/validate-capability-product-drift/validators/tanstack-validator.js`
- Create: `tools/validate-capability-product-drift/capability-product-drift.js`
- Modify: `package.json` (add `validate:drift` script)

## Implementation Steps

1. Write `generate-openapi.py`:
   - Stub `vnstock_data` and `vnstock_env` via `sys.modules`
   - Import `src.main`, call `app.openapi()`
   - Print JSON to stdout

2. Write `parsers/openapi-path-parser.js`:
   - Parse `paths` object from OpenAPI JSON
   - Build `Map<"METHOD path", true>`

3. Write `parsers/tanstack-route-parser.js`:
   - Read `router.tsx`, extract imports and `createRoute` calls
   - Read route files, extract `export const xyzRoutePath = '...'`
   - Build `Map<path, true>`

4. Write `validators/http-rest-validator.js`:
   - Spawn `generate-openapi.py`, parse JSON
   - Compare `maps[].route_class` against OpenAPI paths
   - Return drift errors

5. Write `validators/tanstack-validator.js`:
   - Call `parseTanStackRoutes`
   - Compare `maps[].route_class` against extracted paths
   - Return drift errors

6. Write `surface-registry.js`:
   - Export `surfaceRegistry` object mapping surface names to validators

7. Write `capability-product-drift.js`:
   - Filter records where `type === "capability"`
   - For each record, look up `surfaceRegistry[record.surface]`
   - If found: run validator, collect errors
   - If not found: push warning about unsupported surface
   - Return all errors and warnings

8. Add `validate:drift` script to `package.json`

## Tests Before

Write `capability-product-drift.test.js` with tests BEFORE implementing validators:

- `parseOpenApiPaths` test with sample OpenAPI JSON containing 2 paths
- `parseTanStackRoutes` test with sample router.tsx + route file
- `validateCapabilityProductDrift` synthetic test with one HTTP/REST and one TanStack record

These tests must fail initially (no implementation yet).

## Refactor

Create all modules under `tools/validate-capability-product-drift/`. Keep each function under 50 lines. Extract helpers if needed.

## Tests After

Run the pre-written tests. All must pass.

## Regression Gate

```bash
pnpm validate:records && pnpm test
```
Must pass with zero errors. Existing validation must not regress.

## Success Criteria

- [x] `generate-openapi.py` produces valid OpenAPI JSON
- [x] `parseOpenApiPaths` extracts all 3 API routes
- [x] `parseTanStackRoutes` extracts all 2 web routes
- [x] `validateCapabilityProductDrift` returns zero errors for current records + current product code
- [x] Synthetic drift test: injecting a fake `route_class` produces exactly one drift error
- [x] All new code under 200 lines total (implementation ~175 lines, tests separate ~95 lines)
- [x] Extensibility documented: code comments explain how to add a new surface

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| OpenAPI generation fails in CI due to missing .venv | Script should exit with clear error; `package.json` bootstrap script sets up .venv |
| `uv` not available in environment | Document requirement; CI image must include `uv` |
| TanStack regex fails on future route patterns | Document limitation; surface registry makes swapping parser easy |
| New surface added without registry update | Unsupported surface produces warning, not silent skip |

## Security Considerations

- `generate-openapi.py` mocks `vnstock_data` to prevent external calls
- `execSync` runs trusted local script only
- File reads constrained to `product/` directory

## Extensibility Documentation

Add to each parser file header:
```javascript
// Surface: HTTP/REST
// To add a new surface:
// 1. Create validators/<surface-kebab>-validator.js
// 2. Export a function matching signature: (capabilityRecord, root) => string[]
// 3. Register in surface-registry.js
// 4. Document in docs/operator-guide.md under "Capability Validation"
```

## Next Steps

- Phase 3: Integration tests and final wiring
