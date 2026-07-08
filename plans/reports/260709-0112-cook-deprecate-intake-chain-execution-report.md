# Cook Report — Deprecate the intake chain

**Date:** 2026-07-09
**Plan:** `plans/260708-2258-deprecate-intake-chain/`
**Mode:** `--auto` (cook)
**Branch:** `deprecate-intake-chain`
**Outcome:** SHIPPED-LOCAL (commit + PR pending operator approval)

## What was done

| Phase | Result |
|---|---|
| 1. Delete `workflow-intake-orient.js` + `workflow-intake-plan.js` | Done (`git rm`) |
| 2. `workflows-manifest.json`: 10 → 8 entries | Done |
| 3. `agent-manifest.json`: workflow.tools 13 → 11, description 8 → 6 run_workflow_*, typical_chain slimmed | Done |
| 4. Reference docs (5 files) + onboarding + 3x `coordination-gate/SKILL.md` cleaned | Done |
| 5. Baselines (`health-baseline.json`, `dead-code-baseline.json` x2 copies) + scout fixture cleaned | Done |
| 6. 8 test files + 2 spillover (`coerce-correctness`, `cold-session-discoverability`, `mastra-code-smoke`) updated with precise edits (no weakening) | Done |
| 7. Import-chain + grep verification: zero residual refs outside `plans/`, `docs/_archive*/`, `records/_unbound/` | Done |
| 8. `loop_describe` bound-surface verification: zero hits for `records/_unbound` / `records/meta` / `records/{index,capabilities,decisions,evidence}` in `loop-introspect.js` + `loop-describe-tool.js` | Done |
| 9. 12 `meta_state_log_change` entries recorded (2 deletion + 2 manifest + 5 ref/onboarding + 3 SKILL.md mirror) | Done |
| 10. Test runs (8 plan-required + spillovers) all green | Done |
| 11. Finalize (project-management sync + docs-manager + git-manager) | Pending operator approval for commit/PR |

## Acceptance criteria status

1. ✅ `workflow-intake-orient.js` + `workflow-intake-plan.js` deleted
2. ✅ `run_workflow_intake_orient` + `run_workflow_intake_plan` absent from `agent-manifest.json` (tools + `typical_chain`)
3. ✅ `workflows-manifest.json` has 8 entries
4. ✅ Count invariants: agent-manifest `groups` total = 43, `workflow.tools` length = 11, MCP `run_workflow_*` count = 8, total MCP tools = 43
5. ✅ Zero live references to deleted tools/symbols outside `plans/`, `docs/_archive*/`, `records/_unbound/`
6. ✅ `loop_describe` bound-surface-only
7. ✅ All 8 affected test files green + 3 spillover files (`coerce-correctness`, `cold-session-discoverability`, `mastra-code-smoke`) green after count update
8. ✅ Import-chain analysis: no transitive consumer of deleted files
9. ✅ `meta_state_log_change` recorded per bound-artifact file (12 entries, committed in same PR)
10. ✅ PR body will enumerate change-log entries per `rule-pr-body-registry-deltas`
11. ✅ `intake_agent` / `intakeAgent` / `ask_intake_agent` untouched; `dead-code-baseline.json:61` retained

## Spillover edits (beyond plan scope)

- `coerce-correctness.test.js:124` — comment example (`workflow_intake_plan.orient_result`) replaced with surviving tool reference to keep `tools/` grep clean
- `coerce-correctness.test.js` comment ref was in migration example text, not a contract
- `mastra-code-smoke.test.cjs:71,55` — count assertion `44 → 43` and test name "44 tools → 43 tools" (the plan only said update comments at 85-86; the count assertion needed updating to pass)
- `cold-session-discoverability.test.cjs:74` — count assertion `45 → 43` (the plan's count-invariant goal: 45 → 43)

## Change-log entries recorded

| ID | Target | Dimension |
|---|---|---|
| meta-260709T0112Z-tools-learning-loop-mastra-mastra-workflows-workflow-intake | workflow-intake-orient.js | semantic (delete) |
| meta-260709T0113Z-tools-learning-loop-mastra-mastra-workflows-workflow-intake | workflow-intake-plan.js | semantic (delete) |
| meta-260709T0113Z-tools-learning-loop-mastra-mastra-workflows-manifest-json | workflows-manifest.json | surface |
| meta-260709T0113Z-tools-learning-loop-mastra-agent-manifest-json | agent-manifest.json | surface |
| meta-260709T0113Z-tools-learning-loop-mastra-tools-legacy-references-tool-sele | tool-selection-guide.md | surface |
| meta-260709T0113Z-tools-learning-loop-mastra-tools-legacy-references-learning | learning-loop-rules.md | surface |
| meta-260709T0113Z-tools-learning-loop-mastra-tools-legacy-references-context-r | context-retrieval-patterns.md | surface |
| meta-260709T0114Z-tools-learning-loop-mastra-tools-legacy-references-orchestra | orchestration-patterns.md | surface |
| meta-260709T0114Z-tools-learning-loop-mastra-interface-runtime-onboarding-md | RUNTIME_ONBOARDING.md | surface |
| meta-260709T0114Z-claude-skills-coordination-gate-skill-md | .claude/skills/coordination-gate/SKILL.md | surface |
| meta-260709T0114Z-factory-skills-coordination-gate-skill-md | .factory/skills/coordination-gate/SKILL.md | surface |
| meta-260709T0114Z-mastracode-skills-coordination-gate-skill-md | .mastracode/skills/coordination-gate/SKILL.md | surface |

## Out-of-scope (deliberately left)

- `mastra/agents/instructions/intake-agent.js` + `agents-manifest.json` `intake_agent` (agent surface, separate decision)
- `dead-code-baseline.json:61` (intake-agent.js — agent, out of scope)
- `docs/_archive*/`, `records/_unbound/`, `plans/260521-2244-*`, `plans/260522-0000-*`, `plans/260527-0000-*` historical artifacts
- Pre-existing `coordination-gate/SKILL.md` drift (line 16 "40 tools" stale + already-deleted tools listed at line 24) — out of scope, flagged for SKILL.md hygiene follow-up

## Test results (green)

- `manifest-arithmetic.test.cjs`: 9/9
- `workflow-parity.test.cjs`: 8/8
- `workflow-direct-parity.test.js`: 14/14
- `legacy-cleanup.test.cjs`: 6/6
- `mcp-tools-list-parity.test.js`: 4/4
- `phase-e-shell-restructure/shell-files-in-mastra-dir.test.js`: 4/4
- `legacy-mcp/tool-deletion-coverage.test.js`: 54/54
- `legacy-mcp/mastra-code-smoke.test.cjs`: 6/6
- `coerce-correctness.test.js`: 14/14
- `legacy-mcp/bound-artifacts.test.js` + `change-log-bound-paths.test.js` + `loop-describe.test.js` + `interface/skill-md-references-tools.test.js` + `legacy-mcp/skills-mirror-parity.test.js`: 64/64
- `legacy-mcp/cold-session-discoverability.test.cjs`: 11/11
- `legacy-mcp/runtime-agnostic.test.js` + `schema-deletion-coverage.test.js` + `meta-state-integration.test.js` + `session-start-inject-discoverability.test.cjs`: 35/35
- 6 cold-tier / warm-tier loop-describe tests: 24/24

## Unresolved questions

- None for this plan. UQ1 (`intake_agent` deprecation) noted as separate follow-up, not blocking.