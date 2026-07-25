# Phase 1 — Design-fork decision record (portable-six re-homing)

**Date:** 2026-07-25
**Plan:** plans/260725-1439-portable-six-workflow-tools-rehome-mcp-to-cli

## Decision: Option A — full unwrap (CONFIRMED)

Option A was operator-confirmed in Validation Session 1 (O-Q1). Phase 1 probes
ran as the evidence record; B' adoption would require an explicit operator
override, not merely a positive probe.

## Probe evidence

All probes live in `tools/learning-loop-mastra/__tests__/portable-six-probes.test.js`
(14 tests, green).

| Prerequisite | Probe | Result |
|---|---|---|
| P-Q2 (ordering) | 1 — source inspection of the `steps:` literal + `createRun().start()` result shape | All 6 workflows have exactly 1 step; handlers are pure (no `generateText`/`streamText`/`fetch`/`initStorage`). **Non-blocker.** |
| U-Q2 (resolveRoot) | 2 — grep for `resolveRoot`/`readFileSync`/`findProjectRoot`/fs imports/`appendFile`/`writeFileSync` | Zero hits in all 6 modules. **Scoped OUT** for the six; `workflow_generate_prompt`'s cross-root concern is a separate finding. |
| U-Q1 (unwrap contract) | 3 — schema oracle + behavior oracles for BOTH envelope forms | Captured to `__tests__/fixtures/workflow-oracles/workflow_<x>.json` for all 6. Content-envelope `{content:[...]}` input strips to the plain result for all 6; `self_improvement.proposed_changes` `{item:[...]}` strips to a plain array (per-field `stripEnvelope`, distinct from the factory's top-level `stripMcpContentEnvelope`). |
| Sec-F9 / Option B' feasibility | 4 — clean child process, no `initStorage()`, no `RequestContext`, `LOOP_RECORDS_VIA_CLI=1` | `createRun({}).start({inputData})` **succeeds** (status `success`, correct classify result). B' is technically feasible — but Option A stays confirmed: the rename is bounded (11 sites) and Option A dissolves Sec-F9 by removal instead of adding a `convertWorkflowsToTools` branch. |

## Caller-set enumeration (step 5)

Grep across all 4 reference forms (MCP names, workflow file paths, camelCase
exports, count constants), excluding `node_modules`, `.claude/worktrees`,
`plans/` historical records. The 11 red-team-verified sites confirmed with zero
additions:

1. `agent-manifest.json:13` — workflow group `tools` array (test contract + check_runtime_agnostic input)
2. `interface/RUNTIME_ONBOARDING.md:123` (example) + `:126` (Total recompute)
3. `__tests__/mcp-tools-list-parity.test.js:33` (`MIGRATED_TOOL_NAMES` — phantom; O-Q5 = drop + specific test)
4. `__tests__/server-runid.test.js:30-38` (3 callTool — relocate to `run_workflow_storage_round_trip`)
5. `__tests__/workflow-parity.test.cjs:57,63,70,84,95,106,116` + counts `:130-132` (37/8/48 → 43/2/48)
6. `__tests__/workflow-direct-parity.test.js` (13 cases importing the 6 workflow files — retire)
7. `__tests__/legacy-mcp/tool-deletion-coverage.test.js:50` (36→42) + `:118` (`run_${tool}` → `mastra_workflow_${tool}`)
8. `__tests__/cli-mcp-subset-registration.test.js:77,133` (37→43) + `:136` (`43 - CLI_TOOLS.size`)
9. `__tests__/manifest-arithmetic.test.cjs:49` (8→2) + shared `TOOLS_MANIFEST_ENTRIES`
10. `__tests__/helpers/manifest-constants.cjs:22` (`TOOLS_MANIFEST_ENTRIES: 36`→42)
11. `__tests__/legacy-mcp/mastra-code-smoke.test.cjs:87-88` (comment + example)

One additional hit NOT a caller: `scout/pipeline/fixtures/scout-output.json`
already references the future `workflowClassifyPromptTool`-style export names —
no edit needed (fixture already uses the target shape).

Historical `plans/` hits are stateful records, not callers — excluded by design.

Status: DONE
