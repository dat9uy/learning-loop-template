# Capability-to-Product Drift Validator Implementation

**Date**: 2026-05-20 17:15
**Severity**: Low
**Component**: Capability Validation / Drift Detection
**Status**: Resolved

## What Happened

Executed plan `plans/260520-1715-capability-to-product-validation` in auto/TDD mode. Built a surface-based drift validator that compares capability records in `docs/capabilities/` against actual product surfaces (OpenAPI HTTP/REST routes and TanStack Start routes). Created 8 new files and modified 2 existing files. All 152 tests pass, including 6 new drift validator tests. `pnpm validate:drift` reports "OK — zero drift detected" and `pnpm check` passes with zero regressions.

## The Brutal Truth

Building yet another parser pipeline feels like plumbing — necessary, invisible, and deceptively easy to get wrong. The relief of seeing `OK — zero drift detected` is real, but so is the knowledge that the first time someone adds a new surface type (WebSocket, gRPC, GraphQL), we will be back here writing more regexes and registry entries. The most exhausting part is knowing the fragility is baked in by design: we chose regex-based parsers over AST parsing for speed, and now we own that trade-off every time a framework convention changes.

## Technical Details

- **Test suite**: 152 pass / 0 fail (6 new tests in `capability-product-drift.test.js`)
- **Python generator**: `tools/generate-openapi/generate-openapi.py` stubs `vnstock_data` and emits OpenAPI JSON from the FastAPI reference app
- **Parsers**: `openapi-path-parser.js` (OpenAPI paths → route map), `tanstack-route-parser.js` (regex over `app/routes/**/*.ts`)
- **Validators**: `http-rest-validator.js` (OpenAPI surface match), `tanstack-validator.js` (TanStack route surface match)
- **Registry**: `surface-registry.js` maps surface type strings to validator modules
- **CLI entry**: `capability-product-drift.js` with `resolve(process.argv[1])` guard to prevent accidental execution during test imports
- **Package script**: `validate:drift` added to `package.json`

## What We Tried

1. **Stack-based detection first** — considered auto-detecting framework by scanning `package.json` dependencies. Rejected because it couples validators to runtime environment state; surface registry is explicit and extensible.
2. **`execSync` for Python invocation** — initially used `execSync` with a shell string for convenience. Code review flagged shell interpolation risk. Migrated to `execFileSync` with an explicit argument array.
3. **Direct `process.argv[1] === __filename` comparison** — failed under test runners that symlink or nest entry points. Switched to `resolve(process.argv[1])` for robust CLI guard.

## Root Cause Analysis

This was planned work, not a reactive incident. The root cause of the *need* for this tool is that capability records drift from product reality when maintained manually. We had no automated bridge between `docs/capabilities/` claims and actual source-code surfaces (FastAPI routes, TanStack file-system routes). The validator closes that loop mechanically rather than relying on human memory during refactors.

## Lessons Learned

- **Regex parsers are fragile canaries**. The TanStack parser relies on `app/routes/**/*.ts` conventions. If someone restructures to `app/(app)/routes/` or adds a layout suffix, the parser will silently return zero routes and report false-negative drift. We need a canary assertion that the glob returns > 0 files.
- **TDD works for validation logic, not side-effect tools**. The Python OpenAPI generator is a process-spawning script; unit-testing it inside a JS test runner is awkward. Future plans should separate "tool generation" from "validation logic" into distinct phases with different test strategies.
- **Surface registry scales better than stack detection**. Adding a new surface type should now take ~20 minutes: write parser → write validator → register in `surface-registry.js`. Document this extension path aggressively.

## Next Steps

- Add canary test for TanStack route parser: fail build if route glob returns zero files. Owner: validator maintainer.
- Add CI gate running `pnpm validate:drift` on PRs touching `docs/capabilities/` or frontend/backend route files. Owner: CI owner.
- Add "Adding a new surface type" subsection to `docs/operator-guide.md` Capability Validation section. Owner: docs maintainer.
- Monitor for first real drift catch — current zero drift is because we just aligned everything; the tool's real value appears when it prevents a future oversight.
