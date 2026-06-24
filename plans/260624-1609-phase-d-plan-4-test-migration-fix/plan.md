# Phase D Plan 4 Test Migration Fix

## Status

**Active** — filed 2026-06-24 as followup to Plan 4 cutover.

## Motivation

`meta-260624T1558Z-phase-4-cutover-left-a-110-file-test-migration-gap-the-5-mcp` (severity: escalate) — Plan 4 deleted `tools/learning-loop-mcp/` and relocated 118 test files to `tools/learning-loop-mastra/{__tests__/legacy-mcp, core/legacy, core/legacy/lib, tools/legacy}/`. The 5 `mcp-*` globs in `tools/scripts/run-pnpm-test-namespaced.mjs` were NOT repointed, and the test files' relative imports were NOT rewritten. The runner now prints `tests 0 ... pass` silently for all 5 namespaces, masking ~985 lost tests (901+9+40+24+11 pre-Plan-4 baseline).

## Goal

Restore the 5 `mcp-*` test namespaces to ~985 passing tests by repointing the globs and migrating the relative imports in the relocated test files.

## Phases

| Phase | Description |
|---|---|
| Phase 1 | Mechanical import migration: 4 sed-replace patterns across 117 legacy-mcp test files |
| Phase 2 | Delete dead-script test (archive-product-records.test.js) |
| Phase 3 | Repoint 5 `mcp-*` globs in `tools/scripts/run-pnpm-test-namespaced.mjs` and rewrite the comment block |
| Phase 4 | Run suite, verify ~985 tests pass across the 5 repointed namespaces |
| Phase 5 | Resolve meta-state entry |

## Files To Modify

- `tools/learning-loop-mastra/__tests__/legacy-mcp/*.test.js` (117 files affected, 1 to delete)
- `tools/scripts/run-pnpm-test-namespaced.mjs` (5 GLOBS + comment block lines 18-30)

## Acceptance Criteria

1. The 5 `mcp-*` namespaces in `tools/scripts/run-pnpm-test-namespaced.mjs` repointed at the new `tools/learning-loop-mastra/` tree
2. At least 985 tests pass across the 5 repointed globs (matches pre-Plan-4 baseline)
3. The runner comment block accurately describes the repointed paths
4. No new test failures introduced in the 4 unaffected namespaces (`mastra-js`, `mastra-cjs`, `claude-coord-cjs`, `factory-cjs`)
5. Meta-state entry `meta-260624T1558Z-phase-4-cutover-left-a-110-file-test-migration-gap-the-5-mcp` resolved with `resolution` referencing this plan and the verified test count

## Migration Surface (Pre-Phase Scout)

| Pattern | Files | New pattern | Targets verified |
|---|---|---|---|
| `../core/X.js` | 60 | `../core/legacy/X.js` | 17/17 targets exist |
| `../tools/X.js` | 46 | `../tools/legacy/X.js` | 23/23 targets exist |
| `../hooks/lib/protocol-adapter.js` | 2 | `../hooks/legacy/lib/protocol-adapter.js` | 1/1 target exists |
| `../../learning-loop-mastra/__tests__/with-mcp-server.js` | 4 | `../with-mcp-server.js` | 1/1 target exists |
| `../../../scripts/archive-product-records.mjs` | 1 | delete test (script removed by Plan 4) | n/a |

Total files touched: 117 migrations + 1 delete + 1 runner script = 119 file changes.

## Risks

1. **Tests may break for non-import reasons** — the relocated code under `tools/learning-loop-mastra/{core,tools}/legacy/` may have been modified during Plan 3/4 work and could no longer satisfy the assertions in the legacy test files. If a non-import failure surfaces, the fix is non-mechanical and requires per-test triage.
2. **`.test.cjs` files (4 in `__tests__/legacy-mcp/`)** are NOT matched by the `*.test.js` glob, matching pre-Plan-4 behavior. Out of scope unless the glob is widened.
3. **lib glob path shape change** — `mcp-lib` was `tools/learning-loop-mcp/lib/*.test.js` (a top-level `lib/`); the new path is `tools/learning-loop-mastra/core/legacy/lib/*.test.js` (nested under `core/legacy/`). The runner comment must reflect this.

## Rollback

Each phase is a pure sed-replace (phases 1-2) or a single-file edit (phase 3). Rollback per phase:
- Phase 1-2: `git checkout HEAD -- tools/learning-loop-mastra/__tests__/legacy-mcp/`
- Phase 3: `git checkout HEAD -- tools/scripts/run-pnpm-test-namespaced.mjs`
- Phase 4-5: reversible via `meta_state_patch` re-open if verification fails

## Links

- Meta-state finding: `meta-260624T1558Z-phase-4-cutover-left-a-110-file-test-migration-gap-the-5-mcp`
- Plan 4 commit: `403a063 feat(cutover): Phase D Plan 4 — Mastra cutover`
- Plan 4 plan dir: `plans/260624-1111-phase-d-plan-4-cutover/`
- Plan 4 followup commit: `a23adea fix(cutover): Plan 4 followup — runtime hooks, tests, docs, operator note` (this runner comment block was added here)
