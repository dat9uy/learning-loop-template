---
phase: 3
title: "8 createWorkflow wrappers"
status: pending
priority: P1
effort: "2-3h"
dependencies: ["2"]
---

# Phase 3: 8 createWorkflow wrappers + workflows-manifest.json

## Overview

Write 8 `createLoopWorkflow({...})` call sites (one per moved workflow file from Phase 1). Ship `tools/learning-loop-mastra/workflows-manifest.json` with the 8 entries. **TDD-per-workflow:** write a direct unit parity test (no MCP) for each wrapper that invokes the workflow via `.createRun().start()` and asserts the output matches the legacy handler return — 8 tests total. Then write the wrappers.

## Why TDD-per-workflow

Each workflow has a different handler signature. A single suite-wide test would surface bugs in aggregate ("7 of 8 pass" — which one failed? why?). TDD-per-workflow means a wrapper's bug surfaces in one specific test with one specific assertion, narrowing the diff to one file. Matches the Phase C parity harness pattern (per-tool assertions, not aggregate).

## Q1 resolution applied here

Per `plan.md` §"Q1 Conflict Resolution": all 8 workflows ship with **thin `stateSchema = input`** (parity-faithful). Multi-step `stateSchema` restructuring for `self_improvement` and `runtime_probe` is deferred to Plan 1a or absorbed into Plan 3. The factory supports `stateSchema` already (Phase 2); future restructuring is a 1-line addition per call site.

Each wrapper file gets a comment header documenting the deferred restructuring decision.

## Per-workflow mapping

| # | Source file (moved) | Exported name | Wrapper pattern |
|---|---------------------|---------------|-----------------|
| 1 | `workflow-intake-orient.js` | `workflowIntakeOrient` | `createLoopWorkflow({ id: "workflow_intake_orient", description, inputSchema, steps: [{ id: "load-orientation", inputSchema, outputSchema, handler: loadOrientation }] })` |
| 2 | `workflow-intake-plan.js` | `workflowIntakePlan` | Single step `plan-steps`; handler is the existing transform |
| 3 | `workflow-classify-prompt.js` | `workflowClassifyPrompt` | Single step `classify`; handler is the keyword heuristic |
| 4 | `workflow-prepare-runtime-request.js` | `workflowPrepareRuntimeRequest` | Single step `prepare`; handler is the template builder |
| 5 | `workflow-self-improvement.js` | `workflowSelfImprovement` | Single step `propose-experiment`; handler is the lookup table; **DEFER comment for multi-step stateSchema** |
| 6 | `workflow-intentional-skip.js` | `workflowIntentionalSkip` | Single step `decide-skip`; handler is the decision tree |
| 7 | `workflow-report-phase-status.js` | `workflowReportPhaseStatus` | Single step `report-status`; handler is the boolean derivation |
| 8 | `workflow-runtime-probe.js` | `workflowRuntimeProbe` | Single step `plan-probe`; handler is the lookup table; **DEFER comment for multi-step stateSchema** |

## Requirements

- **Functional:** 8 wrapper files, each exporting a workflow instance via `createLoopWorkflow`. `workflows-manifest.json` lists 8 entries `{ file, export }` matching the wrapper filenames.
- **Non-functional:** no behavior change vs the legacy handlers. Direct unit parity tests prove equivalence.

## Architecture

```
tools/learning-loop-mastra/workflows/workflow-intake-orient.js  (moved in Phase 1; rewritten in Phase 3)
  ├── import: createLoopWorkflow from "../create-loop-workflow.js"
  ├── import: legacy handler logic (kept inline; same as current workflow-intake-orient.js body)
  ├── handler: loadOrientation(args) { ... }  // same logic as today's handler
  └── export: workflowIntakeOrient = createLoopWorkflow({
                   id: "workflow_intake_orient",
                   description: "Orients the agent by reading records/*/index, ...",
                   inputSchema: { root: z.string().optional(), category: z.string().optional(), capability_scope: z.string().optional() },
                   steps: [{ id: "load-orientation", inputSchema: {...same...}, outputSchema: {...result shape...}, handler: loadOrientation }],
                 });

workflows-manifest.json
  [
    { "file": "workflows/workflow-intake-orient.js", "export": "workflowIntakeOrient" },
    { "file": "workflows/workflow-intake-plan.js", "export": "workflowIntakePlan" },
    { "file": "workflows/workflow-classify-prompt.js", "export": "workflowClassifyPrompt" },
    { "file": "workflows/workflow-prepare-runtime-request.js", "export": "workflowPrepareRuntimeRequest" },
    { "file": "workflows/workflow-self-improvement.js", "export": "workflowSelfImprovement" },
    { "file": "workflows/workflow-intentional-skip.js", "export": "workflowIntentionalSkip" },
    { "file": "workflows/workflow-report-phase-status.js", "export": "workflowReportPhaseStatus" },
    { "file": "workflows/workflow-runtime-probe.js", "export": "workflowRuntimeProbe" },
  ]
```

