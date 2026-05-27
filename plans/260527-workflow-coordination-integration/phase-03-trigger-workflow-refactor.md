---
phase: 3
title: "Trigger Workflow Refactor"
status: pending
priority: P1
effort: "2h"
dependencies: [1]
---

# Phase 3: Trigger Workflow Refactor

## Overview

Refactor `workflow_trigger` MCP tool to replace child-process spawning with either internal MCP tool chaining or returning a tool list. Rename to `workflow_run_validation` (keep old name as alias if needed) and make it a convenience wrapper for the validation chain.

## Requirements

- **Functional:** Given a workflow name, either internally call the validation chain (`index_validate` → `index_extract`) or return the exact tool list for the agent to call.
- **Non-functional:** No child process spawning; simpler than the original; integrates cleanly with agent-intentional model.

## Architecture Decision: Return Tool List (Not Execute Internally)

**Chosen approach:** Return the tool list and let the agent call them. Reasons:
1. MCP tools calling other MCP tools internally creates circular dependency risk.
2. Agent visibility — the agent sees each tool call in its reasoning trace.
3. Simpler implementation — no internal client wiring needed.
4. Consistent with `workflow_notify_artifact` returning recommendations.

Alternative (execute internally) rejected: requires instantiating MCP client inside the tool, adds complexity, hides execution from agent.

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/tools/trigger-workflow-tool.js`
- **Create:** `tools/learning-loop-mcp/tools/trigger-workflow-tool.test.js`
- **Read:** `tools/learning-loop-mcp/core/workflow-registry.js` (Phase 1)
- **Read:** `tools/learning-loop-mcp/agent-manifest.json` (update description)

## Implementation Steps

1. **Remove `workflow-runner.js` imports:**
   - Delete `import { triggerWorkflow } from "../workflow-runner.js";`
   - Delete all `spawn`-related logic.

2. **Add registry import:**
   ```js
   import { WORKFLOW_REGISTRY } from "#mcp/core/workflow-registry.js";
   ```

3. **Refactor handler:**
   ```js
   handler: async ({ name }) => {
     const def = WORKFLOW_REGISTRY[name];
     if (!def) {
       return {
         content: [{ type: "text", text: JSON.stringify({ triggered: false, reason: "not_found" }) }],
       };
     }

     const result = {
       triggered: true,
       workflow: name,
       recommended_tools: def.recommended_tools,
       reasoning: `Workflow "${name}" maps to: ${def.recommended_tools.join(", ")}`,
     };

     return {
       content: [{ type: "text", text: JSON.stringify(result) }],
     };
   }
   ```

4. **Rename in manifest (optional, keep backward compat):**
   - Add `workflow_run_validation` as an alias or rename `workflow_trigger` → `workflow_run_validation`.
   - If renaming: update `agent-manifest.json`, both skill files, and any references.
   - If keeping name: update description to clarify it returns recommendations.

5. **Update tool description:**
   ```json
   {
     "name": "workflow_trigger",
     "description": "Trigger a workflow by name. Returns the recommended MCP tool sequence. Does NOT spawn processes — the agent calls the tools explicitly."
   }
   ```

6. **Write unit tests (TDD):**
   - Test known workflow returns correct `recommended_tools`.
   - Test unknown workflow returns `triggered: false, reason: "not_found"`.
   - Verify no `spawn` calls.

## Tests

```js
// trigger-workflow-tool.test.js
import { describe, it } from "node:test";
import assert from "node:assert";
import { workflowTriggerTool } from "./trigger-workflow-tool.js";

const { handler } = workflowTriggerTool;

describe("workflow_trigger", () => {
  it("returns tool list for evidence-changed", async () => {
    const result = await handler({ name: "evidence-changed" });
    const parsed = JSON.parse(result.content[0].text);

    assert.strictEqual(parsed.triggered, true);
    assert.deepStrictEqual(parsed.recommended_tools, ["index_extract", "index_validate"]);
    assert.ok(parsed.reasoning.includes("evidence-changed"));
  });

  it("returns not_found for unknown workflow", async () => {
    const result = await handler({ name: "nonexistent" });
    const parsed = JSON.parse(result.content[0].text);

    assert.strictEqual(parsed.triggered, false);
    assert.strictEqual(parsed.reason, "not_found");
  });
});
```

## Success Criteria

- [ ] `trigger-workflow-tool.js` no longer imports `workflow-runner.js`.
- [ ] Handler returns `recommended_tools` array for known workflows.
- [ ] Unknown workflows return `triggered: false, reason: "not_found"`.
- [ ] No `spawn` or child-process calls remain.
- [ ] `trigger-workflow-tool.test.js` passes.
- [ ] `agent-manifest.json` description updated.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Agent confusion: old behavior was "run it for me" | Medium | Description clearly states "returns recommendations"; skill docs reinforce agent-intentional model. |
| Rename breaks existing agent training | Low | If renaming to `workflow_run_validation`, add alias or keep old name with updated behavior. |
