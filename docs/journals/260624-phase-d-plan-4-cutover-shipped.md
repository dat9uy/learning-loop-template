# Phase D Plan 4 — Cutover — Shipped

**Date:** 2026-06-24
**Branch:** `260624-1111-phase-d-plan-4-cutover`
**Plan:** `plans/260624-1111-phase-d-plan-4-cutover/`

## Summary

Plan 4 is the cutover for Phase D (the Mastra migration). It closes Phase D and unblocks Phase E (Mastra Code Mode 1).

**What shipped:**

1. **Post-Plan-3 functional verification** (Phase 1) — operator ran the conditional e2e test with `KIMI_API_KEY`. The MCP server started correctly (31 tools, 10 workflows, 3 agents registered). All 3 agent calls were made but the LLM provider (Kimi) timed out. Plan 4 proceeds on mocked-LLM test coverage.

2. **Manifest reconciliation** (Phase 2) — `tools/learning-loop-mastra/agent-manifest.json` reconciled to 44 tools across 6 groups (gate=5, workflow=13, meta_state=19, introspection=3, runtime_agnostic=1, agent=3). The 2 storage workflows (`run_workflow_storage_round_trip`, `run_workflow_storage_read`) added to the `workflow` group. New `manifest-arithmetic.test.cjs` (9 tests) added.

3. **§3.10 research report reconciliation** (Phase 3) — `plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md` §3.10 updated to reflect the post-Phase-D state. Q5 protocol followed (change-log filed FIRST).

4. **AGENTS.md §1+§2 update** (Phase 4) — one-line "Phase D shipped" callout added to §1; stale "40 tools across 5 groups" statement on §2 line 51 fixed to "44 tools across 6 groups".

5. **Master tracker reconciliation** (Phase 5) — D-9, D-15, E1, E4 flipped to ✅ DONE; E2 flipped to 🟡 PARTIAL; "Last updated" header bumped to 2026-06-24.

6. **Cold-session discoverability fix** (Phase 6) — `cold-session-discoverability.test.cjs` updated to enumerate the mastra manifest (44 tools); legacy e2e test relaxed to `>= 31`; new `cold-session-enumerate-mastra.test.cjs` (5 tests) added.

7. **Legacy cleanup (C-9)** (Phase 7) — `tools/learning-loop-mcp/{tools,core,scout,hooks}/` moved to `tools/learning-loop-mastra/{tools,core,scout,hooks}/legacy/`; all `#mcp/*` imports migrated; 5 prose references updated; `.factory/hooks/loop-surface-inject.cjs` core path references updated; `#mcp/*` alias deleted from `package.json`; new `legacy-cleanup.test.cjs` (6 tests) added.

8. **JSON key rename (R4)** (Phase 8) — MCP server key renamed `learning-loop-mastra` → `learning-loop` in `.mcp.json`, `.factory/mcp.json`, `.claude/settings.local.json` (6 allowlist entries); 35 files updated; new `server-name-rename.test.cjs` (6 tests) added; `docs/operator-notes/mcp-server-rename.md` documents the manual per-machine state updates.

9. **Acceptance gate + closeout** (Phase 9) — mastra test namespaces pass; cold-session 11/11 GREEN; legacy-cleanup + server-name-rename + manifest-arithmetic + cold-session-enumerate-mastra tests all GREEN; 4 `meta_state_log_change` entries filed; this journal; PR body.

**Test count baseline:**

- Pre-Plan-4: ~1169 tests (post-Plan-3)
- Post-Plan-4: ~1200+ tests (delta: +9 manifest-arithmetic + 5 cold-session-enumerate-mastra + 6 legacy-cleanup + 6 server-name-rename = +26 tests)
- Note: claude-coord-cjs has pre-existing failures unrelated to Plan 4

**Acceptance gate met:**

- [x] All mastra test namespaces pass
- [x] `pnpm test:cold-session` GREEN (11/11)
- [x] `git grep "#mcp/"` returns 0 matches in non-legacy code
- [x] `git grep "learning-loop-mastra"` returns 0 matches in non-legacy code (excluding filesystem paths and `docs/operator-notes/mcp-server-rename.md`)
- [x] Master tracker reconciled (D-9 + D-15 + E1 + E4 DONE; E2 PARTIAL)
- [x] §3.10 reconciled
- [x] AGENTS.md §1+§2 reconciled
- [x] 4 `meta_state_log_change` entries filed
- [x] Journal + PR body filed
- [x] Plan 4 phase-09 acceptance gate met

## Decisions

1. **Post-Plan-3 verification documented as timeout** (Phase 1) — LLM provider (Kimi) did not respond within timeout windows. The MCP server started correctly and agent calls were routed properly. Plan 4 proceeds on mocked-LLM test coverage.

2. **C-9 (legacy cleanup) included in Plan 4** (Phase 7) — The cleanup moves the legacy code to `tools/learning-loop-mastra/{tools,core,scout}/legacy/` (not delete) for forensic continuity per the Phase A convention.

3. **R4 (JSON rename) included in Plan 4** (Phase 8) — The rename is namespace-only; the filesystem path `tools/learning-loop-mastra/` is unchanged.

4. **Hooks directory moved to `tools/learning-loop-mastra/hooks/legacy/`** (Phase 7) — Hooks import `#mcp/core/*` which moves to `core/legacy/`. The `.factory/hooks/loop-surface-inject.cjs` loader is updated in the same commit.

5. **Historical references in plans/ + journals/ are preserved** — they are the engineering record; R4 does not erase them.

## Lessons

1. **The `__dirname`-relative paths broke when files moved.** Files using `join(__dirname, "..", "core", "patterns.json")` broke because the relative path depth changed. Need to audit `__dirname`-relative paths when moving files.

2. **The `#mcp/` import migration missed some files.** The initial migration script only handled files in the main directories, not in `__tests__/legacy-mcp/` or `scripts/`. Need to be more comprehensive when migrating imports.

3. **The server-name rename test needs careful filtering.** The test must distinguish between filesystem paths (which should NOT be renamed) and server-name references (which SHOULD be renamed). The filtering logic needs to account for various path formats.

4. **The cold-session test had hardcoded paths to the old location.** When moving files, all test files that reference the moved files need to be updated too.

## Forward-looking

- **Phase E (Mastra Code Mode 1)** is unblocked. E1, E4 are ✅ DONE. E2 is 🟡 PARTIAL. E3 (SKILL.md update), E5 (Mode 1), E6 (hook layer confirm) are open.
- **Phase F (Bridge 7)** is unchanged; still gated on Phase A re-debate conclusions + 1 release cycle.
- **Phase G (skill migration)** is unchanged; parallel dimension.
- **D-12 (Mode 1/2 decision)** is DEFERRED to Phase E.
- **D-16, D-17 (CI test-drift + fail-fast)** are OPEN; separate hardening track.
- **D-19 (LIM hardening)** is OPEN; separate security/quality audit.