## Related Code Files

- **Modify (8 files):** each file in `tools/learning-loop-mastra/workflows/workflow-*.js` (already moved in Phase 1) — add the `createLoopWorkflow` wrapper call at the bottom of the file.
- **Create:** `tools/learning-loop-mastra/workflows-manifest.json` (8-entry array).
- **Create:** `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js` (8 direct unit parity tests, no MCP).

## Implementation Steps

1. **Write 8 direct unit parity tests (RED).** Test pattern (per workflow):
   ```js
   test("workflow-intake-orient: direct parity matches legacy handler", async () => {
     const { workflowIntakeOrient } = await import("../workflows/workflow-intake-orient.js");
     const { workflowIntakeOrientTool } = await import("#mcp/tools/workflow-intake-orient-tool.js");
     const args = { /* realistic args */ };
     const legacyResult = await workflowIntakeOrientTool.handler(args);
     const run = await workflowIntakeOrient.createRun();
     const started = await run.start({ inputData: args });
     assert.equal(started.status, "success");
     // Deep-equal where structurally comparable; tolerant of timestamp/metadata fields.
     assert.deepEqual(started.result, legacyResult);
   });
   ```
   - Test 1: `workflow-intake-orient` (with `root: <test fixture root>`)
   - Test 2: `workflow-intake-plan` (with `orient_result: <fixture>`)
   - Test 3: `workflow-classify-prompt` (with `prompt: "fix the auth flow"`)
   - Test 4: `workflow-prepare-runtime-request` (with 7 string/bool fields)
   - Test 5: `workflow-self-improvement` (with `improvement_type: "schema-change"`)
   - Test 6: `workflow-intentional-skip` (with `assertion_id`, `skip_reason`, `scope`)
   - Test 7: `workflow-report-phase-status` (with numeric counts + result enum)
   - Test 8: `workflow-runtime-probe` (with `stack: "nodejs"`, `probe_type: "test"`)

