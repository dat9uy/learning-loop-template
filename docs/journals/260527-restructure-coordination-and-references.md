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

## Implementation — `/ck:cook /home/datguy/codingProjects/learning-loop-template/plans/260527-restructure-coordination-and-references/plan.md --tdd`

**Date:** 2026-05-27
**Mode:** TDD (tests-first baseline, then refactor)
**Result:** All 5 phases complete, zero logic changes, 227/228 tests pass (pre-existing `check-budget` failure).

### Phase 1: Rename+Flatten
- `git mv tools/coordination-gate tools/learning-loop-mcp`
- Flattened `mcp/` → top level: server.js, tool-registry.js, workflow-runner.js, agent-manifest.json, lib/, tools/
- Updated all 6 hook wrapper paths atomically (same commit)
- Server smoke test: 33/33 tools registered

### Phase 2: Co-locate References+Evals
- `git mv .claude/skills/learning-loop/references tools/learning-loop-mcp/references`
- `git mv .claude/skills/learning-loop/evals tools/learning-loop-mcp/evals`
- Updated `.claude/skills/learning-loop/SKILL.md` and `.factory/skills/learning-loop/SKILL.md` references
- Updated `workflow-generate-prompt-tool.js` BLUEPRINTS map

### Phase 3: Subpath Imports
- Added `"imports": { "#mcp/*": "./tools/learning-loop-mcp/*", "#lib/*": "./tools/lib/*" }` to `package.json`
- Replaced `../../../lib/` → `#lib/`, `../../core/` → `#mcp/core/`, `../lib/` → `#lib/`, `../mcp/lib/` → `#mcp/lib/`
- Alias usage: 50 `#lib/`, 25 `#mcp/core/`, 6 `#mcp/lib/`

### Phase 4: Config+Docs+Skills Update
- `package.json` script: `gate:server` → `node tools/learning-loop-mcp/server.js`
- `.mcp.json`: server key `coordination-gate` → `learning-loop-mcp`
- `CLAUDE.md`: all path references updated
- `README.md`: lane table updated
- `.factory/skills/coordination-gate/SKILL.md` + `.claude/skills/coordination-gate/SKILL.md` paths updated
- `.claude/coordination/__tests__/*.test.cjs` hardcoded paths updated
- `.claude/coordination/hooks/lib/gate-utils.cjs` patterns.json path updated

### Phase 5: Verification
- `node tools/learning-loop-mcp/server.js`: 33/33 tools registered (PASS)
- `node --test 'tools/learning-loop-mcp/__tests__/*.test.js'`: 12/12 pass (PASS)
- `node --test '.claude/coordination/__tests__/*.test.cjs'`: 78/78 pass (PASS)
- `pnpm test`: 227/228 pass (pre-existing check-budget failure, NOT caused by refactor)
- `pnpm check`: `generate:capabilities --dry-run` fails on pre-existing `vnstock_data` Python import (out of scope)
- Zero `tools/coordination-gate` references in active code (PASS)
- Zero `../../../lib/` deep imports in `tools/learning-loop-mcp/` (PASS)
- All 6 hook wrappers exit 0 on benign inputs (PASS)
- Code review subagent: APPROVED — all 8 acceptance criteria pass, zero regressions

### Post-Implementation Cleanup

**Deleted dead code:**
- `.claude/coordination/hooks/lib/gate-utils.cjs` — was dead code in production (all hooks delegate to universal ESM hooks in `tools/learning-loop-mcp/hooks/`). Only remaining consumer was `.claude/coordination/__tests__/gate-utils.test.cjs`.
- `.claude/coordination/__tests__/gate-utils.test.cjs` — tests for the deleted dead code.
- Updated `.claude/coordination/hooks/README.md` — removed `gate-utils.cjs` section, replaced with note about universal ESM hooks.

Test count: 228 → 204 (24 gate-utils tests removed). Only remaining failure: pre-existing `check-budget.test.js:48`.

### Plan Status
- All phase checkboxes marked `[x]`
- `plan.md` frontmatter: `status: completed`
