---
title: "Test-tier architecture refactor"
description: "Reorganize the Vitest suite into explicit unit, integration, and e2e tiers, colocate pure unit tests with their owning modules, and retire the architecture-misaligned legacy-mcp test home without changing production behavior."
status: completed
priority: P1
effort: "5-10d"
tags: [vitest, testing, architecture, integration, e2e, test-colocation]
blockedBy: []
blocks: []
created: "2026-08-10"
createdBy: "ak:plan"
source: skill
related:
  - vitest.config.mjs
  - package.json
  - docs/architecture.md
  - tools/learning-loop-mastra/core/README.md
  - plans/260803-1314-hybrid-test-tiering-and-pre-push-gate/plan.md
---

# Test-tier architecture refactor

## Overview

The repository already has Vitest `unit` and `e2e` projects, but no explicit integration tier. The largest structural mismatch is `tools/learning-loop-mastra/__tests__/legacy-mcp/`, which contains 172 tests despite the current architecture being organized around the functional core, Mastra shell, runtime interface, hooks, CLI, and tool handlers.

This plan introduces a three-tier test contract and migrates tests by behavior and architectural ownership. Pure unit tests move beside their owning implementation (following the existing `core/` convention); in-process composition tests move to an explicit integration home; runtime/process-boundary tests move to architecture-aligned e2e locations. Assertions and production behavior remain unchanged.

## Locked outcome contract

- **Intended result:** The test suite is organized into explicit unit, integration, and e2e tiers that mirror the documented architecture and make test ownership discoverable from source paths.
- **In scope:** Vitest projects and scripts; colocated pure unit tests; behavioral migration of the 172 `legacy-mcp` tests; tier guards; path/helper/config/baseline updates; coverage preservation; relevant architecture/test documentation; removal of obsolete `legacy-mcp` placement where no longer needed.
- **Out of scope:** Production behavior, public tool contracts, assertion rewrites for convenience, test deletion/weakening, product functionality, architecture-layer renames, coverage removal.
- **Acceptance signals:** `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e`, and full `pnpm test` pass; every test belongs to exactly one tier; pure units are colocated; no architecture-aligned references call the home `legacy-mcp`; counts and meaningful coverage are preserved; docs match the final layout.
- **Constraints:** Local repository-only refactor; preserve Vitest and CI/pre-commit/pre-push intent; honor core/shell/interface boundaries; avoid unrelated cleanup.
- **Allowed substitutions:** A small explicit shared support directory may remain for genuinely shared fixtures/helpers; no other tier/layout substitution is approved.
- **Decision owner:** user

## Verified facts

