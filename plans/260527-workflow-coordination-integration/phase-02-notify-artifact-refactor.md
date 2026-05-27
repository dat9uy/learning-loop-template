---
phase: 2
title: "Notify Artifact Refactor"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Notify Artifact Refactor

## Overview

Refactor `workflow_notify_artifact` MCP tool to replace child-process spawning with registry evaluation that returns structured recommendations. Tool name stays the same for backward compatibility.

## Requirements

- **Functional:** Given `path` + `change_type`, return `matched_workflows`, `recommended_next_tools`, and `reasoning`. No child process spawning.
- **Non-functional:** Backward-compatible tool name; zero external dependency changes.

## Architecture

```
notify-artifact-tool.js (refactored)
  ├── handler({ path, change_type })
  │   ├── call evaluateTriggers(path, change_type)  ← workflow-registry.js
  │   ├── build reasoning string
  │   └── return { logged, matched_workflows, recommended_next_tools, reasoning }
```

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/tools/notify-artifact-tool.js`
- **Create:** `tools/learning-loop-mcp/tools/notify-artifact-tool.test.js`
- **Read:** `tools/learning-loop-mcp/core/workflow-registry.js` (new, from Phase 1)
- **Delete (conceptual):** All `triggerWorkflow` and `evaluateWorkflows` imports from `workflow-runner.js`

## Implementation Steps

1. **Remove `workflow-runner.js` imports:**
   - Delete `import { evaluateWorkflows, triggerWorkflow } from "../workflow-runner.js";`
   - Delete the `for (const t of validTriggered) { triggerWorkflow(...) }` fire-and-forget loop.

2. **Add registry import:**
   ```js
   import { evaluateTriggers } from "#mcp/core/workflow-registry.js";
   ```

3. **Refactor handler body:**
   ```js
   handler: async ({ path, change_type }) => {
     const root = resolveRoot();
     const marker = readLastOperatorMessage(root);

     const { matched, recommendations } = evaluateTriggers(path, change_type);

     const logEntry = {
       timestamp: new Date().toISOString(),
       tool: "workflow_notify_artifact",
       path,
       change_type,
       state_change_detected: !!marker,
       matched_workflows: matched,
       recommended_tools: recommendations,
     };

     appendGateLog(root, logEntry);

     const reasoning = matched.length > 0
       ? `${matched.join(", ")} workflow${matched.length > 1 ? "s" : ""} matched; ` +
         `recommended: ${recommendations.join(", ")}`
       : "No matching workflows for this path.";

     const result = {
       logged: true,
       matched_workflows: matched,
       recommended_next_tools: recommendations,
       reasoning,
     };

     return {
       content: [{ type: "text", text: JSON.stringify(result) }],
     };
   }
   ```

4. **Update tool description in `agent-manifest.json`:**
   ```json
   {
     "name": "workflow_notify_artifact",
     "description": "Notify that an artifact file has changed. Returns recommended MCP tools to call next based on registry triggers. Does NOT spawn processes."
   }
   ```

5. **Write unit tests (TDD):**
   - Mock `evaluateTriggers` and verify the handler returns correct JSON.
   - Verify no `spawn` calls occur.
   - Verify log entry includes `matched_workflows` and `recommended_tools`.

## Tests

```js
// notify-artifact-tool.test.js
import { describe, it, mock } from "node:test";
import assert from "node:assert";
import { workflowNotifyArtifactTool } from "./notify-artifact-tool.js";

const { handler } = workflowNotifyArtifactTool;

describe("workflow_notify_artifact", () => {
  it("returns recommendations without spawning", async () => {
    const result = await handler({ path: "records/product/evidence/foo.md", change_type: "updated" });
    const text = result.content[0].text;
    const parsed = JSON.parse(text);

    assert.strictEqual(parsed.logged, true);
    assert.ok(Array.isArray(parsed.matched_workflows));
    assert.ok(Array.isArray(parsed.recommended_next_tools));
    assert.ok(parsed.recommended_next_tools.includes("index_validate"));
    assert.ok(parsed.reasoning);
  });

  it("returns empty for unmatched paths", async () => {
    const result = await handler({ path: "docs/journals/foo.md", change_type: "updated" });
    const parsed = JSON.parse(result.content[0].text);

    assert.deepStrictEqual(parsed.matched_workflows, []);
    assert.deepStrictEqual(parsed.recommended_next_tools, []);
    assert.ok(parsed.reasoning.includes("No matching"));
  });
});
```

## Success Criteria

- [ ] `notify-artifact-tool.js` no longer imports `workflow-runner.js`.
- [ ] Handler returns structured JSON with `matched_workflows`, `recommended_next_tools`, `reasoning`.
- [ ] No `spawn` or child-process calls remain in the tool.
- [ ] `notify-artifact-tool.test.js` passes.
- [ ] `agent-manifest.json` description updated.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Backward-compat break | Medium | Tool name unchanged; return shape is additive (old code ignored `triggered_workflows`). |
| Agent ignores recommendations | Medium | Skill docs + gate advisory messages reinforce; pre-commit is safety net. |
| Log format change | Low | `workflow-log.jsonl` now logs recommendations instead of PIDs — acceptable. |
