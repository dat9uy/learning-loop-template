---
phase: 4
title: "Integration & Config"
status: complete
priority: P2
effort: 30m
dependencies: [1, 3]
---

# Phase 4: Integration & Config

## Overview

Register the MCP server in `.mcp.json`, add npm scripts, add gate logging (separate from pure gate-logic), and verify end-to-end flow.

## Context Links

- settings.json: `.claude/settings.json`
- coordination config: `.claude/coordination/coordination-config.json`
- package.json: `package.json`

## Requirements

**Functional:**
- MCP server registered in `.mcp.json` (project-scoped, shared with team)
- npm script to start server: `pnpm constraint-gate`
- Gate log created at `.claude/coordination/gate-log.jsonl`
- Logging is in server handler (NOT in gate-logic.js — keep gate-logic pure)
- End-to-end test: hook blocks → agent records observation → hook allows

**Non-functional:**
- Server starts on Claude Code session start (via .mcp.json)
- Gate log append-only, no rotation in v1
- Log writes wrapped in try/catch (never block gate decisions)

## Architecture

**MCP registration** via `.mcp.json` (project root, shared with team):
```json
{
  "mcpServers": {
    "constraint-gate": {
      "command": "node",
      "args": ["tools/constraint-gate/server.js"]
    }
  }
}
```

**Alternative:** `claude mcp add --transport stdio --scope project constraint-gate -- node tools/constraint-gate/server.js` (if CLI available).

**Gate logging:** In `server.js` handler, after gate decision is made:
```javascript
try {
  appendFileSync(gateLogPath, JSON.stringify({ timestamp, decision, command, ... }) + '\n');
} catch { /* log failure never blocks gate decision */ }
```

## Related Code Files

- Create: `.mcp.json` (project root)
- Modify: `package.json` (add script)
- Modify: `tools/constraint-gate/server.js` (add logging after gate decision)

## Implementation Steps

1. Create `.mcp.json` in project root with MCP server registration
2. Add `"constraint-gate": "node tools/constraint-gate/server.js"` to package.json scripts
3. Add gate logging to `server.js` handler (after decision, before return):
   - Append JSON line to `.claude/coordination/gate-log.jsonl`
   - Include: timestamp, tool (check_gate/record_observation), decision, command/constraint
   - Wrap in try/catch — log failure never blocks gate decision
4. Write integration test: full flow from hook block to observation to allow
5. Verify MCP server appears in Claude Code tool list

## Success Criteria

- [ ] MCP server registered in `.mcp.json` and starts with Claude Code
- [ ] `check_gate` and `record_observation` tools available to agent as `mcp__constraint-gate__*`
- [ ] Gate log records each decision (append-only JSONL)
- [ ] Log write failures don't block gate decisions
- [ ] End-to-end flow works: block → record → allow

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| .mcp.json format wrong | Check Claude Code docs, test manually |
| MCP server startup latency | Server is lightweight, should start fast |
| Gate log grows unbounded | Pruning deferred to v2, document in operator-guide |
| Log write fails (disk full) | try/catch, never blocks gate decision |

## Regression Gate

```bash
pnpm check
node --test tools/constraint-gate/*.test.js
node .claude/coordination/__tests__/skill-coordination-gate.test.cjs
```
