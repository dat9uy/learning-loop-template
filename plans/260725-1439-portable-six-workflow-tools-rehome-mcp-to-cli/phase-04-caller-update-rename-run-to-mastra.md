---
phase: 4
title: "Caller update — run_* → mastra_workflow_* rename"
status: pending
priority: P1
effort: "0.5d"
dependencies: [3]
---

# Phase 4: Caller update — run_* → mastra_workflow_* rename

## Overview

Option A reverts the MCP name from `run_workflow_<x>` (a `convertWorkflowsToTools` artifact) to `mastra_workflow_<x>` (the manifest-loop prefix). Update the bounded in-repo caller set enumerated in Phase 1 step 5 (the 11-site list). Phase 3 already retired the 6 obsolete workflow-path cases (`workflow-direct-parity.test.js`, `workflow-parity.test.cjs` portable cases) and updated the count-assertion files ATOMIC with the registration switch. Phase 4 owns the SURVIVING name references: `agent-manifest.json`, `interface/RUNTIME_ONBOARDING.md`, `mcp-tools-list-parity.test.js`, `server-runid.test.js`, `tool-deletion-coverage.test.js:118`, `mastra-code-smoke.test.cjs:87`. No external/published callers — the portable six are loop-internal tools.

## Requirements

- Functional: zero remaining `run_workflow_<x>` references (for the portable six) in active code or docs; the `server-runid.test.js` runId coverage moves to `run_workflow_storage_round_trip` (a surviving Mastra workflow); `mcp-tools-list-parity.test.js` parity is locked by a real assertion (not the phantom `MIGRATED_TOOL_NAMES`).
- Non-functional: historical references in `plans/` (prior plan records) are NOT edited — they are stateful records of past decisions, not callers. The `plans/260722-2147` deferral plan itself is not edited (completed record). The `agent-manifest.json` `groups.*.tools` arrays are a test contract + `check_runtime_agnostic` input (NOT pure metadata) — the rename must keep them consistent.

## Architecture

Pure rename + one test relocation. The grep in Phase 1 step 5 (across all 4 reference forms) is the authoritative caller list; Phase 4 walks the surviving sites. The `run_workflow_storage_*` names are UNCHANGED (they stay Mastra workflows). If validation picks O-Q4 = MIGRATE (not the default retire), Phase 4 ALSO renames the `workflow-parity.test.cjs` portable `callTool` calls (retired under the default) — add that step.

## Related Code Files

- Modify: `tools/learning-loop-mastra/agent-manifest.json` (workflow group: `run_workflow_<x>` → `mastra_workflow_<x>` for the 6; keep `run_workflow_storage_*`; update the group `description`)
- Modify: `tools/learning-loop-mastra/interface/RUNTIME_ONBOARDING.md` (line ~123: `learning-loop_run_workflow_classify_prompt` → `learning-loop_mastra_workflow_classify_prompt`; line ~126: recompute the "Total: 44 tools" — `.claude` exposes fewer under `LOOP_RECORDS_VIA_CLI=1`, and the full-surface count shifts)
- Modify: `tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js` (O-Q5: `MIGRATED_TOOL_NAMES` is a phantom list — drop it and add a specific `mastra_workflow_self_improvement` per-tool parity test that re-derives its parity JSON Schema and asserts it matches the Phase-1 oracle; this is the real guarantee the list never was)
- Modify: `tools/learning-loop-mastra/__tests__/server-runid.test.js` (move the 3 `callTool("run_workflow_classify_prompt", ...)` calls to `run_workflow_storage_round_trip` with storage-appropriate args)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/tool-deletion-coverage.test.js` (line 118: `run_${tool}` membership → `mastra_workflow_${tool}`; Phase 3 already updated line 50's `manifest.length`)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/mastra-code-smoke.test.cjs` (line 87: update the comment example `run_workflow_classify_prompt` → `mastra_workflow_classify_prompt`; the `expectedPrefixes` array is unchanged — the 6 now match `learning-loop_mastra_`, the 2 storage still match `learning-loop_run_workflow_`; test still passes, skips unless `status==="live"`)
- Delete: (none)

## Implementation Steps

