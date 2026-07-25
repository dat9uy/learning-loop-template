---
phase: 3
title: "CLI registration + MCP opt-out + drift-test reclassification"
status: pending
priority: P1
effort: "0.5d"
dependencies: [2]
---

# Phase 3: CLI registration + MCP opt-out + drift-test reclassification

## Overview

Switch the 6 tools from the workflow registration path to the manifest registration path: add the 6 handler modules to `tools/manifest.json`, add the 6 names to `CLI_WRITE_TOOLS`, remove the 6 from `workflows-manifest.json`, and delete the 6 `mastra/workflows/workflow-<x>.js` files (their logic lives in the handlers now). The existing `server.js:71` `RECORDS_VIA_CLI && CLI_TOOLS.has(...)` opt-out then drops `mastra_workflow_<x>` from `.claude`'s MCP automatically — Sec-F9 dissolves because the tools never reach `convertWorkflowsToTools`. The drift test reclassifies the 6 `MCP_RESIDUE` (`deferred-rehoming`) → `CLI_TOOLS`.

## Requirements

- Functional: `bin/loop.mjs workflow_<x> '<json>'` dispatches all 6 for `.claude`; the 6 are absent from `.claude`'s MCP surface under `LOOP_RECORDS_VIA_CLI=1`; no `convertWorkflowsToTools` opt-out branch was added; `workflows-manifest.json` lists only the 2 storage workflows; the 6 `mastra/workflows/workflow-<x>.js` files are deleted.
- Non-functional: the drift test stays green (the 6 now in `CLI_TOOLS`, the 2 storage still in `MCP_RESIDUE`); the workflow blind-spot assertion still fires on an unclassified `run_workflow_*` addition; `CLI_WRITE_TOOLS` widening is documented with a comment.

## Architecture

