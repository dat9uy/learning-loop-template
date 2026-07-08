# Phase 01 — Deprecate the intake chain (orient + plan)

## Context links

- Plan: `plans/260708-2258-deprecate-intake-chain/plan.md`
- Engine framing: `docs/loop-engine.md` (bound/unbound surfaces; `record` role; Rec 12 change-log trigger).
- Rec 12 trigger (shipped PR #40/#41): an edit to `tools/**`/`core/**` source is a bound-artifact change → `meta_state_log_change` required.

## Requirements

1. Remove the `workflow_intake_orient` + `workflow_intake_plan` MCP tools and their workflow implementations.
2. Remove them from the agent manifest (tools list + `typical_chain`).
3. Remove them from the workflows manifest.
4. Remove stale references in docs, baselines, scout fixture.
5. Update tests that assert the tool set; do not weaken them.
6. Verify `loop_describe` is bound-surface-only (no `records/_unbound/` / `records/meta/` reads). No change expected.
7. Record one `meta_state_log_change` for the deletion.

## Files to delete

- `tools/learning-loop-mastra/mastra/workflows/workflow-intake-orient.js`
- `tools/learning-loop-mastra/mastra/workflows/workflow-intake-plan.js`

## Files to modify (scout-verified, line-precise)

**Manifests / agent surface**
- `tools/learning-loop-mastra/mastra/workflows-manifest.json` — remove lines 2-3 (`workflow-intake-orient.js`/`workflowIntakeOrient`, `workflow-intake-plan.js`/`workflowIntakePlan`). 10 entries → 8.
- `tools/learning-loop-mastra/agent-manifest.json` — drop `run_workflow_intake_orient` + `run_workflow_intake_plan` from `groups.workflow.tools` (13 → 11); update `typical_chain` (drop the two orient/plan entries; keep `mastra_workflow_notify_artifact`).
- `tools/learning-loop-mastra/mastra/server.js` — **no edit** (scout: 0 intake refs; data-driven loader reads `workflows-manifest.json`). Confirm during cook.

**Reference docs (remove intake-orient/plan mentions)**
- `tools/legacy/references/tool-selection-guide.md:69-70` — remove the 2 table rows ("Run the intake orient phase" / "Plan a verification sequence from orient output"); replace orientation pointer with `loop_describe({tier:"warm"})`.
- `tools/legacy/references/learning-loop-rules.md:5` — remove `workflow_intake_orient` from the mention (keep `workflow_classify_prompt`).
- `tools/legacy/references/context-retrieval-patterns.md:5` — remove `workflow_intake_orient` (keep `capability_list_probes`, `index_search`).
- `interface/RUNTIME_ONBOARDING.md:123` — change the example runner from `learning-loop_run_workflow_intake_orient` to a surviving runner (e.g. `learning-loop_run_workflow_classify_prompt`); the trailing `| 11 |` is an index column, not a count — leave it.

**Baselines / fixtures**
- `baselines/fallow/health-baseline.json:201,206` — remove the 2 workflow-file entries.
- `baselines/fallow/dead-code-baseline.json:57` — remove the `workflow-intake-orient.js:../core/file-readers.js` edge. **Line 61 stays** (`intake-agent.js` — the agent, out of scope).
- `scout/legacy/fixtures/scout-output.json:1180,1182` — remove `workflow_intake_orient_tool`, `workflow_intake_plan_tool`.

**Tests (precise edits — do not weaken; red-team-verified)**
- `__tests__/manifest-arithmetic.test.cjs` — **3 assertions + header**: line 39 `workflows.length` 10→8; line 51 `total` 45→43 (group totals drop by 2); line 55 `workflow.tools.length` 13→11. Comments: line 1-2 header "45-tool total ... 13 in workflow group" → "43-tool total ... 11"; line 7 "10 entries"→"8"; line 10 "13 entries (8 run + 3 mastra + 2 storage)"→"11 (6 run + 3 mastra + 2 storage)". Cross-walk at lines 78-86 still holds (derives `run_<id>` from surviving 8 manifest entries — all 8 in workflow.tools). New total check: 6 gate + 11 workflow + 19 meta_state + 3 introspection + 1 runtime_agnostic + 3 agent = 43.
- `__tests__/workflow-parity.test.cjs` — **2 test regions**: delete the 2 orient/plan shape tests (lines 63-90); AND update the enumeration test (lines 160-172): line 165 `runWorkflows.length` 10→8, line 166 `tools.length` 45→43, test-name label "32 mastra_* + 10 run_workflow_* = 42" → "32 + 8 = 40". (`mastra.length` 32 unchanged — no `mastra_*` tool removed.)
- `__tests__/workflow-direct-parity.test.js` — **5 tests** (not 4): delete the orient/plan tests at lines 24-46 + 189-214 AND the 5th at lines 350-372 (`workflow_intake_plan handles envelope-form input`, imports the deleted file). After edits, re-grep the file for `workflow-intake-` to confirm zero imports remain.
- `__tests__/legacy-cleanup.test.cjs:61` — remove the `{ file: "tools/learning-loop-mastra/mastra/workflows/workflow-intake-plan.js", importPath: "../core/envelope-stripper.js" }` entry from the `consumers` array (it asserts `existsSync`). Keep line 62 (`workflow-self-improvement.js` — survives).
- `__tests__/legacy-mcp/tool-deletion-coverage.test.js` — `length === 13` assertion (~line 92) → 11; move `workflow_intake_orient` + `workflow_intake_plan` out of `migratedInThisPlan` (8→6) into a new `deletedInThisPlan` list; update "8 in-scope" comment → "6 in-scope". **Framing correction (M1):** the existing `includes(bare) === false` guard is a phantom no-op (compares bare names against `run_`-prefixed list — passes for anything). Do NOT claim the move "preserves" a guard. Optional strengthen: change to `includes("run_" + tool) === false` so the recategorization is load-bearing. At minimum, correct the plan's claim.
- `__tests__/legacy-mcp/mastra-code-smoke.test.cjs:85-86` — comment-only examples; change `run_workflow_intake_orient` → a surviving runner; `ask_intake_agent` example stays (agent kept).
- `__tests__/mcp-tools-list-parity.test.js:29` — remove `"run_workflow_intake_plan"` from `MIGRATED_TOOL_NAMES` (documentation-only array; no test iterates it, but stale).
- `__tests__/phase-e-shell-restructure/shell-files-in-mastra-dir.test.js` — line 60 test name "contains all 10 workflow files" → "all 8"; lines 63-64 remove `workflow-intake-orient.js`, `workflow-intake-plan.js` from `expectedWorkflows`.

**Skill docs (live, red-team-verified — H1/H2)**
- `.claude/skills/coordination-gate/SKILL.md:24,32`, `.factory/skills/coordination-gate/SKILL.md:24,32`, `.mastracode/skills/coordination-gate/SKILL.md:24,32` — line 24: remove `workflow_intake_orient`, `workflow_intake_plan` from the `workflow_*` row; line 32: remove Quickstart step 3 (`workflow_intake_orient — orient on plan.md`). **Pre-existing drift flag:** line 24 ALSO lists already-deleted tools (`workflow_convert_evidence`, `workflow_verify_evidence`, `workflow_generate_prompt`, `workflow_external_decision`, `workflow_product_build`) + line 16 "Registered: 40 tools" is stale — these are NOT caused by this plan and are out of scope; flag as a separate SKILL.md hygiene follow-up, do not fix here.
- `tools/legacy/references/orchestration-patterns.md:5` — remove `workflow_intake_plan` (keep `workflow_report_phase_status`).

**Leave untouched**
- `mastra/agents/instructions/intake-agent.js` + `agents-manifest.json` `intake_agent` (agent surface — out of scope; verified `intake-agent.js` uses `buildReadOnlyMetaStateTools()` from `tools/manifest.json` only, never `workflows-manifest.json`).
- `plans/260527-0000-...`, `plans/260522-0000-...`, `plans/260521-2244-...` — historical plan docs.
- `docs/_archive*/`, `records/_unbound/` historical artifacts.

## Implementation steps

1. **Delete** the two workflow files (`workflow-intake-orient.js`, `workflow-intake-plan.js`).
2. **Run import-chain analysis after deletion** — the gate-enforced rule `rule-import-chain-analysis-after-tool-deletion` fires on `rm` of tool files. Run the repo's import-chain analysis (per the rule) to confirm no transitive consumer of the deleted files remains. Re-grep: `grep -rn "workflow-intake-orient\|workflow-intake-plan\|workflowIntakeOrient\|workflowIntakePlan\|run_workflow_intake_orient\|run_workflow_intake_plan\|orient_result" tools/ .claude/ .factory/ .mastracode/ docs/` — confirm zero hits outside `docs/_archive*/`, `plans/`, `records/_unbound/`.
3. **Update `workflows-manifest.json`** — remove the 2 entries (10 → 8).
4. **Update `agent-manifest.json`** — remove 2 from `groups.workflow.tools` (13 → 11); update `typical_chain` (drop orient+plan, keep `mastra_workflow_notify_artifact`).
5. **Update reference docs + onboarding + skill docs** — per line refs above (incl. 3x `coordination-gate/SKILL.md` + `orchestration-patterns.md`).
6. **Update baselines + scout fixture** — per line refs above (remember: `dead-code-baseline.json:61` stays — it's the agent).
7. **Update tests** — per line refs above. Run each affected test first to confirm the exact failure, then apply the precise edit. **All 8 test files** are in scope: `manifest-arithmetic`, `workflow-parity`, `workflow-direct-parity`, `legacy-cleanup`, `tool-deletion-coverage`, `mastra-code-smoke`, `mcp-tools-list-parity`, `phase-e-shell-restructure/shell-files-in-mastra-dir`. For `tool-deletion-coverage`, recategorize (don't delete the length assertion); correct the "preserves guard" framing (it's a phantom no-op — M1).
8. **Verify `loop_describe` bound-surface:** `grep -rn "records/_unbound\|records/meta\b\|records/index\|records/capabilities\|records/decisions\|records/evidence" core/loop-introspect.js tools/legacy/loop-describe-tool.js` → expect **no hits**. If hits appear, stop and surface to operator.
9. **Record change-logs in-PR (per-file, per Rec 12 trigger):** record one `meta_state_log_change` per bound-artifact file edited, following the per-file practice seen in PR #41 (1435Z batch = 4 change-logs for 4 core files). Bound artifacts here = the 2 deleted workflow files + `workflows-manifest.json` + `agent-manifest.json` + the 4 reference/onboarding docs + 3x `coordination-gate/SKILL.md` + `orchestration-patterns.md`. Tests + baselines + scout fixture are NOT bound artifacts (not in the Rec 12 trigger list) — no change-log for them. **Commit the change-log appends in the same PR** so `git revert` is a clean rollback (no orphan registry entry). Example for the primary deletion: `meta_state_log_change({ change_dimension: "semantic", change_target: "tools/learning-loop-mastra/mastra/workflows/workflow-intake-orient.js", change_diff: { removed: ["workflow-intake-orient.js"], changed: ["workflows-manifest.json", "agent-manifest.json", "coordination-gate/SKILL.md x3", "tool-selection-guide.md", "learning-loop-rules.md", "context-retrieval-patterns.md", "orchestration-patterns.md", "RUNTIME_ONBOARDING.md", "health-baseline.json", "dead-code-baseline.json:57", "scout-output.json", "manifest-arithmetic.test.cjs", "workflow-parity.test.cjs", "workflow-direct-parity.test.js", "legacy-cleanup.test.cjs", "tool-deletion-coverage.test.js", "mastra-code-smoke.test.cjs", "mcp-tools-list-parity.test.js", "shell-files-in-mastra-dir.test.js"] }, reason: "Scrap the deterministic intake chain: workflow_intake_orient reads dead records paths (substrate restructured to records/_unbound/) and is redundant with loop_describe; workflow_intake_plan unreachable without orient_result. intake_agent kept as separate agentic surface. Operator decision 2026-07-08." })`. Repeat per bound-artifact file.
10. **PR body:** enumerate each new change-log entry as the registry delta per `rule-pr-body-registry-deltas`.

## Tests / validation

- `pnpm test` (or the repo's test command) — narrow first: run the 8 affected test files; broaden to the full legacy-mcp + manifest suite once those pass.
- Re-grep verification (acceptance criterion 4): `grep -rn "workflow_intake_orient\|workflow_intake_plan\|workflowIntakeOrient\|workflowIntakePlan\|run_workflow_intake_orient\|run_workflow_intake_plan\|orient_result" tools/ .claude/ .factory/ .mastracode/ docs/` → zero hits outside `docs/_archive*/`, `plans/`, `records/_unbound/`.
- `loop_describe` bound-surface verification (acceptance criterion 5).
- Import-chain analysis (step 2) — per gate rule, no transitive consumer of the deleted files remains.
- Typecheck/lint if the repo runs them on `tools/**`.

## Risks / rollback

- **Test fixture weakening:** do not skip or delete failing tests; update their expected sets with the precise count changes (43/11/8). If a test genuinely encodes a contract that requires orient/plan to *exist*, surface it — that would mean a live consumer and the scrap is wrong.
- **Change-log rollback cleanliness:** the change-log appends MUST be committed in the same PR (step 9) or `git revert` leaves an orphan registry entry. Stated explicitly per red-team UQ2.
- **Pre-existing coordination-gate SKILL.md drift:** line 24 lists already-deleted tools + line 16 "40 tools" stale — NOT caused by this plan; out of scope. Flag as a separate SKILL.md hygiene follow-up; do not fix here (would expand scope).
- **Rollback:** `git revert` the PR (change-logs committed in-PR → clean revert). No schema migration.