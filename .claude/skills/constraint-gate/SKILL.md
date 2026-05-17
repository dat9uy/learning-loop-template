---
name: constraint-gate
description: Enforce constraint observation-before-workaround discipline. Check if commands are gated, record constraint observations.
user-invocable: false
---

# Constraint Gate

MCP server that enforces "observe before workaround" for constraint discovery. Exposes two tools:

## Tools

### `check_gate(command, context?)`

Check if a command is allowed by constraint patterns. Returns:
- `{ decision: "ok" }` — command is allowed
- `{ decision: "block", observation_required: true }` — constraint detected, no observation recorded yet
- `{ decision: "escalate" }` — budget exhausted or validation window active

Constraint patterns: `docker`, `sudo`, `package-manager` (pip/npm/yarn/pnpm install/add), `vendor-api` (curl ... api)

### `record_observation(constraint_type, constraint, description, source_refs?)`

Record a constraint observation as a YAML file in `records/observations/`. Returns:
- `{ recorded: true, id, path }` — observation created
- `{ recorded: false, reason: "already_exists", existing_id }` — duplicate

## Usage

The constraint gate is registered as an MCP server in `.mcp.json`. Claude Code discovers it automatically.

For hook-based enforcement (pre-tool gating), see `.claude/coordination/hooks/`.

## Files

- `tools/constraint-gate/server.js` — MCP server entry
- `tools/constraint-gate/gate-logic.js` — pure decision logic
- `tools/constraint-gate/file-readers.js` — config/observation/budget readers
- `tools/constraint-gate/observation-writer.js` — observation file writer
- `records/observations/` — observation YAML files
- `.claude/coordination/coordination-config.json` — coordination profiles