1. **TDD — add a "no stale run_* refs" guard test (RED).** `__tests__/no-stale-portable-six-refs.test.js`: greps the repo (excluding `node_modules`, `.claude/worktrees/`, `plans/` historical records, this test file) for the 6 `run_workflow_<x>` names; asserts zero hits. Goes RED until steps 2–6 land. (Note: the guard greps the 6 NAMES; the count constants were already updated in Phase 3, so the guard does not need to match them — but it WILL flag the `mastra-code-smoke.test.cjs:87` comment, which step 6 fixes.)
2. **`agent-manifest.json`.** In the `workflow` group `tools` array, replace the 6 `run_workflow_<x>` with `mastra_workflow_<x>`; keep `run_workflow_storage_read`/`run_workflow_storage_round_trip` and the 3 existing `mastra_workflow_*` helpers. Update the group `description` count ("6 run_workflow_*" → "6 mastra_workflow_* (re-homed) + 2 storage run_workflow_*").
3. **`interface/RUNTIME_ONBOARDING.md`.** Line ~123: change the example `learning-loop_run_workflow_classify_prompt` → `learning-loop_mastra_workflow_classify_prompt` (preserve the trailing `| 11 |` index column — it is an index, not a count, per the 260708-2258 precedent). Line ~126: recompute the "Total: 44 tools exposed via MCP" — under `LOOP_RECORDS_VIA_CLI=1` (`.claude`) the 6 leave MCP; document the full-surface count for `.factory`/`.mastracode` (mastra 37→43, run_workflow 8→2) if the doc describes the full surface.
4. **`mcp-tools-list-parity.test.js` (O-Q5).** Drop the phantom `MIGRATED_TOOL_NAMES` list (declared lines 20-41, never referenced by any assertion). Add a specific `mastra_workflow_self_improvement` per-tool test: re-derive its parity JSON Schema (`z.toJSONSchema` via the registered tool) and assert it matches the Phase-1 oracle (the real guarantee the migration shape — incl. the per-field `stripEnvelope` — is preserved). This replaces the false confidence of the unused list.
5. **`server-runid.test.js` (concrete replacement assertion).** The test asserts the server stays responsive across multiple `createRun` calls (line 24) by calling `run_workflow_classify_prompt` 3x. Move the 3 calls to `run_workflow_storage_round_trip` with storage-appropriate args. The runId-derivation contract under test is workflow-agnostic (it lives in `convertWorkflowsToTools:216` `proxiedContext?.get("runId") ?? randomUUID()`, not in the workflow). Assert CONCRETELY: 3 sequential `callTool("run_workflow_storage_round_trip", {…})` invocations each return a valid result with a DISTINCT storage record (proving `createRun` succeeded with a distinct runId each time) — NOT a trivially-true `typeof r === "object"`. This preserves the "responsive across multiple createRun calls" coverage intent.
6. **`tool-deletion-coverage.test.js` + `mastra-code-smoke.test.cjs`.** `tool-deletion-coverage.test.js:118`: change `run_${tool}` membership to `mastra_workflow_${tool}` (Phase 3 already updated line 50's `manifest.length` to 42). `mastra-code-smoke.test.cjs:87`: update the comment example `run_workflow_classify_prompt` → `mastra_workflow_classify_prompt` so the no-stale-refs guard passes; `expectedPrefixes` is unchanged (the 6 now match `learning-loop_mastra_`, the 2 storage still match `learning-loop_run_workflow_`).
7. **Run the no-stale-refs guard → GREEN.** Confirm zero `run_workflow_<x>` (portable six) references outside the excluded paths. Run the full `pnpm test` — green.

## Success Criteria

- [ ] `no-stale-portable-six-refs.test.js` GREEN (zero `run_workflow_<x>` refs for the portable six in active code/docs, incl. comments).
- [ ] `agent-manifest.json` workflow group uses `mastra_workflow_<x>` for the 6; storage unchanged; description count updated.
- [ ] `interface/RUNTIME_ONBOARDING.md` example uses `learning-loop_mastra_workflow_classify_prompt`; the "Total" recomputed if it describes the full surface.
- [ ] `mcp-tools-list-parity.test.js` phantom `MIGRATED_TOOL_NAMES` dropped; a specific `mastra_workflow_self_improvement` per-tool parity test added (parity view matches the Phase-1 oracle, incl. the per-field `stripEnvelope`).
- [ ] `server-runid.test.js` runId coverage moved to `run_workflow_storage_round_trip` with a CONCRETE assertion (3 sequential calls → 3 distinct storage records, proving createRun succeeded with distinct runIds — not a trivially-true typeof check).
- [ ] `tool-deletion-coverage.test.js:118` uses `mastra_workflow_${tool}`; `mastra-code-smoke.test.cjs:87` comment updated; `expectedPrefixes` unchanged.
- [ ] `pnpm test` green; `plans/` historical records untouched.

## Risk Assessment

- **`mcp-tools-list-parity.test.js` parity-view change.** The unwrap could change the model-visible JSON Schema subtly (e.g. a description dropped). Mitigation: step 4 re-derives the schema and compares to the Phase-2 oracle; if they differ, the oracle is the source of truth and the handler is fixed, not the oracle.
- **`server-runid.test.js` semantic shift.** Moving from classify (pure transform) to storage (writes a record) changes what the runId test observes. Mitigation: the runId behavior under test is the workflow engine's runId derivation, which is workflow-agnostic; if storage's runId path differs, the test is rewritten to assert storage's actual runId contract, preserving coverage intent (runId is exercised) without weakening it.
- **Missed caller outside the grep.** A caller added between Phase 1 step 5 and Phase 4. Mitigation: the no-stale-refs guard test (step 1) re-runs the grep at test time and fails on any new hit; it is the durable guardrail, not a one-shot grep.
- **Editing `plans/` historical records.** Tempting to "fix" the old `run_workflow_*` refs in prior plans. Mitigation: prior plans are stateful records (the deferral plan recorded the names AS THEY WERE); the no-stale-refs test excludes `plans/` by design. Do not edit them.
