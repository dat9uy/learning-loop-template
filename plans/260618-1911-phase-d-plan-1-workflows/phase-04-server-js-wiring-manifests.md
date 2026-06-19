---
phase: 4
title: "server.js wiring + manifests"
status: completed
priority: P1
effort: "1h"
dependencies: ["3"]
---

# Phase 4: server.js wiring + manifests

## Overview

Wire `tools/learning-loop-mastra/workflows-manifest.json` into `server.js`, un-skip the 8 workflow entries from Phase 1's skip set, remove the 8 entries from `tools/learning-loop-mastra/tools/manifest.json` (they no longer live in that namespace), and update `agent-manifest.json` workflow group paths. After this phase, the mastra server registers 31 `mastra_*` createTool tools (28 deterministic + 3 stay-as-createTool workflow) + 8 `run_<key>` createWorkflow tools = 39 total.

## Why a dedicated phase

The wiring change has 3 blast-radius pieces: (1) `server.js` registration loop, (2) `tools/manifest.json` (the deterministic tool manifest), (3) `agent-manifest.json` (the grouped tool surface manifest). All three must change in lockstep or downstream tools (`loop_describe`, cold-session E2E) report inconsistent tool counts. A dedicated phase makes the lockstep change reviewable as one commit.

## Requirements

- **Functional:** `server.js` reads `workflows-manifest.json` and registers the 8 workflows via `MCPServer`'s `workflows: { ... }` field. `tools/manifest.json` has 8 fewer entries. `agent-manifest.json` workflow group reflects 11 entries: 8 `run_<key>` + 3 `mastra_*` (the stay-as-tool workflows: `generate_prompt`, `notify_artifact`, `trigger`).
- **Non-functional:** the 3 stay-as-tool workflows (`generate_prompt`, `notify_artifact`, `trigger`) keep their `mastra_*` names and `createTool` wrappers — they are NOT in scope for this plan (per brainstorm Q1 + the operator preference for narrow per-plan scope).

## Architecture

```
server.js (post-Phase 4)
  ├── import: tools/manifest.json → 29 entries (8 removed)
  ├── import: workflows-manifest.json → 8 entries
  ├── for each tool entry → import from `#mcp/<file>`, wrap with createLoopTool, register under `mastra_<name>`
  ├── for each workflow entry → import from `<file>` (relative to mastra/), register under workflows[key] (no prefix)
  └── MCPServer({ tools, workflows, ... })
        ↓
        Tools list response: 31 mastra_* + 8 run_* = 39 (was 39; the 8 in-scope workflows are renamed from mastra_workflow_* to run_workflow_*)
```

**Count math (verified 2026-06-18):**

Pre-Phase 4, the mastra server has 39 tools registered: 28 deterministic `mastra_*` (5 gate + 19 meta_state + 3 introspection + 1 runtime_agnostic) + 11 workflow-related `mastra_*` (8 in-scope workflows + 3 stay-as-createTool: `generate_prompt`, `notify_artifact`, `trigger`). All 39 are imported via `#mcp/<file>` in the legacy style; none of them are Mastra `createTool` wrappers in the schema sense, but the `mastra_` prefix is applied uniformly at the registration site (`server.js`).

Post-Phase 4:
- 28 deterministic `mastra_*` tools (unchanged)
- 3 stay-as-createTool `mastra_workflow_*` (unchanged): `mastra_workflow_generate_prompt`, `mastra_workflow_notify_artifact`, `mastra_workflow_trigger`
- 8 new `run_workflow_*` createWorkflow tools (renamed from `mastra_workflow_*`): the 8 in-scope workflows
- **Total: 39 tools registered by MCPServer** (31 `mastra_*` + 8 `run_*`; no count change, just namespace split)

**`agent-manifest.json` workflow group (post-Phase 4):**
- 8 `run_<key>` entries (new): `run_workflow_intake_orient`, `run_workflow_intake_plan`, `run_workflow_classify_prompt`, `run_workflow_prepare_runtime_request`, `run_workflow_self_improvement`, `run_workflow_intentional_skip`, `run_workflow_report_phase_status`, `run_workflow_runtime_probe`
- 3 `mastra_*` entries (unchanged): `mastra_workflow_generate_prompt`, `mastra_workflow_notify_artifact`, `mastra_workflow_trigger`
- **Total: 11 workflow group entries** (same count as pre-Phase 4; split between `run_*` and `mastra_*` namespaces)

## Related Code Files

