---
phase: 4
title: "Cutover and legacy-path cleanup"
status: completed
priority: P1
effort: "1-2d"
dependencies: [3]
---

# Phase 4: Cutover and legacy-path cleanup

## Overview

Make the architecture-aligned layout authoritative only after migration parity is established. Reconcile configuration, scripts, guards, fallow references, helper paths, and all remaining legacy references without deleting tests.

## Requirements

- Prove every legacy test has exactly one destination or a documented guarded support exception.
- Update final Vitest project membership and package scripts.
- Update all path-sensitive guards, freshness/helper manifests, baselines, and relevant docs/source comments.
- Remove the obsolete `legacy-mcp` placement when no retained exception requires it.
- Preserve `pnpm test`, CI, pre-commit, pre-push, and coverage intent.

## Architecture

The final tree must make the ownership chain visible:

- pure source units beside Core modules;
- in-process composition under the explicit integration home or an approved owning boundary;
- runtime-interface tests under interface/runtime ownership;
- process/transport boundary tests under e2e ownership;
- shared fixtures/helpers in an explicit support directory only when they cannot be owned by one tier.

The historical name `legacy-mcp` must not remain the canonical architecture-aligned test home.

## Related Code Files

- Modify: `vitest.config.mjs`
- Modify: `package.json`
- Modify: tier completeness/e2e guards
- Modify: `tools/learning-loop-mastra/__tests__/prune-coverage-parity.test.js`
- Modify: freshness/cold-session/helper manifests and fixture paths
- Modify: `.fallowrc` and committed fallow baselines only when final paths require it
- Modify: `docs/architecture.md`, `AGENTS.md`, `tools/learning-loop-mastra/core/README.md`, and other owning docs/comments
- Delete: empty `tools/learning-loop-mastra/__tests__/legacy-mcp/` directory and obsolete path exceptions, only after parity proof

## Implementation Steps

1. Compare the frozen inventory with final filesystem paths and configured project membership.
2. Confirm no test was dropped, duplicated, or left outside all three projects.
3. Update the final e2e list and integration classification source.
4. Update package scripts while keeping `pnpm test` as the full union and preserving existing hook policy.
5. Update prune/fallow/freshness/helper references to final paths; do not remove a baseline entry without proving it is obsolete.
6. Search the repo for `legacy-mcp`; classify each match as historical journal/archive, test/config path requiring update, or deliberate compatibility reference.
7. Update architecture/test docs to describe the final three-tier layout and ownership rules.
8. Remove the legacy directory only after the completeness, count, and coverage guards pass.
9. Execute `pnpm test:cold-session` and `pnpm check:freshness` against the final paths; verify the cold-session sentinel is created, read, and cleaned/retained according to the existing contract.

## Implementation record (completed 2026-08-10)

1. **`legacy-mcp/` directory removed** after completeness/count/coverage parity (172 files migrated, 0 left).
2. **Non-test support files relocated:** `probe-helpers.cjs` → `__tests__/helpers/`; `fixtures/gate-check-snapshot.json` → `integration/fixtures/`.
3. **`.gitignore`** sentinel path updated `legacy-mcp/` → `integration/`.
4. **`test:cold-session`** script + **`cold-session-freshness`** sentinel path → `integration/`.
5. **`manifest-constants.cjs`** comment refs updated.
6. **Active code comments updated** (`core/bound-artifacts.js`, `core/evaluate-write-gate.js`, `core/hint-registry.js`, `interface/contract.js`, `meta-state-log-change-tool.js`) to reference new test locations.
7. **Moved-test comments updated** (shell-quote-guard, ci-registry-deltas, mcp-protocol-e2e, mastra-code-smoke, manifest-arithmetic, cli-write-parity, toolchain-failure-capture, bound-artifacts).
8. **Active docs updated:** `docs/loop-engine.md`, `docs/skills-management.md`, `docs/architecture.md`, `AGENTS.md` (three-tier gate table), `interface/CONTRACT.md`, `core/README.md`.
9. **Fallow baselines updated** for `probe-helpers.cjs` path (dead-code + health).
10. **Retained as historical/inert (NOT rewritten):** `meta-state.jsonl` finding records (immutable history), `docs/journals` + `docs/_archive` (historical), `prune-coverage-parity.test.js` deleted-file assertions (correct), `meta-state-derive-status-tool.test.js` temp-fixture path (inert test data), `tools/scripts/bulk-fix-gate-root-pattern.mjs` (one-shot repair script, not active authority).

**Verified:**
- `pnpm test:integration`: 1507 tests / exit 0 (with seed preamble)
- `pnpm test:cold-session`: 6 tests / exit 0; sentinel written to `integration/.cold-session-sentinel.json`
- `pnpm check:freshness`: exit 0; reads the integration/ sentinel
- Full `pnpm test`: 3369 tests / exit 0; coverage-final.json produced
- Arch guards (FCIS, placement, interface, R2): 111 tests / exit 0
- No `legacy-mcp` in active config/package/gitignore/docs

**Note:** editing any source file a grounding-finding references (e.g. `core/bound-artifacts.js`) requires re-running `seed-file-index.mjs` before the cold-tier grounding test passes — this is the documented "cascading file-index desync" behavior, handled automatically by the `pnpm test:*` seed preambles.

## Success Criteria

- [x] No active test/config/doc surface calls `legacy-mcp` the canonical test home.
- [x] The legacy directory is empty/removed; retained exceptions are explicit (inert fixture/historical data).
- [x] Final project membership is complete and disjoint (completeness + e2e-membership guards pass).
- [x] All convenience commands resolve to valid paths; cold-session + freshness sentinel behavior verified at the new location.
- [x] No production source file changed (only comments/doc strings updated).
- [x] CI and hook intent unchanged except the approved integration script.

## Risk Assessment

- **Historical references:** do not rewrite archived journals unless required; distinguish historical evidence from active authority.
- **Fallow baseline churn:** update baselines only for real path changes and verify with fallow, not by deleting noisy entries.
- **Cleanup before parity:** keep cleanup as the final step and make it independently revertible.
- **Hidden support dependency:** retain an explicit support directory when a fixture/helper is genuinely shared; do not force it into a source-owned tier.
