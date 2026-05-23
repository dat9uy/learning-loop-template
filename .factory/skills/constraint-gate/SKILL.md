---
name: constraint-gate
description: Enforce constraint observation-before-workaround discipline. Check if commands are gated, record constraint observations.
user-invocable: false
---

# Constraint Gate

MCP server that enforces "observe before workaround" for constraint discovery. Exposes two tools:

## Tools

### `check_gate(command?, file_path?, context?)`

Check if a command or file path is allowed by constraint patterns. At least one of `command` or `file_path` must be provided.

**Constraint check (`command`):**
- `{ decision: "ok" }` — command is allowed
- `{ decision: "block", observation_required: true }` — constraint detected, no observation recorded yet
- `{ decision: "escalate" }` — budget exhausted or validation window active

Constraint patterns: `docker`, `sudo`, `package-manager` (pip/npm/yarn/pnpm install/add), `vendor-api` (curl ... api)

**Write-path check (`file_path`):**
- `{ decision: "ok" }` — path is allowed (no observation needed for `records/claims/**`, `docs/**`, etc.)
- `{ decision: "block", observation_required: true }` — path is `records/evidence/**` with no active `write-path` observation
- `{ decision: "escalate", inbound_gate: true }` — observation exists but is stale relative to last operator message
- `{ decision: "block", hard_block: true }` — path is `records/observations/**` (unconditional)

When both `command` and `file_path` are provided, constraint result takes priority if both fail.

### `record_observation(constraint_type, constraint, description, source_refs?)`

Record a constraint observation as a YAML file in `records/observations/`. Returns:
- `{ recorded: true, id, path }` — observation created
- `{ recorded: false, reason: "already_exists", existing_id }` — duplicate

**Example — write-path observation for evidence files:**

```json
{
  "constraint_type": "write-path",
  "constraint": "records-evidence",
  "description": "Operator approved evidence file creation"
}
```

## Usage

The constraint gate is registered as an MCP server in `.mcp.json`. Claude Code discovers it automatically.

For hook-based enforcement (pre-tool gating), see `.factory/coordination/hooks/` (and `.claude/coordination/hooks/`).

## Files

- `tools/coordination-gate/mcp/server.js` — MCP server entry
- `tools/coordination-gate/mcp/gate-logic.js` — pure decision logic
- `tools/coordination-gate/mcp/file-readers.js` — config/observation/budget readers
- `tools/coordination-gate/mcp/observation-writer.js` — observation file writer
- `records/observations/` — observation YAML files
