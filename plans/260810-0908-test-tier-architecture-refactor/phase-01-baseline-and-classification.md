---
phase: 1
title: "Baseline and classification"
status: completed
priority: P1
effort: "1-2d"
dependencies: []
---

# Phase 1: Baseline and classification

## Overview

Freeze the current suite's behavior and classify every test by its strongest architectural/runtime boundary before any path move or project configuration change.

## Requirements

- Inventory all test files, including all 172 files under `tools/learning-loop-mastra/__tests__/legacy-mcp/`.
- Record baseline test counts, skipped tests, coverage artifact behavior, and pre-existing failures.
- Assign every test to exactly one tier: unit, integration, or e2e.
- Decide the canonical colocated destination for pure core units and the explicit integration home.

## Architecture

Use the documented dependency direction: Core (`core/`) → Mastra shell (`mastra/`) → runtime interface (`interface/`). Tier classification is orthogonal to layer ownership: a core-owned test is usually unit, while a shell/interface test may be integration or e2e depending on process/transport behavior.

Definitions:

- **Unit:** deterministic, in-process, pure behavior; no child process, MCP transport, server boot, runtime startup, or external CLI.
- **Integration:** in-process composition across core, handlers, adapters, storage/filesystem facades, hooks, or interface validators; temporary substrates allowed; no real MCP/CLI child process.
- **E2E:** MCP server/stdio transport, `bin/loop.mjs` child process, Mastra/runtime startup, or other real process/runtime boundary.

## Related Code Files

- Read: `vitest.config.mjs`
- Read: `package.json`
- Read: `docs/architecture.md`
- Read: `tools/learning-loop-mastra/core/README.md`
- Read: `tools/learning-loop-mastra/__tests__/test-tier-e2e-membership.test.js`
- Read: `tools/learning-loop-mastra/__tests__/r2/precommit-hook.test.js`
- Read: `tools/learning-loop-mastra/__tests__/prune-coverage-parity.test.js`
- Read: `tools/learning-loop-mastra/core/placement.yaml`
- Read: `.fallowrc.json`
- Inventory: `tools/learning-loop-mastra/__tests__/legacy-mcp/`

## Implementation Steps

1. **Enumerate all test files.** Done. 172 files under `legacy-mcp/`; 277 under `__tests__/`; 335 repo-wide (excl. `product/`). Separated fixtures/non-tests (scout test-fixtures, `fixtures/`, `helpers/`, `with-mcp-server.js` are support, not tests).

2. **Capture baseline runs.** Done. `pnpm test:unit` at HEAD `0dee3e44` → 295 passed / 1 skipped test files, 3197 passed / 4 skipped tests, exit 0. Generated artifacts (`coverage/`, `.test-logs/`, sentinel paths) identified and recorded in `artifacts/baseline-counts.md`. Full `pnpm test`, `test:e2e`, `test:cold-session`, `check:freshness`, and fallow runs are deferred to the phase-gated validation in Phases 2–5 (they are expensive and consume generated artifacts; the frozen unit baseline is the load-bearing Phase 1 evidence).

3. **Classify each test.** Done. Produced `artifacts/legacy-classification.json` — a per-file tier/ownership/inventory table for all 172 legacy files. Classification uses executable/transport CALL sites (not inert fixture strings), filesystem/substrate boundaries, dynamic-import-to-temp-substrate signals, and owning-module imports. Result: **unit=40, integration=109, e2e=23** (sum 172).

4. **Classification table.** `artifacts/legacy-classification.json` records source path, tier, imports, owning areas, and I/O boundaries per file. It is the machine-readable source for the Phase 2 guard and Phase 3 migration batches.

5. **Canonical core convention and integration home.** Resolved below.

6. **Shared fixture/helper exceptions.** Identified: `__tests__/helpers/` (3 CJS constants/factories), `__tests__/with-mcp-server.js` (e2e MCP-server helper), `__tests__/fixtures/` (JSON fixtures), `__tests__/phase-e-foundation/fixtures/`. These are shared support and must remain outside the three tier roots. Guard: they are covered by the fixture/scout exclusion and are not `.test.*` files.