- `vitest.config.mjs` currently defines `unit` and `e2e`; there is no `integration` project.
- `E2E_FILES` is an explicit list of 28 current MCP-server/CLI-subprocess tests, protected by `test-tier-e2e-membership.test.js`.
- `package.json` has `test`, `test:unit`, and `test:e2e`; `pre-commit` runs `pnpm test:unit`.
- The full suite uses root Istanbul coverage; the unit script disables coverage through its CLI override.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/` contains 172 test files.
- `core/` already demonstrates colocated tests, including `core/*.test.js`, `core/entry/*.test.js`, and `core/__tests__/*.test.js`.
- The documented architecture is Core → Mastra Shell → Runtime Interface; `core/README.md` enforces the FCIS import boundary.
- Existing aligned test areas include `core`, `interface`, `phase-e-foundation`, `r2`, `freshness`, `helpers`, and `fixtures`.
- The 2026-08-03 hybrid-tier plan explicitly left test co-location as a later refactor.

## Assumptions and decisions to resolve during Phase 1

- **Assumption:** A new `tools/learning-loop-mastra/__tests__/integration/` directory is the clearest home for in-process composition tests; confirm against the final inventory before implementation.
- **Assumption:** Pure core tests should use one canonical colocated pattern, selected between existing `core/__tests__/` and `__tests__/core/` based on ownership and import depth; do not create a third core pattern.
- **Assumption:** E2E membership should remain explicit and mechanically guarded, while integration membership may be directory-based or manifest-derived if that produces a complete, disjoint union.
- **User decision already locked:** `test:integration` is required as a public package script because the acceptance contract names it.
- **User decision already locked:** Current hook and CI behavior is preserved unless implementation evidence shows a required script update; do not silently add a new push gate.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Establish explicit, disjoint, complete unit/integration/e2e Vitest projects and scripts | P1 |
| 2 | Make pure unit ownership discoverable by colocating tests with source modules | P1 |
| 3 | Remove `legacy-mcp` as the architecture-aligned test home while preserving every test | P1 |
| 4 | Preserve full-suite behavior, coverage, CI, and existing gate intent | P1 |
| 5 | Leave mechanical guards and docs that prevent regression | P2 |

## Phases

| # | Phase | Status | Dependency |
|---|---|---|---|
| 1 | [Baseline and classification](./phase-01-baseline-and-classification.md) | Completed | — |
| 2 | [Three-tier Vitest contract and guards](./phase-02-three-tier-vitest-contract-and-guards.md) | Completed | Phase 1 |
| 3 | [Architecture-aligned test migration](./phase-03-architecture-aligned-test-migration.md) | Completed | Phase 2 |
| 4 | [Cutover and legacy-path cleanup](./phase-04-cutover-and-legacy-path-cleanup.md) | Completed | Phase 3 |
| 5 | [Parity, coverage, docs, and rollback validation](./phase-05-parity-coverage-docs-and-rollback.md) | Completed | Phase 4 |

## Traceability

| Phase | Contract items | Acceptance signals | Facts / assumptions / prerequisites / user decisions |
|---|---|---|---|
| 1 | Inventory all tests; define tier ownership; preserve tests | Baseline counts, skip counts, coverage, and pre-existing failures recorded; all 172 legacy files classified | Fact: 172 legacy files. Assumption: exact integration boundary needs file-level inspection. User decision: no scope reduction. |
| 2 | Add unit/integration/e2e projects and scripts; preserve full test command | Three projects exist; scripts run each tier; disjoint/complete guard passes; e2e and integration marker guards pass | Fact: Vitest 4 project options do not all inherit. Prereq: classification inventory. User decision: explicit three tiers. |
| 3 | Colocate units; migrate legacy tests by owner; preserve assertions | Each moved batch passes its tier and direct-file checks; no duplicate/dropped files; path-sensitive helpers updated | Assumption: canonical core destination selected in Phase 1. Prereq: guards landed first. |
| 4 | Remove obsolete legacy placement; update configs and references | No retained test is hidden under an unclassified path; `legacy-mcp` is empty or an explicitly guarded support exception | Fact: several docs/source comments still mention legacy-mcp. User decision: remove obsolete placement, not tests. |
| 5 | Preserve behavior/coverage/docs | All tier/full/freshness/fallow/architecture checks pass; docs and config match final paths; no production diff | Prereq: available local pnpm/Vitest/fallow toolchain. Fallow may expose a pre-existing coverage parser issue; record, do not hide. |

## Design

### Tier definitions

- **Unit:** deterministic, in-process tests of pure core primitives, evaluators, schemas, parsers, classifiers, relationship views, projections, hashing, and other code with no subprocess, MCP transport, server boot, runtime startup, or external CLI.
- **Integration:** in-process composition across core, handlers, CLI adapters, Mastra factories, storage/filesystem facades, hooks, and runtime-interface validators. Temporary files/databases are allowed; real MCP/CLI child processes are not.
- **E2E:** tests that start an MCP server, use stdio MCP transport, spawn `bin/loop.mjs`, exercise Mastra/runtime startup, or cross a real process/runtime boundary.

Classify the whole file by its strongest boundary. Split a file only when the current assertions have a clean ownership boundary and the split does not rewrite or weaken behavior.

### Configuration strategy

Keep `pnpm test` unfiltered and coverage-producing. Add `test:integration` with the same seed-file-index preamble used by the existing tier scripts. Repeat project-local `globals`, timeout, hook timeout, and fixture exclusions because Vitest 4 does not reliably inherit them. Preserve `test:unit` coverage-off behavior and root coverage for the full run consumed by fallow.

Use explicit e2e membership as today, extended with final moved paths. Use a classification inventory or stable directory ownership for integration, with a guard asserting the exact union and disjointness of all projects. Marker-derived checks must force MCP/CLI-spawning files into e2e and reject forbidden subprocess markers in integration.

### Migration strategy

Land guards and configuration before path moves. Migrate in batches: pure core, core/handler integration, Mastra/CLI/interface integration, then e2e. Use `git mv` for path-only changes and change imports/fixture paths only as required by the new depth. Run the affected tier after each batch. Delete the legacy directory only after the inventory-to-tier union and coverage parity checks pass.

## Success criteria

- [x] `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e`, and full `pnpm test` all pass.
- [x] Three Vitest projects are explicit, disjoint, and complete over the intended test inventory.
- [x] Guard tests reject missing/duplicate membership, e2e marker omissions, integration subprocess markers, and scout-fixture leakage.
- [x] Every pure unit test has an owning source location beside the implementation, following one canonical core convention.
- [x] All 172 legacy tests have a destination or a documented, guarded shared-support exception; none are silently dropped.
- [x] No architecture-aligned test/config/doc path describes `legacy-mcp` as the canonical home.
- [x] Test and skip counts are preserved; assertions are not weakened; full coverage remains valid for fallow.
- [x] `pnpm test:cold-session` and `pnpm check:freshness` pass against final paths, including cold-session sentinel parity; FCIS/placement/interface/R2/parity guards and fallow checks are run and reported honestly.
- [x] No production files or public behavior change.

## Risk summary and rollback

| Risk | Mitigation |
|---|---|
| Mixed unit/integration behavior | Classify by strongest boundary; split only with assertion parity; guard integration markers. |
| Vitest project settings fail to inherit | Repeat project-local settings and fixture exclusions. |
| E2E marker false negative | Retain MCP + SDK + CLI marker set, fail stale e2e entries, and require exact e2e membership. |
| Deep path changes break fixtures/sentinels | Batch `git mv`, update only required paths, run each moved file directly. |
| Coverage/fallow incompatibility | Preserve root Istanbul coverage and existing sanitizer; run `fallow:brief` before `fallow:gate`; do not weaken tests. |
| Legacy cleanup hides a dropped test | Require pre/post manifest union and count parity before deleting the directory. |
| Unit timing remains high | Treat timing as diagnostic; the contract requires tier separation, not an unverified seconds claim. |

Rollback is commit-granular: revert legacy cleanup, then config/scripts/guards, then path moves; restore the previous two-project/flat include configuration and rerun the frozen baseline. No production rollback is required.

## Open questions

1. Which existing core test convention (`core/__tests__/` or `__tests__/core/`) should be canonical for all newly colocated core units?
2. Should the final integration home be `tools/learning-loop-mastra/__tests__/integration/`, or should integration tests be colocated with handler/interface modules where practical?
3. Are any shared fixtures/helpers required to remain outside the three tier roots after migration?

## Next step

Review this plan, then run `/ak:plan validate /home/datguy/learning-loop-template/plans/260810-0908-test-tier-architecture-refactor` before implementation. Do not run `/ak:cook` until the open questions and whole-plan consistency check are resolved.

<!-- slug: test-tier-architecture-refactor -->