- `tools/manifest.json`: add 6 entries `{ "file": "tools/workflow-<x>-tool.js", "export": "<camelCase>Tool", "pathFields": [] }` (the manifest-loader rewrite resolves `tools/<name>-tool.js` → `tools/handlers/<name>-tool.js`, same as the 3 existing helpers).
- `core/cli-tools.js`: add the 6 `workflow_<x>` names to `CLI_WRITE_TOOLS` with a comment grouping them as stateless pure-transform workflow helpers (NOT record writes — clarifies the `CLI_WRITE_TOOLS` name).
- `mastra/workflows-manifest.json`: remove the 6 entries; keep the 2 `workflow_storage_*`.
- `mastra/workflows/workflow-<x>.js` (6): delete. The Phase-2 parity test (`workflow-unwrap-parity.test.js`) reads oracle FIXTURES captured in Phase 1 probe 3 (`__tests__/fixtures/workflow-oracles/<x>.json`) — NOT the live workflow objects — so deleting the workflow files here does not break the parity test. (Phase 1 probe 3 captures schema + behavior oracles for both envelope forms; Phase 2's test reads those fixtures.)
- `__tests__/cli-write-tool-set-drift.test.js`: remove the 6 `["run_workflow_<x>", "deferred-rehoming"]` entries from `MCP_RESIDUE`. The workflow blind-spot assertion (`readWorkflowToolNames`) now yields only the 2 storage `run_*` — both stay in `MCP_RESIDUE` (`server-state`), still covered.
- `__tests__/cli-mcp-subset-registration.test.js` + `__tests__/cli-write-tool-set.test.js`: update any hardcoded set that asserts the MCP surface composition (the 6 leave MCP for `.claude`). Drift-test guardrail catches any miss.

## Related Code Files

- Modify: `tools/learning-loop-mastra/tools/manifest.json` (add 6 entries)
- Modify: `tools/learning-loop-mastra/core/cli-tools.js` (add 6 to `CLI_WRITE_TOOLS`)
- Modify: `tools/learning-loop-mastra/mastra/workflows-manifest.json` (remove 6)
- Modify: `tools/learning-loop-mastra/__tests__/cli-write-tool-set-drift.test.js` (reclassify 6)
- Modify: `tools/learning-loop-mastra/__tests__/helpers/manifest-constants.cjs` (`TOOLS_MANIFEST_ENTRIES` 36→42 — the ONE centralized edit point for 4 consumer tests; `WORKFLOW_GROUP_TOOLS` stays 11)
- Modify: `tools/learning-loop-mastra/__tests__/manifest-arithmetic.test.cjs` (`workflows.length` 8→2 at line 49; the `tools.length` assertion uses `TOOLS_MANIFEST_ENTRIES` so it auto-updates)
- Modify: `tools/learning-loop-mastra/__tests__/cli-mcp-subset-registration.test.js` (lines 77,133: `37`→43; line 136: `37 - CLI_TOOLS.size`→`43 - CLI_TOOLS.size`)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/tool-deletion-coverage.test.js` (line 50: `manifest.length` 36→42; line 118 `run_${tool}` membership is a Phase 4 rename, NOT Phase 3 — agent-manifest is untouched in Phase 3)
- Modify: `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs` (retire the 6 portable `callTool("run_workflow_<x>")` cases at lines 57,63,70,84,95,106,116 — superseded by `workflow-unwrap-parity.test.js`, the 6 are no longer workflows; recompute the count assertions at lines 130-132: `mastra` 37→43, `run_workflow` 8→2, `total` 48 stays; keep the 2 storage cases)
- Modify: `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js` (retire the 13 cases that `import("../mastra/workflows/workflow-<x>.js")` + `createRun().start()` for the 6 portable — superseded by `workflow-unwrap-parity.test.js`; keep any storage-only cases. MUST land before step 7 deletes the workflow files)
- Modify: `tools/learning-loop-mastra/__tests__/cli-write-tool-set.test.js` (if it hardcodes the MCP surface composition — drift-test guardrail catches misses)
- Delete: `tools/learning-loop-mastra/mastra/workflows/workflow-classify-prompt.js` (+ 5 siblings)
- Read (already created Phase 1): `tools/learning-loop-mastra/__tests__/fixtures/workflow-oracles/<x>.json` (6 oracle snapshots — the sole oracle after the workflow files are deleted)

## Implementation Steps

1. **TDD — extend the drift test FIRST (RED).** In `cli-write-tool-set-drift.test.js`, remove the 6 `deferred-rehoming` entries. The "every workflow tool is in CLI_TOOLS or MCP_RESIDUE" assertion still passes (the 6 are no longer workflow tools). The "every manifest handler-module tool is in CLI_TOOLS or MCP_RESIDUE" assertion goes RED — the 6 new manifest entries are unclassified until step 2. This RED drives steps 2–3.
2. **Register in `tools/manifest.json`.** Add the 6 entries (file/export/pathFields:[]). Confirm `validateToolManifest` passes at boot (pathFields present).
3. **Add to `CLI_WRITE_TOOLS`.** In `core/cli-tools.js`, add the 6 `workflow_<x>` names under the existing `// Workflow helper handlers` comment block, with a sub-comment: "portable-six: stateless pure transforms re-homed from createLoopWorkflow (Option A unwrap); grouped with the workflow helpers, NOT record-surface writes." The drift-test manifest assertion now GREEN.
4. **Remove from `workflows-manifest.json`.** Delete the 6 entries; keep the 2 `workflow_storage_*`. Run the drift-test workflow assertion — it yields the 2 storage `run_*`, both in `MCP_RESIDUE` (`server-state`), GREEN.
5. **Verify the MCP opt-out (Sec-F9 dissolved).** With `LOOP_RECORDS_VIA_CLI=1`, spawn the `.claude` MCP server and `listTools()`; assert `mastra_workflow_classify_prompt`..`mastra_workflow_runtime_probe` are ABSENT and `mastra_workflow_storage_*` are PRESENT. Confirm NO edit to `convertWorkflowsToTools` was made (grep `convertWorkflowsToTools` in `server.js` — unchanged). This is the Sec-F9 dissolution proof.
6. **Verify CLI dispatch.** `LOOP_SURFACE=.claude node bin/loop.mjs workflow_classify_prompt '{"prompt":"evidence verified finding"}'` → returns `{category:"evidence",...}`. Repeat smoke for the other 5 with a representative arg each. Add a CLI dispatch test (`__tests__/cli-workflow-dispatch.test.js`) that runs all 6 via `bin/loop.mjs` and asserts outputs match the Phase-2 oracle fixtures.
7. **Retire the obsolete workflow-path tests BEFORE deleting the workflow files.** `workflow-direct-parity.test.js` (13 cases `import("../mastra/workflows/workflow-<x>.js")` + `createRun().start()`) and the 6 portable cases in `workflow-parity.test.cjs` (7 `callTool("run_workflow_<x>")`) test the 6 AS WORKFLOWS — after unwrap they are manifest handlers, not workflows, and `workflow-unwrap-parity.test.js` supersedes their behavior coverage. Retire those cases (keep any storage-only cases in both files). This MUST land before step 8 deletes the workflow files, else `workflow-direct-parity.test.js` breaks at import (`ERR_MODULE_NOT_FOUND`). Recompute `workflow-parity.test.cjs` count assertions (lines 130-132: `mastra` 37→43, `run_workflow` 8→2, `total` 48 stays). (Validation may instead choose to MIGRATE these cases to the handler path — see O-Q4.)
8. **Delete the 6 workflow files.** `rm mastra/workflows/workflow-{classify-prompt,prepare-runtime-request,self-improvement,intentional-skip,report-phase-status,runtime-probe}.js`. The parity test reads oracle fixtures (captured Phase 1 probe 3), not the workflow objects — confirm it stays GREEN. The deleted paths drop out of the file index on the next seed (do not `meta_state_refresh_file_index` on deleted paths).
9. **Update the count-assertion test files (atomic with the registration switch).** The registration switch (steps 2+4) changes manifest/workflow counts; these tests break the moment steps 2+4 land, so their count updates MUST be in the SAME commit: `manifest-constants.cjs` (`TOOLS_MANIFEST_ENTRIES` 36→42), `manifest-arithmetic.test.cjs` (`workflows.length` 8→2), `cli-mcp-subset-registration.test.js` (lines 77,133: 37→43; line 136: `43 - CLI_TOOLS.size`), `tool-deletion-coverage.test.js:50` (`manifest.length` 36→42), `workflow-parity.test.cjs` counts (step 7). Let the drift-test guardrail catch any miss; run all green.
10. **Cutover atomicity (red-team Medium).** Steps 2+3+4+7+9 MUST land as a SINGLE atomic commit. During steps 2-4 the 6 are simultaneously in `tools/manifest.json` (registered as `mastra_workflow_<x>` via `server.js:74`) AND `workflows-manifest.json` (registered as `run_workflow_<x>` via `server.js:187`) — a dual surface with no collision warning (the duplicate check at `server.js:188` is on `run_*` only). An operator spawning the MCP server in that window sees both names. A split commit also leaves the count-assertion tests RED in the intermediate state. Single commit = consistent surface + green tests.

## Success Criteria

- [ ] 6 entries in `tools/manifest.json` with `pathFields: []`; 6 names in `CLI_WRITE_TOOLS` with the clarifying comment.
- [ ] `workflows-manifest.json` lists only the 2 `workflow_storage_*`; the 6 `mastra/workflows/workflow-<x>.js` files are deleted.
- [ ] `bin/loop.mjs workflow_<x>` dispatches all 6 (dispatch test green, outputs match oracle fixtures).
- [ ] `.claude` MCP surface (under `LOOP_RECORDS_VIA_CLI=1`) excludes the 6 `mastra_workflow_<x>` and includes the 2 `mastra_workflow_storage_*`; `convertWorkflowsToTools` in `server.js` is UNCHANGED (Sec-F9 dissolved by removal, no parallel branch added).
- [ ] `cli-write-tool-set-drift.test.js` GREEN: the 6 absent from `MCP_RESIDUE`, present via `CLI_TOOLS`; workflow blind-spot assertion covers the 2 storage; reason-tag discipline intact.
- [ ] Obsolete workflow-path cases retired: `workflow-direct-parity.test.js` 13 cases + `workflow-parity.test.cjs` 6 portable cases removed (superseded by `workflow-unwrap-parity.test.js`); storage-only cases kept.
- [ ] Count-assertion test files updated atomic with the registration switch (single commit): `manifest-constants.cjs` (36→42), `manifest-arithmetic.test.cjs` (8→2), `cli-mcp-subset-registration.test.js` (37→43), `tool-deletion-coverage.test.js:50` (36→42), `workflow-parity.test.cjs` counts (37→43 / 8→2 / 48).
- [ ] `pnpm test` green across all namespaces (incl. `workflow-direct-parity`, `workflow-parity`, `manifest-arithmetic`, `cli-mcp-subset-registration`, `tool-deletion-coverage`); `check_runtime_agnostic` baseline established on an existing helper (Phase 5 owns the new-handler verification).

## Risk Assessment

- **Oracle fixture staleness.** If the oracle fixture and the handler drift after Phase 3, the parity test could pass against a stale oracle. Mitigation: the fixture is captured in Phase 1 probe 3 from the LIVE workflow; Phase 3 only deletes the workflow files after the parity test reads the fixture; the fixture is reviewed at Phase 1 sign-off.
- **Manifest-loader path resolution.** The new `tools/workflow-<x>-tool.js` entries rely on the `tools/<name>-tool.js` → `tools/handlers/<name>-tool.js` rewrite (`core/manifest-loader.js`). Mitigation: the 3 existing `mastra_workflow_*` helpers use the same rewrite and are green; verify the new entries resolve with a boot-time `validateToolManifest` + a `list` smoke.
- **Drift-test workflow assertion shrinks below "at least one."** After removing 6, `readWorkflowToolNames` yields 2 (storage) — the `assert.ok(workflowToolNames.length > 0)` guard still passes. If a future edit removes storage too, the guard would fail; out of scope here.
- **`cli-write-tool-set.test.js` hidden hardcode.** If this test hardcodes the exact `CLI_WRITE_TOOLS` membership and is missed in step 9, it breaks. Mitigation: the drift-test guardrail is the single source of truth; `cli-write-tool-set.test.js` is updated in step 9 and the drift test would have already caught the unclassified entries in step 1.
- **Cutover atomicity (red-team Medium).** Steps 2+3+4+7+9 must be a single commit. A split commit leaves (a) a dual MCP surface (`mastra_workflow_<x>` + `run_workflow_<x>` with no collision warning — `server.js:188` duplicate check is on `run_*` only), and (b) the count-assertion tests RED in the intermediate state (`manifest.length` 36 vs 42, `workflows.length` 8 vs 2). Mitigation: step 10 mandates a single atomic commit; the count-assertion tests fail loudly on any partial landing.
- **Count-assertion test sprawl (red-team Critical).** The registration switch breaks count assertions in 6 test files (see Modify list). Missing any one leaves `pnpm test` RED. Mitigation: Phase 1 step 5 enumerates all 11 caller sites across 4 reference forms; step 9 lists each file + line; the drift-test guardrail catches unclassified MANIFEST entries but NOT count constants, so the enumeration (not the guardrail) is the safety net — re-run the Phase-1 grep at Phase 3 sign-off.
- **`workflow-direct-parity.test.js` import breakage (red-team Critical).** Its 13 cases `import("../mastra/workflows/workflow-<x>.js")` directly; deleting the files in step 8 breaks them at import (`ERR_MODULE_NOT_FOUND`). Mitigation: step 7 retires those cases BEFORE step 8 deletes the files; ordering is load-bearing.
