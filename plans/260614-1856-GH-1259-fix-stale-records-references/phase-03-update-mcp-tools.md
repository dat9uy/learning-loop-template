---
phase: 3
title: "Update MCP tools"
status: completed
priority: P1
effort: "1.5h"
dependencies: [2]
---

# Phase 3: Update MCP tools

## Overview

Update the MCP tools that still reference `records/observations/` or call `readObservations`. Align them with the runtime-state model or remove the stale references entirely. Also remove the stale `observation-changed` workflow trigger.

## Related Code Files

- Modify: `tools/learning-loop-mcp/tools/gate-tool.js`
- Modify: `tools/learning-loop-mcp/tools/notify-artifact-tool.js`
- Modify: `tools/learning-loop-mcp/tools/workflow-intake-orient-tool.js`
- Modify: `tools/learning-loop-mcp/tools/workflow-generate-prompt-tool.js`
- Modify: `tools/learning-loop-mcp/core/workflow-registry.js`

## Implementation Steps

1. `gate-tool.js`:
   - Replace `readObservations(root)` with `readRuntimeObservations(root)`.
   - Keep constraint + write-path checks; they will now evaluate against runtime-state.
2. `notify-artifact-tool.js`:
   - Remove the stale observation staleness check. The tool's primary job is workflow trigger recommendations; the stale observation escalation is dead code because `readObservations` always returns `[]`.
3. `workflow-intake-orient-tool.js`:
   - Update description to stop mentioning `records/observations`.
   - Replace `loadYamlDir(root, "records/observations")` with a runtime-state read via `readRuntimeObservations`. Return the observation-shaped objects in the `observations` field so consumers that depend on the field shape are not broken.
4. `workflow-generate-prompt-tool.js`:
   - Remove `records/observations/${system}-resource-budget.yaml` from `requiredRecords`.
   - If the state-gated blueprint needs budget context, reference `runtime_state_read` instead.
5. `workflow-registry.js`:
   - Remove the `observation-changed` workflow trigger (or redirect it to `runtime-state.jsonl` changes if a file-watch mechanism exists). Since `records/observations/` is empty and write-blocked, the trigger is dead code.

## Success Criteria

- [ ] No MCP tool imports or calls `readObservations`.
- [ ] No MCP tool description references `records/observations/`.
- [ ] `workflow-intake-orient-tool.js` returns consistent data without reading the empty observation directory.
- [ ] `gate-tool.js` still returns `ok/block/escalate` decisions.
- [ ] `workflow-registry.js` no longer triggers on `records/observations/**`.
