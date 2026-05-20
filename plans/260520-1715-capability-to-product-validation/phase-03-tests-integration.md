---
phase: 3
title: "Tests & Integration"
status: pending
priority: P2
effort: "2h"
dependencies: [2]
---

# Phase 3: Tests & Integration

## Context Links

- Phase 2 implementation: `./phase-02-implement-validator.md`
- Modules under test: `tools/validate-capability-product-drift/*.js`, `tools/generate-openapi/generate-openapi.py`
- Test runner: `node --test` (existing pattern)

## Overview

Write integration tests against the real codebase. Ensure the drift validator runs as a separate script, confirm zero drift, and verify the extensibility contract. Document the surface registry in `docs/operator-guide.md`.

## Key Insights

- Existing test pattern: `tools/validate-records/validate-records.test.js` uses `node:test` and `assert`
- `pnpm test` runs `node --test tools/**/*.test.js`
- `pnpm check` runs both `pnpm validate:records && pnpm test`
- The drift validator is a **separate script**, not baked into `validate-records.js`
- Current capability records and product code are in sync
- The operator guide must document how to add future surfaces

## Requirements

- Functional: `generate-openapi.py` runs and produces valid JSON in CI
- Functional: `validateCapabilityProductDrift` returns zero errors for real codebase
- Functional: Synthetic drift correctly detected for both HTTP/REST and TanStack
- Functional: Unsupported surface produces a warning, not an error
- Non-functional: Total test files < 200 lines combined
- Non-functional: All tests use `node:test` and `assert`
- Non-functional: `docs/operator-guide.md` updated with surface registry documentation

## Architecture

### Test Structure

```
tools/validate-capability-product-drift/capability-product-drift.test.js
├── describe("parseOpenApiPaths")
│   ├── it("extracts GET /reference/equity from sample OpenAPI JSON")
│   └── it("ignores non-HTTP methods like trace")
├── describe("parseTanStackRoutes")
│   ├── it("extracts /reference/equity from sample router + route file")
│   └── it("extracts /reference/company/$symbol with param")
├── describe("validateCapabilityProductDrift")
│   ├── it("returns zero errors for current records and product code")
│   ├── it("reports drift for a synthetic missing HTTP/REST route")
│   ├── it("reports drift for a synthetic missing TanStack route")
│   └── it("warns for unsupported surface without crashing")
└── describe("surfaceRegistry")
    └── it("contains HTTP/REST and TanStack Start route entries")
```

### Integration Wiring

Add to `package.json`:
```json
"validate:drift": "node tools/validate-capability-product-drift/capability-product-drift.js"
```

The drift validator is a **standalone script**, not integrated into `validate-records.js`. This keeps record validation fast and modular.

### CI Pipeline

```bash
pnpm check        # validate:records + test
pnpm validate:drift  # capability-to-product drift check
```

## Related Code Files

- Create: `tools/validate-capability-product-drift/capability-product-drift.test.js`
- Modify: `package.json`
- Modify: `docs/operator-guide.md` (add "Capability Validation" section)

## Implementation Steps

1. Write unit tests for `parseOpenApiPaths` with inline OpenAPI JSON fixture
2. Write unit tests for `parseTanStackRoutes` with inline TypeScript fixtures
3. Write integration test:
   - Load real records via `loadRecords(root)`
   - Call `validateCapabilityProductDrift(records, root)`
   - Assert zero errors for current state
4. Write synthetic drift tests:
   - Create in-memory capability record with fake `route_class` for HTTP/REST
   - Assert one drift error
   - Repeat for TanStack
5. Write unsupported surface test:
   - Create in-memory capability record with `surface: "gRPC"`
   - Assert warning returned, no error
6. Wire `validate:drift` script into `package.json`
7. Update `docs/operator-guide.md`:
   - Add "Capability Validation" section
   - Document surface registry and how to extend it
   - List current supported surfaces

## Tests Before

Write integration test that asserts zero drift on real codebase BEFORE finalizing docs:

```javascript
import { validateCapabilityProductDrift } from "./capability-product-drift.js";
const records = loadRecords(root);
const drift = validateCapabilityProductDrift(records, root);
assert.deepStrictEqual(drift.errors, [], `expected zero drift, got: ${drift.errors.join(", ")}`);
```

This test must pass before docs are updated.

## Refactor

Add `validate:drift` script to `package.json`. Update `docs/operator-guide.md` with surface registry documentation.

## Tests After

Run `pnpm check && pnpm validate:drift`. Must pass with zero errors and zero test failures.

## Regression Gate

```bash
pnpm check && pnpm validate:drift
```
Must pass with zero errors and zero test failures. This is the final gate.

## Success Criteria

- [ ] `pnpm validate:drift` runs and reports zero drift for current codebase
- [ ] Synthetic HTTP/REST drift is correctly detected
- [ ] Synthetic TanStack drift is correctly detected
- [ ] Unsupported surface produces a warning, not an error
- [ ] `pnpm check` passes end-to-end (no regressions)
- [ ] `docs/operator-guide.md` documents the surface registry and extension process
- [ ] Code comments in `surface-registry.js` explain how to add a new surface

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| `generate-openapi.py` fails in CI | CI must run `bootstrap:api` first; script should produce clear error message |
| Test file grows > 200 lines | Split into `unit.test.js` and `integration.test.js` |
| Operator guide docs drift from code | Docs reference `surface-registry.js` by file path, not by inline listing |

## Security Considerations

- Synthetic test records are created in-memory only
- Integration test reads real product source; no external calls
- Docs update contains no sensitive information

## Next Steps

- Plan complete. Hand off to `/ck:cook` for implementation.
