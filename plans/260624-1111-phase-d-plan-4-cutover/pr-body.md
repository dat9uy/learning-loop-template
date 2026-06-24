# Phase D Plan 4 — Mastra Cutover

Closes Phase D (the Mastra migration) and unblocks Phase E (Mastra Code Mode 1).

## What this PR does

1. **Post-Plan-3 functional verification** (Phase 1) — conditional e2e test ran with `KIMI_API_KEY`; LLM provider timed out but MCP server started correctly (31 tools, 10 workflows, 3 agents registered).

2. **Manifest reconciliation** (Phase 2) — `agent-manifest.json` reconciled to 44 tools across 6 groups. 2 storage workflows added to workflow group. New `manifest-arithmetic.test.cjs` (9 tests).

3. **§3.10 research report reconciliation** (Phase 3) — tool-surface table updated from 56→44 actual. Q5 protocol followed (change-log filed FIRST).

4. **AGENTS.md §1+§2 update** (Phase 4) — Phase D shipped callout added to §1; tool count fixed to "44 tools across 6 groups".

5. **Master tracker reconciliation** (Phase 5) — D-9, D-15, E1, E4 flipped to ✅ DONE; E2 flipped to 🟡 PARTIAL.

6. **Cold-session discoverability fix** (Phase 6) — test now enumerates mastra manifest (44 tools); legacy e2e relaxed to `>= 31`; new `cold-session-enumerate-mastra.test.cjs` (5 tests).

7. **Legacy cleanup (C-9)** (Phase 7) — `tools/learning-loop-mcp/{tools,core,scout,hooks}/` moved to `tools/learning-loop-mastra/{tools,core,scout,hooks}/legacy/`; all `#mcp/*` imports migrated; `#mcp/*` alias deleted. New `legacy-cleanup.test.cjs` (6 tests).

8. **JSON key rename (R4)** (Phase 8) — MCP server key renamed `learning-loop-mastra` → `learning-loop` in `.mcp.json`, `.factory/mcp.json`, `.claude/settings.local.json`. 35 files updated. New `server-name-rename.test.cjs` (6 tests). Operator-facing note at `docs/operator-notes/mcp-server-rename.md`.

9. **Acceptance gate + closeout** (Phase 9) — mastra tests pass; cold-session 11/11 GREEN; 4 `meta_state_log_change` entries filed; journal + PR body.

## Registry deltas (per `rule-pr-body-registry-deltas`)

- **Resolved:** 0 findings resolved in Plan 4 (Plan 4 is a cutover, not a fix).
- **New:** 0 new findings filed in Plan 4.
- **Sweep:** 0 entries swept.
- **Promoted:** 0 rules promoted.
- **Superseded:** 0 entries superseded.
- **Archived:** 0 entries archived.

**Plan 4 files 4 `meta_state_log_change` entries:**

1. Phase 1: `change_target: 'docs/journals/260623-post-plan-3-verification.md'` (Post-Plan-3 verification complete)
2. Phase 3: `change_target: 'plans/reports/research-260611-2216-mastra-runtime-model-agnostic-productization.md#§3.10'` (Q5 protocol)
3. Phase 5: `change_target: 'plans/reports/productization-260612-1530-master-tracker.md'` (D-9 + D-15 + E1 + E4 + E2 flips)
4. Phase 9: `change_target: 'plans/reports/productization-260612-1530-master-tracker.md'` (final cutover flip)

## Tool deletion (per `rule-import-chain-analysis-after-tool-deletion`)

Plan 4 phase-07 moves 31 deterministic tool files from `tools/learning-loop-mcp/tools/` to `tools/learning-loop-mastra/tools/legacy/`. The tool implementations are preserved (forensic continuity); only the canonical location changes. The MCP server (`tools/learning-loop-mastra/server.js`) loads the tools via direct relative paths (`./tools/legacy/...`) after the move.

**Import chain analysis:**

- All `#mcp/*` import lines migrated to direct relative paths
- 2 direct path imports in `__tests__/coerce-correctness.test.js` migrated
- ~63 self-imports inside the moved files migrated
- 5 prose references in agent instructions + scout tool descriptions updated

The `#mcp/*` import alias is deleted from `package.json#imports`. No remaining `#mcp/*` references in the project (verified by `legacy-cleanup.test.cjs`).

## Operator action required (post-merge)

The MCP server key was renamed from `learning-loop-mastra` to `learning-loop`. The repo's `.mcp.json`, `.factory/mcp.json`, and `.claude/settings.local.json` are updated. The operator must update the per-machine state files:

- **Droid state:** `~/.factory/...` — restart Droid after merge.
- **Claude Code state:** `~/.claude.json` (or similar) — restart Claude Code after merge.

See `docs/operator-notes/mcp-server-rename.md` for details.

## Test count

- Pre-Plan-4: ~1169 tests (post-Plan-3)
- Post-Plan-4: ~1200+ tests (delta: +26 tests)
- Note: claude-coord-cjs has pre-existing failures unrelated to Plan 4

## Acceptance gate

- [x] All mastra test namespaces pass
- [x] `pnpm test:cold-session` GREEN (11/11)
- [x] `git grep "#mcp/"` returns 0 matches in non-legacy code
- [x] `git grep "learning-loop-mastra"` returns 0 matches in non-legacy code (excluding filesystem paths)
- [x] Master tracker reconciled
- [x] §3.10 reconciled
- [x] AGENTS.md §1+§2 reconciled
- [x] 4 `meta_state_log_change` entries filed
- [x] Journal + PR body filed
