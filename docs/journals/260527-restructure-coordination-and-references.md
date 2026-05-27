---
date: "2026-05-27T08:48:36Z"
tags: [brainstorm, architecture, mcp, project-organization, plan, red-team, validate]
---

# Restructure Coordination Gate & Co-locate References

Brainstormed two structural issues with /ck:brainstorm:

1. `.claude/skills/learning-loop/references/` and `evals/` describe system rules the MCP server enforces, but live in a Claude-specific path. `.factory/skills/learning-loop/` only has `SKILL.md` — the referenced files do not exist there. Active inconsistency.

2. `tools/coordination-gate/mcp/` is unnecessarily nested. `mcp/tools/*.js` imports core via `../../core/` and shared libs via `../../../lib/`. Server name "coordination-gate" does not match repo brand.

Agreed on **Approach C — Full Restructure**:
- Rename `tools/coordination-gate/` → `tools/learning-loop-mcp/`
- Flatten `mcp/` contents to top level (server.js, tools/, lib/)
- Co-locate `references/` and `evals/` inside the new directory
- Update both skill files to point to new paths
- Rename server name to `"learning-loop-mcp"`
- **Add Node.js subpath imports** (`"imports"` in `package.json`) to eliminate `../../` entirely — `#mcp/core/`, `#lib/`, etc.

Report written: `plans/reports/brainstorm-260527-restructure-coordination-and-references.md`

## Plan Session — `/ck:plan --hard --tdd`

Created implementation plan at `plans/260527-restructure-coordination-and-references/plan.md` with 5 phases:
1. Rename+Flatten (2h) — git mv, flatten mcp/, update imports, hook wrappers atomically
2. Co-locate References+Evals (1h) — move from `.claude/skills/` to `tools/learning-loop-mcp/`, update skill files
3. Subpath Imports (2h) — add `#mcp/*` and `#lib/*` to `package.json`, rewrite deep relative imports
4. Config+Docs+Skills Update (2h) — `package.json`, `.mcp.json`, `README.md`, `CLAUDE.md`, docs, `gate-utils.cjs`, `.claude/__tests__`
5. Verification+Tests (2h) — `pnpm test`, `pnpm check`, server smoke, hook verification

Cross-plan dependency updated: `260527-0000-tools-simplification-mcp-agent-surface` now `blockedBy` this plan.

## Red Team Review

Spawned Security Adversary. 9 findings (5 accepted, 4 rejected):
- **Critical:** Stale hook wrappers = gate bypass window if not atomic commit. Accepted. Added atomic-commit emphasis to Phase 1 and Phase 5.
- **High:** `gate-utils.cjs` hardcodes dead `patterns.json` path. Accepted. Added to Phase 4 targets.
- **High:** `workflow-generate-prompt-tool.js` hardcodes blueprint paths that Phase 2 moves. Accepted. Added to Phase 2 file list.
- **High:** `.claude/coordination/__tests__/*.test.cjs` hardcode old server/core paths. Accepted. Added to Phase 4 and Phase 5 targets.
- **Medium:** Subpath imports exposed `#records/*` and `#schemas/*`. Accepted. Removed from `package.json` imports in Phase 3.
- Rejected: MCP name change breaks cached clients (expected transition cost), `legacy:` path validation (pre-existing), evals writability (not new risk), `workflow-runner.js` path substitution (pre-existing, spawn mitigates).

## Validation

3 critical questions asked:
1. Atomic commit for Phase 1 hook wrappers? **Yes** (Recommended).
2. Only `#mcp/*` and `#lib/*` aliases? **Yes** (Recommended).
3. Update `gate-utils.cjs` path now, delete later? **Yes** (Recommended).

All answers aligned with existing plan. Whole-plan consistency sweep: zero contradictions. Plan ready for implementation.

## Cross-Plan Dependency Update

During project-management follow-up, discovered `plans/260527-0000-tools-simplification-mcp-agent-surface` was already completed (status was stale/pending in file). Updated:
- `260527-0000-tools-simplification-mcp-agent-surface`: status → `completed`, removed `blockedBy: 260527-restructure-coordination-and-references`
- `260527-restructure-coordination-and-references`: removed `blocks: 260527-0000-tools-simplification-mcp-agent-surface`

Dependency graph now consistent. No blockers remaining for this plan.

## Next Step

User selected `/ck:plan validate` (already completed). Recommend `/ck:cook /home/datguy/codingProjects/learning-loop-template/plans/260527-restructure-coordination-and-references/plan.md` for implementation.