- **Modify:** `tools/learning-loop-mastra/server.js` — add `workflows-manifest.json` read + workflow registration loop; remove the Phase 1 `WORKFLOW_FILES` skip set (the 8 entries are no longer in `tools/manifest.json` after this phase).
- **Modify:** `tools/learning-loop-mastra/tools/manifest.json` — remove 8 workflow entries.
- **Modify:** `tools/learning-loop-mastra/agent-manifest.json` — update workflow group entries to use `run_<key>` names for the 8 migrated workflows.

## Implementation Steps

1. **Read current `server.js`** to understand the exact registration loop pattern.

2. **Update `server.js`:**
   - Add `WORKFLOW_MANIFEST` JSON read after `MANIFEST`:
     ```js
     const WORKFLOW_MANIFEST = JSON.parse(
       readFileSync(join(__dirname, "workflows-manifest.json"), "utf8"),
     );
     ```
   - Remove the Phase 1 `WORKFLOW_FILES` skip set (no longer needed; entries no longer in `MANIFEST`).
   - Add workflow registration after the tool loop:
     ```js
     const workflows = {};
     for (const { file, export: exportName } of WORKFLOW_MANIFEST) {
       const mod = await import(`./${file}`);
       const wf = mod[exportName];
       if (!wf) {
         console.error(`skipped ${file} (missing export "${exportName}")`);
         continue;
       }
       workflows[wf.id] = wf;  // object key MUST equal id; MCPServer adds run_ prefix
     }
     ```
   - Update `MCPServer` config to include `workflows`:
     ```js
     const server = new MCPServer({
       id: "learning-loop-mastra",
       name: "learning-loop-mastra",
       version: "0.1.0",
       description: "Mastra-based canonical MCP server for the learning loop (Phase D Plan 1). 37 tools (29 deterministic + 8 workflows) across 5 groups. Single server post-cut-over.",
       tools,
       workflows,
     });
     ```

3. **Update `tools/learning-loop-mastra/tools/manifest.json`** — remove 8 entries:
   - `tools/workflow-intake-orient-tool.js`
   - `tools/workflow-intake-plan-tool.js`
   - `tools/workflow-classify-prompt-tool.js`
   - `tools/workflow-prepare-runtime-request-tool.js`
   - `tools/workflow-self-improvement-tool.js`
   - `tools/workflow-intentional-skip-tool.js`
   - `tools/workflow-report-phase-status-tool.js`
   - `tools/workflow-runtime-probe-tool.js`

