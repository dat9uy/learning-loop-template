---
phase: 4
title: "Workflow Registry and Integration"
status: pending
priority: P2
effort: "3h"
dependencies: [3]
---

# Phase 4: Workflow Registry and Integration

## Overview

Define the workflow registry that maps artifact change types to downstream tool invocations. Wire up `extract-index` and `validate-records` as the first workflows. End-to-end test: evidence write automatically triggers index extraction.

## Requirements

- Functional: Registry file defines workflows with `trigger`, `commands`, `conditions`
- Functional: `evidence-changed` workflow runs `extract-index` then `validate-records`
- Non-functional: Registry is JSON, human-editable, loaded at MCP server startup
- Non-functional: Commands are arrays (e.g., `["node", "tools/extract-index/extract-index.js"]`), not shell strings

## Architecture

```json
{
  "workflows": {
    "evidence-changed": {
      "triggers": ["records/evidence/**"],
      "change_types": ["created", "updated"],
      "commands": [
        ["node", "tools/extract-index/extract-index.js"],
        ["node", "tools/validate-records/validate-records.js"]
      ]
    }
  }
}
```

**Note:** `observation-changed` is NOT defined here because `records/observations/**` is blocked by the hook; the agent cannot Edit/Write observation files. If auto-validation on observation updates is needed, instrument `record_observation` / `update_observation` in `observation-writer.js` to trigger workflows internally.

## Related Code Files

- Create: `.claude/coordination/workflows.json`
- Modify: `tools/constraint-gate/workflow-runner.js`
- Read for context: `tools/extract-index/extract-index.js`
- Read for context: `tools/validate-records/validate-records.js`

## Implementation Steps

1. **Create `workflows.json`** with `evidence-changed` definition only (no `observation-changed`; see note above)
2. **Update `workflow-runner.js`** to read and parse `workflows.json`
3. **Add glob matching** for trigger paths (`records/evidence/**` matches any evidence file)
4. **Validate registry on load**: JSON parse error → log ERROR to `workflow-log.jsonl`, return `{ triggered: false, registry_error: "..." }` to agent (do NOT silently fail-open)
5. **Add command execution** with `spawn` using `{ stdio: "pipe", detached: true }`; stdout/stderr logged to `workflow-log.jsonl` (NOT `gate-log.jsonl`)
6. **End-to-end test**: simulate evidence write, call `notify_artifact_change`, verify `extract-index` is triggered and logs to `workflow-log.jsonl`
7. **Handle failures gracefully**: workflow command exit non-zero → log error to `workflow-log.jsonl`, write `.workflow-failures` marker, do not retry
8. **Acceptance criteria revision**: extract-index is a full-scan batch tool. Auto-trigger runs it; success/failure logged within 60 seconds. Do not guarantee 5-second runtime.

## Success Criteria

- [ ] `workflows.json` exists and is valid JSON
- [ ] Evidence file change triggers `extract-index` automatically; logs success/failure within 60 seconds
- [ ] Evidence file change triggers `validate-records` after extract-index completes
- [ ] Workflow failure is logged to `workflow-log.jsonl` and writes `.workflow-failures` marker
- [ ] Registry parse error logs ERROR and returns `registry_error` to agent (not silent fail-open)
- [ ] `workflow-runner.test.js` tests registry matching, command execution, and allowlist validation

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| extract-index takes long, blocks workflow chain | Medium | Run sequentially but async to MCP; log progress |
| validate-records fails on freshly extracted index | Low | Order matters: extract-index before validate-records |
| Workflow registry syntax error | Medium | Validate JSON on load; log ERROR and return `registry_error` to agent |
| extract-index full-scan is not incremental | Medium | Accept batch behavior; log runtime; consider incremental mode in future |
| Workflow failure silently drops | Medium | Log to `workflow-log.jsonl`; write `.workflow-failures` marker |
