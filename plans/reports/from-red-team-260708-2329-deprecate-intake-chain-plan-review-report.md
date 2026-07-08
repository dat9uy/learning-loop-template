# Red-team review: deprecate intake chain (orient + plan) plan

**Date:** 2026-07-08
**Plan:** `plans/260708-2258-deprecate-intake-chain/`
**Verdict:** DONE_WITH_CONCERNS → all findings applied to the plan (status now reflects the corrected touch list).
**Method:** one adversarial reviewer (code-reviewer agent); every finding empirically verified against source before applying.

## Premise (verified sound)

- `workflow_intake_orient` reads dead `records/` paths (substrate restructured to `records/_unbound/` + `records/meta/`; old paths absent) → returns empty. Confirmed empirically.
- `workflow_intake_plan` unreachable without `orient_result`; no other consumer of `orient_result` (grep confirmed).
- `intake_agent`/`intakeAgent` is independent — `intake-agent.js` uses `buildReadOnlyMetaStateTools()` from `tools/manifest.json` only, never `workflows-manifest.json`. Out-of-scope boundary correct.
- `loop_describe` reads only bound surface (grep `loop-introspect.js`/`loop-describe-tool.js` for `records/_unbound|records/meta|records/index|...` → empty). Sufficiency claim holds; orient's unique outputs (`missing_decisions`, `capability_files`) return empty against the dead layout, so no live capability lost.
- `mastra_workflow_notify_artifact` does NOT chain off orient/plan (kept correctly).

## Critical (all applied — were blockers)

| ID | File:line | Failure | Fix applied |
|----|-----------|---------|-------------|
| C1 | `manifest-arithmetic.test.cjs:51` | `total` 45→43 missed | added: line 51 45→43 + header comment |
| C2 | `workflow-parity.test.cjs:165-166` | `runWorkflows` 10→8, `tools` 45→43 missed | added: enumeration test edits + test-name label |
| C3 | `legacy-cleanup.test.cjs:61` | `existsSync` on deleted file | added file to touch list; remove consumer entry (keep self-improvement) |
| C4 | `workflow-direct-parity.test.js:350-372` | 5th test missed (was "4 tests") | corrected to 5 tests; re-grep for residual imports |

## High (applied)

| ID | File | Fix applied |
|----|------|-------------|
| H1 | 3x `.claude/.factory/.mastracode/skills/coordination-gate/SKILL.md:24,32` | added all 3 to touch list; remove orient/plan from `workflow_*` row + Quickstart step 3. Pre-existing drift (other deleted tools still listed on line 24, line 16 "40 tools" stale) flagged as separate follow-up — NOT fixed here. |
| H2 | `orchestration-patterns.md:5` | added; remove `workflow_intake_plan` (keep `workflow_report_phase_status`) |

## Medium (applied)

- **M1** `tool-deletion-coverage.test.js:111-113`: the `includes(bare) === false` guard is a phantom no-op (compares bare names against `run_`-prefixed list). Plan's "preserves a guard" framing corrected; optional strengthen to `includes("run_"+tool) === false`.
- **M2** `mcp-tools-list-parity.test.js:29`: `MIGRATED_TOOL_NAMES` lists `run_workflow_intake_plan` (documentation-only). Added to touch list.

## Low (optional, noted)

- L1 `shell-files-in-mastra-dir.test.js:60` test name "all 10" → "all 8" (in touch list).
- L2 `coerce-correctness.test.js:124` comment-only `workflow_intake_plan.orient_result` example — optional.
- L3 `manifest-arithmetic.test.cjs:1-2` header comment — in touch list.

## Process corrections (applied)

- **Import-chain analysis:** gate-enforced rule `rule-import-chain-analysis-after-tool-deletion` fires on `rm` of tool files — added as step 2 + acceptance criterion 8.
- **Change-log granularity + rollback:** registry practice is **per-file** (PR #41: 1435Z = 4 change-logs/4 files; 1508Z = 3/3). Plan corrected from "one combined" → per bound-artifact file, **committed in-PR** for clean `git revert` (UQ2 resolved).

## Count invariants (final, green-target)

- `workflows-manifest.json`: 10 → 8
- `agent-manifest.json#groups` total: 45 → 43
- `groups.workflow.tools`: 13 → 11 (6 run + 3 mastra + 2 storage)
- MCP `run_workflow_*`: 10 → 8
- total MCP tools: 45 → 43 (32 mastra + 8 run + 3 ask)

## Unresolved questions (carried into plan)

1. `coordination-gate/SKILL.md` broader stale drift (other deleted tools on line 24, "40 tools" on line 16) — separate hygiene follow-up, out of scope.
2. `intake_agent` deprecation — separate decision (plan UQ1); not blocking.

Status: DONE_WITH_CONCERNS → resolved (all blockers applied to plan).