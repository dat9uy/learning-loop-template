---
phase: 1
title: "Surface Adapters + Generation CLI"
status: completed
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Surface Adapters + Generation CLI

## Overview

Build per-surface adapters that read native self-descriptions and emit normalized capability entries. Add the `generate:capabilities` CLI that runs all registered adapters and writes YAML to `records/capabilities/`. Includes `--dry-run` for drift detection.

## Requirements
- Functional: FastAPI adapter reads OpenAPI JSON; TanStack adapter reads `router.tsx` + route files
- Functional: Adapter registry maps `surface` type string → adapter module
- Functional: Generation CLI writes one record per (stack, domain), ID derived from `capability-{stack}-{domain}-{surface-slug}`
- Functional: `--dry-run` generates to temp directory, diffs against existing, fails on mismatch
- Non-functional: Unit tests with fixtures (no running servers); adapters < 150 lines each

## Architecture

```
product surfaces (running or source files)
        |
        v
   Surface Adapters (per-surface modules)
        |
        v
   Adapter Registry (maps surface type → adapter)
        |
        v
   Normalizer (shared: native entries → capability YAML)
        |
        v
   Generation CLI (writes records/capabilities/*.yaml)
```

### Adapter Contract

Each adapter exports: `async function extract(root) => { entries: [{source, domain}] }`

- **FastAPI adapter** (`tools/generate-capabilities/adapters/fastapi-adapter.js`):
  - Inlines OpenAPI generation logic (same stubbing pattern as old `generate-openapi.py`) — does NOT depend on external script
  - Parses `paths` → `{ source: "GET /reference/equity", domain: "reference" }`
  - Skips `/health` and other non-domain routes

- **TanStack adapter** (`tools/generate-capabilities/adapters/tanstack-adapter.js`):
  - Reads `product/web/src/router.tsx`
  - Extracts route imports, reads each route file for `export const xyzRoutePath`
  - Emits `{ source: "/reference/equity", domain: "reference" }`

### Domain Derivation

Group by first path segment after stripping leading slash. `/reference/equity` and `/reference/company/{symbol}` → domain `reference`. Record ID: `capability-{stack}-{domain}-{surface-slug}`.

**Algorithm:**
1. Strip leading `/` from route path
2. Take first segment before next `/` as domain
3. Routes without a segment (e.g., `/`) are skipped
4. Multiple domains produce multiple records (one per domain)

**Edge cases:**
- Deep paths (`/reference/equity/history`) → domain `reference` (same as shallow)
- Multi-segment prefixes (`/api/v2/reference`) → domain `api` (first segment); operator can override if needed
- No shared prefix → one record per route (each is its own domain)

### Registry

```js
export const adapterRegistry = {
  "HTTP/REST": () => import("./fastapi-adapter.js"),
  "TanStack Start route": () => import("./tanstack-adapter.js"),
};
```

Lazy-loaded dynamic imports. Adapters do not define their own surface type.

**Surface type strings are the single source of truth.** Registry keys must match the `surface` enum in `schemas/capability.schema.json`. Adding a new surface requires updating both the registry and the schema enum.

## Related Code Files
- Create: `tools/generate-capabilities/adapters/fastapi-adapter.js`
- Create: `tools/generate-capabilities/adapters/tanstack-adapter.js`
- Create: `tools/generate-capabilities/adapters/registry.js`
- Create: `tools/generate-capabilities/generate-capabilities.js`
- Create: `tools/generate-capabilities/normalizer.js`
- Create: `tools/generate-capabilities/fixtures/http-rest/openapi.json`
- Create: `tools/generate-capabilities/fixtures/tanstack/router.tsx`
- Create: `tools/generate-capabilities/fixtures/tanstack/routes/reference/equity.tsx`
- Create: `tools/generate-capabilities/fixtures/tanstack/routes/reference/company.$symbol.tsx`
- Create: `tools/generate-capabilities/adapters/fastapi-adapter.test.js`
- Create: `tools/generate-capabilities/adapters/tanstack-adapter.test.js`
- Create: `tools/generate-capabilities/generate-capabilities.test.js`
- Modify: `package.json` — add `generate:capabilities` script

## Implementation Steps
1. Write unit tests first (TDD):
   - `fastapi-adapter.test.js`: mock OpenAPI JSON fixture → verify normalized entries
   - `tanstack-adapter.test.js`: mock router.tsx + route files → verify normalized entries
   - `generate-capabilities.test.js`: mock registry → verify YAML output and `--dry-run` diff
2. Implement `fastapi-adapter.js`
3. Implement `tanstack-adapter.js`
4. Implement `registry.js`
5. Implement `normalizer.js` (shared: turns adapter entries into YAML-ready objects)
6. Implement `generate-capabilities.js` CLI with `--dry-run`
7. Wire `generate:capabilities` into `package.json`
8. Run tests; fix failures

## Success Criteria
- [x] `pnpm test` passes for all new adapter tests
- [x] FastAPI adapter produces 3 entries from current OpenAPI spec
- [x] TanStack adapter produces 2 entries from current route files
- [x] `--dry-run` detects when a record would change (YAML-aware comparison, not text diff)
- [x] `--dry-run` exits 0 when records are up-to-date

## Risk Assessment
| Risk | Mitigation |
|------|-----------|
| OpenAPI generation fails if `vnstock_data` not stubbed | Adapter inlines stubbing logic; no external dependency |
| TanStack route pattern changes break parser | Unit tests catch regressions; parser is explicit about supported patterns |
| Domain grouping heuristic is wrong for new routes | Document heuristic; operator can inspect generated output before committing |

## Security Considerations
- Adapters only read product code, never execute it
- No network calls except localhost OpenAPI endpoint (FastAPI)
- `--dry-run` writes to temp dir only
