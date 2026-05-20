---
phase: 3
title: "Expand MCP Server with Workflow Tools"
status: completed
priority: P1
effort: "4h"
dependencies: [2]
---

# Phase 3: Expand MCP Server with Workflow Tools

## Overview

Add `notify_artifact_change` and `trigger_workflow` tools to the constraint-gate MCP server. These enable audit logging and reactive workflows when learning-loop artifacts change.

## Requirements

- Functional: `notify_artifact_change(path, change_type)` logs change to `gate-log.jsonl`
- Functional: `trigger_workflow(name, context)` executes a registered workflow
- Functional: Audit log entries include `path`, `change_type`, `triggered_workflows`, `operator_context`
- Non-functional: Workflows are best-effort async; failure does not block the gate

## Architecture

```
Agent writes artifact
       |
       v
notify_artifact_change(path="records/evidence/xyz.yaml", change_type="updated")
       |
       +--> gate-log.jsonl (append audit entry, rotated at 10 MB)
       +--> evaluate_workflows(path, change_type)
              |
              v
         workflow registry (validated against allowlist)
              |
              v
         trigger_workflow("extract-index", { path })
           spawn with { stdio: "pipe", detached: true }
           logs to .claude/coordination/workflow-log.jsonl
         trigger_workflow("validate-records", {})
           spawn with { stdio: "pipe", detached: true }
           logs to .claude/coordination/workflow-log.jsonl
```

## Related Code Files

- Modify: `tools/constraint-gate/server.js`
- Modify: `tools/constraint-gate/server.test.js`
- Create: `tools/constraint-gate/workflow-runner.js`
- Create: `tools/constraint-gate/workflow-runner.test.js`
- Read for context: `tools/extract-index/extract-index.js`
- Read for context: `tools/validate-records/validate-records.js`

## Implementation Steps

1. **Add `notify_artifact_change` tool** to `server.js`:
   - Params: `path` (string), `change_type` (enum: created, updated, deleted)
   - Read `.last-operator-message` marker; log ONLY `state_change_detected: boolean` (never raw prompt snippets)
   - Re-check staleness: if observation went stale between hook allow and this call, return `{ logged: true, stale_escalation: true, reason }`
   - Append to `gate-log.jsonl` with `tool: "notify_artifact_change"`
   - Evaluate which workflows apply (via `workflow-runner.js`)
   - Return `{ logged: true, triggered_workflows: [...], stale_escalation?: boolean }`
2. **Add `trigger_workflow` tool** to `server.js`:
   - Params: `name` (string), `context` (optional object)
   - Look up workflow in registry
   - Validate command against allowlist (only `node` with path under `tools/`)
   - Spawn workflow with `{ stdio: "pipe", detached: true }` — stdout/stderr piped to workflow log, NOT inherited by MCP transport
   - Return `{ triggered: true, pid: ... }` immediately; workflow runs detached
3. **Create `workflow-runner.js`**:
   - `evaluateWorkflows(path, changeType)` → returns array of workflow names
   - `runWorkflow(name, context, root)` → validates command, spawns with isolated stdio, returns promise
   - Registry loaded from `.claude/coordination/workflows.json`; on parse error, log ERROR and return `{ triggered: false, registry_error: "..." }`
4. **Add log rotation to `appendGateLog`** in `server.js`:
   - Check file size before append; if > 10 MB, rotate to `gate-log-{timestamp}.jsonl`
   - Keep maximum 5 backup files; delete oldest
5. **Add workflow log file** `.claude/coordination/workflow-log.jsonl`:
   - Workflow runner appends stdout/stderr here, NOT to `gate-log.jsonl`
   - Prevents concurrent append corruption of gate-log
6. **Write tests** in `server.test.js` for new tools
7. **Write tests** in `workflow-runner.test.js` for runner logic, allowlist validation, and stdio isolation
8. **Run full test suite**: `pnpm test`

## Success Criteria

- [ ] `notify_artifact_change` logs to `gate-log.jsonl` with correct schema; no raw prompt snippets
- [ ] `notify_artifact_change` re-checks staleness and flags `stale_escalation` if observation went stale after hook allow
- [ ] `trigger_workflow` spawns workflow with `{ stdio: "pipe", detached: true }` — no inherited stdout
- [ ] `trigger_workflow` validates command against allowlist (only `node` under `tools/`)
- [ ] Workflow failure does not crash MCP server
- [ ] `server.test.js` covers both new tools
- [ ] `workflow-runner.test.js` covers registry loading, allowlist validation, and stdio isolation
- [ ] `appendGateLog` rotates at 10 MB, keeps 5 backups
- [ ] Workflow processes log to separate `workflow-log.jsonl`, not `gate-log.jsonl`
- [ ] No regression in existing `check_gate`, `record_observation`, `update_observation` tests

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Workflow spawn overhead | Low | Fire-and-forget; MCP returns immediately |
| Workflow script not found | Low | Return `triggered: false, reason: "not_found"` |
| `gate-log.jsonl` grows unbounded | Medium | Size-based rotation at 10 MB, 5 backups |
| Circular call: workflow triggers MCP write | Low | Workflows run external tools (extract-index), not MCP tools |
| MCP stdio corruption from workflow output | High | All spawns use `{ stdio: "pipe", detached: true }` |
| Concurrent append corrupts gate-log | Medium | Workflow logs go to separate `workflow-log.jsonl` |
| Command injection in registry | High | Allowlist: only `node` with path under `tools/`; no shell |
| Operator PII in audit log | High | Log only `state_change_detected: boolean`, never raw prompt |
| Registry parse error silently disables workflows | Medium | Log ERROR and return `registry_error` to agent |