2. **Run tests, confirm 8 RED.** `node --test tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js` → 0/8 pass (wrappers don't exist yet).

3. **Write `workflows-manifest.json`** with the 8 entries.

4. **Write 8 wrappers.** Before writing each wrapper's `outputSchema`, **compare the handler return shape to the legacy handler return** to confirm field names and types. The legacy handler returns `{ content: [{ type: "text", text: JSON.stringify(...) }] }`; the factory's `adaptLegacyHandler` strips the envelope, so the step's `outputSchema` describes the inner JSON. Run the legacy handler against a fixture, dump the inner result, and mirror its shape in the Zod `outputSchema`. This avoids Zod parse failures at workflow runtime where a missing field in the step's outputSchema causes the chain to fail.

Per file pattern (showing `workflow-intake-orient.js` as the most complex example):
   ```js
   import { z } from "zod";
   import { createLoopWorkflow } from "../create-loop-workflow.js";
   import { resolveRoot } from "#lib/resolve-root.js";
   import { readRuntimeObservations } from "#mcp/core/file-readers.js";
   import { SURFACES } from "#mcp/core/surfaces.js";  // or wherever SURFACES lives

   async function loadOrientation({ root, category, capability_scope }) {
     const resolvedRoot = resolveRoot(root);
     // ... (same logic as today's handler)
     return { index_entries, meta_triggers, observations, capability_files, missing_decisions };
   }

   export const workflowIntakeOrient = createLoopWorkflow({
     id: "workflow_intake_orient",
     description: "Orients the agent by reading records/*/index, records/*/evidence, records/*/capabilities, and runtime-state.jsonl. Use AT THE START of an intake session to understand current record state.",
     inputSchema: {
       root: z.string().optional().describe("Project root directory (default: auto-detected)"),
       category: z.string().optional().describe("Filter index entries by dimension or capability substring"),
       capability_scope: z.string().optional().describe("Filter capability files by stack or id substring"),
     },
     // Parity-faithful thin stateSchema = input. The factory's stateSchema +
     // suspend/resume surface is ready for cross-step accumulation when a
     // consumer needs it; restructuring is one line at the call site.
     steps: [
       {
         id: "load-orientation",
         description: "Read index, evidence, capabilities, runtime-state",
         inputSchema: {
           root: z.string().optional(),
           category: z.string().optional(),
           capability_scope: z.string().optional(),
         },
         outputSchema: {
           index_entries: z.array(z.any()),
           meta_triggers: z.array(z.string()),
           observations: z.array(z.any()),
           capability_files: z.array(z.string()),
           missing_decisions: z.array(z.string()),
         },
         handler: loadOrientation,
       },
     ],
   });
   ```

   For `self_improvement.js` and `runtime_probe.js`, add the DEFER comment:
   ```js
   // Current handler is single-step. The factory's stateSchema + suspend/resume
   // surface is ready for cross-step accumulation when a consumer (e.g. an agent
   // calling this workflow) needs it; restructuring is one line at the call site.
   ```

5. **Run tests, confirm 8 GREEN.** All direct parity tests pass.

6. **Delete the legacy `tools/learning-loop-mcp/tools/workflow-*-tool.js` files** (the original 8 that were moved to `tools/learning-loop-mastra/workflows/` in Phase 1 and now have the new `createWorkflow` wrapper in place). The `git mv` from Phase 1 already moved them; what remains at the legacy paths is the moved files themselves, which now have stale `_tool.js` extensions and a `tool:create` shape instead of `workflow:create`. **Order matters:** delete AFTER direct parity tests pass, so tests can fall back to the legacy files if the new wrappers fail. Use `git rm`:
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   git rm tools/learning-loop-mcp/tools/workflow-intake-orient-tool.js
   # ... (8 total)
   ```
   (Phase 1's manifest update already removed these entries from the legacy `tools/manifest.json`, so the cold-session test no longer references them.)

7. **Refactor wrappers** if common patterns emerge (e.g., shared `outputSchema` shape for "result object" pattern). **YAGNI:** only refactor if 2+ wrappers share an identical 5+ line block.

## Success Criteria

- [ ] 8 wrapper files export workflows via `createLoopWorkflow`
- [ ] `workflows-manifest.json` has 8 entries matching the wrappers
- [ ] 8 direct unit parity tests pass (`workflow-direct-parity.test.js`)
- [ ] Each wrapper has a comment noting parity-faithful thin `stateSchema` (the 2 deferred wrappers — `self_improvement`, `runtime_probe` — additionally note the cross-step accumulation surface is ready for the consumer that needs it)
- [ ] No behavior change vs legacy handlers (proven by parity tests)

## Risk Assessment

- **Risk:** legacy handler returns `{ content: [{ type: "text", text: JSON.stringify(...) }] }` (MCP envelope) but the factory expects raw output. **Mitigation:** `adaptLegacyHandler` strips the envelope per `tools/learning-loop-mastra/legacy-handler-adapter.js:12-26`. Direct parity test confirms envelope is stripped.
- **Risk:** output schema mismatch between step's `outputSchema` and the handler's actual return shape. **Mitigation:** direct parity test asserts the workflow's final `result` matches the legacy handler return; Zod parsing at the workflow boundary surfaces the mismatch.
- **Risk:** `intake_orient` reads YAML dirs across 5 surfaces + `runtime-state.jsonl`; the test fixture needs a real temp project. **Mitigation:** use `mkdtempSync` to create a temp dir with stub YAML files matching the orient output shape; the test runs against the temp dir.
- **Risk:** `runtime_probe` and `self_improvement` are pure lookup tables but the brainstorm identifies them as future multi-step. Adding DEFER comments prevents accidental future restructuring without operator awareness.

## Security Considerations

None. The wrappers are deterministic handlers; no new attack surface. Same trust boundary as the legacy implementations.

## Next Steps

Phase 4 un-skips the 8 entries in `server.js`, removes them from `tools/manifest.json`, and wires the new `workflows-manifest.json` into the server's registration loop. Phase 5 writes the MCP-level parity harness (8 `run_<key>` calls).