4. **Update `tools/learning-loop-mastra/agent-manifest.json`** workflow group:
   - Replace `mastra_workflow_intake_orient` → `run_workflow_intake_orient`
   - Replace `mastra_workflow_intake_plan` → `run_workflow_intake_plan`
   - Replace `mastra_workflow_classify_prompt` → `run_workflow_classify_prompt`
   - Replace `mastra_workflow_prepare_runtime_request` → `run_workflow_prepare_runtime_request`
   - Replace `mastra_workflow_self_improvement` → `run_workflow_self_improvement`
   - Replace `mastra_workflow_intentional_skip` → `run_workflow_intentional_skip`
   - Replace `mastra_workflow_report_phase_status` → `run_workflow_report_phase_status`
   - Replace `mastra_workflow_runtime_probe` → `run_workflow_runtime_probe`
   - Keep: `mastra_workflow_generate_prompt`, `mastra_workflow_notify_artifact`, `mastra_workflow_trigger`
   - **Also update `typical_chain` field** (resolves red team MINOR #7): replace `mastra_workflow_intake_orient` and `mastra_workflow_intake_plan` with their `run_*` names. `mastra_workflow_notify_artifact` (the 3rd chain entry) keeps its `mastra_*` name.

4a. **Update `tools/learning-loop-mcp/agent-manifest.json`** (resolves validation Session 1 finding #1 + red team MINOR #12): this file uses BARE names (`workflow_intake_orient`, NOT `mastra_workflow_intake_orient`) per line 14-22. The 8 in-scope workflows are listed there but no server registers them under those bare names. The `check_runtime_agnostic` tool reads this file at `tools/learning-loop-mcp/core/runtime-agnostic-checklist.js:221-255` to verify new tools are listed. Remove the 8 in-scope workflow names from the workflow group:
   - `workflow_intake_orient`
   - `workflow_intake_plan`
   - `workflow_classify_prompt`
   - `workflow_prepare_runtime_request`
   - `workflow_self_improvement`
   - `workflow_intentional_skip`
   - `workflow_report_phase_status`
   - `workflow_runtime_probe`

   **Keep the 3 stay-as-createTool entries:** `workflow_generate_prompt`, `workflow_notify_artifact`, `workflow_trigger`.

   Post-removal: 3 entries in legacy `agent-manifest.json` workflow group (was 11). The `typical_chain` field at line 27-31 references the bare names `workflow_intake_orient`, `workflow_intake_plan`, `workflow_notify_artifact`. The first 2 must be removed; the 3rd stays. After: `typical_chain` = `["workflow_notify_artifact"]` (or empty array if a single-element chain is invalid; check the introspection tool's parsing at `tools/learning-loop-mcp/tools/loop-describe-tool.js:24`).

4b. **Update `tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js`** (resolves red team BLOCKER #3): the test's `MIGRATED_TOOL_NAMES` array at lines 29-31 references 3 names that change post-Phase-4:
   - `mastra_workflow_intake_plan` → `run_workflow_intake_plan`
   - `mastra_workflow_self_improvement` → `run_workflow_self_improvement`
   - `mastra_workflow_generate_prompt` — UNCHANGED (stays as createTool)
   The per-tool assertions in the rest of the file (which test JSON Schema properties for these tools) must be re-read for any name references and updated. If the test uses `byName.get("mastra_workflow_intake_plan")` to fetch a tool and assert its schema, that lookup must change to `byName.get("run_workflow_intake_plan")`. The schema assertions themselves should be unchanged (workflows expose the same inputSchema as the legacy tools; the rename is the only delta).

5. **Run the existing mastra test suite** to confirm no regressions:
   ```bash
   pnpm test
   ```
   All 10 namespaces must pass. Phase 3's direct parity tests still pass; no tests broken by the wiring change.

6. **Smoke test the server** via the existing `with-mcp-server.js` helper (not a manual `node -e` script). Add a 1-line test in `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs` (Phase 5's harness, but the test count for it goes up by 1 if not already covered):
   ```js
   test("smoke: 31 mastra_* + 8 run_* = 39 total tools", async (t) => {
     const { listTools, cleanup } = await connectMcpServer(SERVER_ENTRY, t.tmpdir());
     t.after(cleanup);
     const tools = await listTools();
     const mastra = tools.filter(t => t.name.startsWith("mastra_"));
     const runWorkflows = tools.filter(t => t.name.startsWith("run_workflow_"));
     assert.equal(mastra.length, 31, "must have 31 mastra_* createTool tools");
     assert.equal(runWorkflows.length, 8, "must have 8 run_workflow_* createWorkflow tools");
     assert.equal(tools.length, 39, "total must be 39");
   });
   ```
   Expected: 39 tools total (31 `mastra_*` + 8 `run_workflow_*`).

## Success Criteria

- [x] `server.js` registers 8 workflows via `MCPServer.workflows` field
- [x] `tools/learning-loop-mastra/manifest.json` has 31 entries (was 39; 8 in-scope removed)
- [x] `agent-manifest.json` workflow group has 11 entries (8 `run_*` + 3 `mastra_*`); `typical_chain` updated
- [x] `tools/learning-loop-mcp/agent-manifest.json` has 3 workflow group entries (was 11; 8 in-scope removed) + `typical_chain` updated to reference only `workflow_notify_artifact`
- [x] `mcp-tools-list-parity.test.js` references updated for the 2 renamed tools
- [x] No remaining `mastra_workflow_intake_orient|intake_plan|classify_prompt|prepare_runtime_request|self_improvement|intentional_skip|report_phase_status|runtime_probe` references in any `__tests__/` or source file (except for the 3 stay-as-createTool: `generate_prompt`, `notify_artifact`, `trigger`)
- [x] All 10 test namespaces pass
- [x] Smoke test confirms 39 tools registered (31 `mastra_*` + 8 `run_*`)

## Risk Assessment

- **Risk:** `agent-manifest.json` workflow group is consumed by `loop_describe` and the cold-session E2E test. **Mitigation:** Phase 5's parity harness exercises the live server's `tools/list` response and asserts 8 `run_<key>` entries appear; cold-session test passes if total count matches.
- **Risk:** `tools/manifest.json` removal breaks a test that reads the file directly. **Mitigation:** search for direct file reads in `__tests__/`; if any test reads `tools/manifest.json` expecting 37 entries, update it to 29 in this phase (or the test will fail in `pnpm test`).
- **Risk:** MCPServer rejects empty `workflows` field. **Mitigation:** non-issue; the field has 8 entries. If a future plan needs to clear workflows, set `workflows: undefined` (not `{}`).
- **Risk:** `loop_describe` returns the old workflow group ordering and tools-listeners like VSCode's MCP UI show the workflows as "createTool" type. **Mitigation:** `loop_describe` reads `agent-manifest.json` directly; the rename in step 4 propagates automatically.

## Security Considerations

None. Manifest and config wiring has no security impact; no privilege boundaries crossed.

## Next Steps

Phase 5 writes the MCP-level parity harness (8 `run_<key>` calls via `withMcpServer` helper), proving the live server produces identical output to the legacy handlers.