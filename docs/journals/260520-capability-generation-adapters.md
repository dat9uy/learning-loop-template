# Journal — Capability Generation Adapters

**Date:** 2026-05-20
**Scope:** Runtime capability record generation, schema v2.0 cut-over, CLI tooling, integration tests
**Outcome:** 164 tests pass, `pnpm check` passes end-to-end

---

## What Changed

- **Replaced hand-written capability records** with runtime-derived generation via per-surface adapters (FastAPI and TanStack Start).
- **Built generation CLI:** `pnpm generate:capabilities` with `--dry-run` drift detection.
- **Transitioned schema** from v1.1 to v2.0 minimal format: dropped `id`, `status`, `source_refs`. Records now contain only `type`, `schema_version`, `stack`, `surface`, `maps[]` with `source`.
- **Deleted old drift validator:** removed `tools/validate-capability-product-drift/` after its logic was subsumed by the generation CLI.
- **Added CLI helpers:** `pnpm list:probes` and `pnpm search:index` for operator visibility.
- **Added integration tests:** FastAPI adapter tested against a running uvicorn server; TanStack adapter tested against an actual `router.tsx`.
- **Updated docs:** `operator-guide.md` refreshed; created Tier 2 Verification Lookup Pattern skill reference.
- **Fixed test infrastructure:** quoted glob in `package.json` test script so Node handles `tools/**/*.test.js` recursively; created missing `fixtures/tanstack/routes/index.tsx`.

## Key Decisions

- **Minimal records carry no verification state** — verification lives in index entries, not capability records. Keeps records stable and small.
- **Operator-triggered extraction** — generation is explicit via CLI, not automated in pre-commit hooks. Prevents surprise diffs and keeps the operator in control.
- **Two-phase schema transition** — v1.1 records were regenerated in the new format before deleting legacy fields, preserving backward compatibility during the switch.

## Challenges & Fixes

| Challenge | Root Cause | Fix |
|-----------|-----------|-----|
| Integration tests skipped | `describe.skip` does not exist in Node's native test runner | Conditional `if (process.env.INTEGRATION)` blocks around `describe` calls |
| FastAPI test failed to detect startup | uvicorn startup message goes to `stderr`, not `stdout` | Listen on `server.stderr` for `"Application startup complete"` |
| Server startup timeout | Node default test timeout is 1s | Explicit `{ timeout: 30000 }` on `describe` and `it` blocks |
| Glob not recursive in pnpm test script | Unquoted `tools/**/*.test.js` expanded by shell instead of Node | Quoted `'tools/**/*.test.js'` so Node's built-in glob parser handles recursion |
| Unit tests failed after glob fix | Missing `fixtures/tanstack/routes/index.tsx` caused require errors | Created the fixture file with a minimal route definition |

## Verification

- **Tests:** 164 total, including 2 integration tests (FastAPI + TanStack).
- **Checks:** `pnpm check` passes end-to-end.

## Impact

Capability records are now reproducible from source at any time. Operators can detect drift with `--dry-run`, regenerate with a single command, and verify correctness via integration tests that exercise real server/router surfaces. The schema surface is smaller and records no longer duplicate state that belongs in the index.