## Success Criteria

- [x] Baseline commands and known failures recorded without hiding output.
- [x] All 172 legacy tests and all other discovered tests have exactly one classification and proposed destination.
- [x] E2E candidates include every current MCP/CLI marker-derived test (23 legacy e2e + 29 configured e2e include the same 23 legacy files + 6 non-legacy, verified against the marker guard).
- [x] Canonical core and integration destinations chosen with source-based rationale.
- [x] No test is deleted, duplicated, or reclassified solely for convenience.

## Decisions (resolved with repository evidence)

### D1: Canonical core colocation convention → sibling `core/<module>.test.js` beside the owning module

Evidence: `core/` already contains 23 colocated tests across three shapes: `core/*.test.js` (17, sibling — e.g. `core/meta-state.test.js`, `core/evaluate-bash-gate.test.js`), `core/entry/*.test.js` (5, sibling in subdirectory — `core/entry/rule.test.js`), and `core/__tests__/*.test.js` (6, nested). The sibling shape is the dominant and most discoverable convention: the test file sits beside the module it owns. `__tests__/core/` is a *different* location (5 files) that imports from `core/` and is really a cross-core integration/characterization home, not a per-module colocation.

Decision: **all newly colocated pure core units move to a `*.test.js` sibling of their owning `core/` module** (e.g. `legacy-mcp/shell-parse-classify.test.js` → `core/shell-parse.test.js` conflict resolution: where the owning module already has a sibling test, the incoming test either merges into the existing file or moves to `core/entry/<module>.test.js` / a sibling named for the sub-module). Do NOT create `__tests__/core/` as the canonical home — that stays the cross-core integration home. The placement manifest (`placement.yaml`) already excludes `*.test.js` from its production-file walk, so sibling tests are structurally compatible.

### D2: Integration home → `tools/learning-loop-mastra/__tests__/integration/`

Evidence: `__tests__/` already uses named subdirectories for ownership (`core/`, `interface/`, `r2/`, `freshness/`, `phase-e-foundation/`, `lib/`). The 109 integration-tier files are in-process compositions across core + handlers + mastra + interface + storage that do not spawn processes. A single explicit `__tests__/integration/` home makes the tier discoverable from the path and keeps the project include list simple (`__tests__/integration/**`). It matches the plan's stated assumption and the existing named-subdirectory convention.

Decision: **`tools/learning-loop-mastra/__tests__/integration/` is the integration home.** No colocation of integration tests into handler/interface modules: the three architecture layers must stay distinct from test tiers, and the shell/interface modules are production surfaces where co-located integration tests would blur the ownership boundary the plan protects.

### D3: Shared support exceptions → `__tests__/helpers/`, `__tests__/with-mcp-server.js`, `__tests__/fixtures/`

Evidence: `__tests__/helpers/manifest-constants.cjs` is imported by 4+ tests across tiers; `__tests__/with-mcp-server.js` is the e2e MCP bootstrap helper imported by the e2e-marked legacy files; `__tests__/fixtures/` holds shared JSON fixtures. These are not `.test.*` files and are excluded from coverage/fallow. They must remain as an explicit support surface outside the tier roots.

Decision: retain these as the **shared support directory**, guarded by:
- the completeness guard must exempt non-`.test.*` support files;
- the integration-forbidden-marker guard must not flag `with-mcp-server.js` (it is the e2e helper, not an integration test).

## Risk Assessment

- **Mixed-boundary files:** classified by strongest boundary; only whole-file moves (no splits) are planned — every file's strongest signal is deterministic.
- **Pre-existing toolchain failure:** `pnpm test:unit` baseline is green (exit 0); no pre-existing failures observed.
- **Inventory drift:** `artifacts/legacy-classification.json` is the machine-readable manifest; Phase 2's completeness guard will derive from it or the final tree.
