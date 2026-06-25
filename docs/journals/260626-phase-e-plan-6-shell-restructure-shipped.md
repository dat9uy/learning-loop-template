# Phase E Plan 6 (Mastra shell restructure) — shipped

**Date:** 2026-06-26
**Plan:** `plans/260626-0302-phase-e-shell-restructure/plan.md`
**Branch:** `phase-e/plan-6-shell-restructure` → `main`
**PR:** TBD (operator-filled at merge time)
**Effort:** ~1 day (within scope report's 1–1.5d estimate)
**Risk:** Medium (mechanical move + ~31 external refs + 9 meta-state repoints)

## What shipped

- **9 shell file-groups moved** from `tools/learning-loop-mastra/` top-level into `tools/learning-loop-mastra/mastra/`:
  - `server.js`, `create-loop-{tool,workflow,agent}.js`, `legacy-handler-adapter.js`, `schema-parity.js`, `schemas.js`
  - `workflows/` (10 files + `workflows-manifest.json`)
  - `agents/` (5 files + `instructions/` + `agents-manifest.json`)
- **~31 external references updated** across runtime configs (.mcp.json, .factory/mcp.json, package.json), interface contract (5 files), tests (11 files), runtime hooks + MASTRA_AGENT_MODEL.md (4 files), skill MDs (2 files), operator docs (3 files), tech docs (2 files: `docs/mcp-tool-schema-architecture.md` + `docs/project-changelog.md`).
- **Internal imports in mastra/ files updated** for cross-layer references: `server.js` → `../storage.js`, `create-loop-workflow.js` → `../core/envelope-stripper.js`, `schemas.js` → `../tools/legacy/...`, `agents/run-scout-tool.js` → `../../scout/legacy/run-scout.js`, `agents/build-meta-state-tools.js` → `../../tools/manifest.json`, `create-loop-agent.js` → `../__tests__/helpers/mock-model-factory.cjs`, `load-agents-manifest.js` containment check updated for new MASTRA_ROOT.
- **12 test files updated** with new paths: 4 relative import files, 4 SERVER_ENTRY files, manifest-arithmetic, fixtures-shape, coerce-correctness, server-name-rename exclusion, create-loop-agent/workflow dynamic imports, inbound-state-gate, gate-integration, meta-state-list-id-stdio, refresh-fingerprints script.
- **AGENTS.md §1.1** updated: shell layer now says "Lives at `tools/learning-loop-mastra/mastra/`" (was "top level"). Added path-invariant sentence locking the convention.
- **Interface contract** updated: `contract.js:94` endsWith literal now matches `tools/learning-loop-mastra/mastra/server.js`.
- **9 meta-state entries repointed** to mastra/ paths via `meta_state_batch` (1 atomic call). 2 fingerprints refreshed (`run-pnpm-test-namespaced.mjs` entries).
- **Cold-cache deleted** (`records/meta/.cache/loop-describe-cold.json`); next cold-tier read regenerates with new paths.
- **6 regression guards** added: `__tests__/phase-e-shell-restructure/*.test.js` (locks no-top-level-shell-files, shell-files-in-mastra-dir, external-refs-updated, agents-md-layer-locations, meta-state-fingerprints-repointed, test-relative-imports).
- **1 new test GLOB** added to `tools/scripts/run-pnpm-test-namespaced.mjs`: `phase-e-shell-restructure` (now 13 namespaces total).

## Verification at merge

- All 13 test namespaces GREEN.
- `node interface/contract.js {claude-code,droid,mastra-code}` smoke tests pass with expected exit codes (0, 0, 1).
- `meta_state_check_grounding` on repointed entries returns `status: grounded, hash match`.
- Cold-tier regression test passes — all mechanism_check=true findings grounded.
- `meta_state_log_change` filed (id: `meta-260626T0523Z-plans-260626-0302-phase-e-shell-restructure-plan-md`).

## Scope report diagram correction

The scope report's "after Phase E" tree diagram (`plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` lines 354–362) shows `mastra/tools/legacy/` as a subdirectory of `mastra/`. **This is incorrect**: `tools/legacy/` is Layer 1 substrate for legacy tools (not shell code) and stays at top-level of `tools/learning-loop-mastra/`. Plan 6 does NOT move `tools/legacy/`.

## What this plan did NOT ship (deferred)

- Mastra Code validation (Plan 4) — depends on this plan's stable contract path.
- Housekeeping (Plan 3) — E.2/E.3/E.4 doc/process changes; parallel to Plan 6.
- Hardening (Plan 5) — LIM-3 + R2 write-gate + LIM-4; parallel to Phase E.
- `meta_state_re_verify` for entry #9 — requires `META_STATE_VERIFY_EXEC=1` env var on MCP server.

## Unresolved questions

None at ship time.
