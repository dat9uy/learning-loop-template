# CLAUDE.md — Learning Loop Template

See `AGENTS.md` for the full coordination system reference (hooks, MCP tools, gate protocols, and implementation workflows). Both Claude Code and Droid CLI share the same rules via universal hooks in `tools/learning-loop-mcp/hooks/`.

Quick reference:
- **MCP server:** `tools/learning-loop-mcp/server.js` — 35 tools
- **Hooks:** `tools/learning-loop-mcp/hooks/{bash,write,inbound}-gate.js`
- **Core logic:** `tools/learning-loop-mcp/core/` — single source of truth
- **Preflight:** use `gate_mark_preflight` MCP tool to unlock `product/**` writes
- **Records:** all `records/**` writes go through MCP tools; direct file writes are blocked
- **Gate response mode:** `warn` (default) or `escalate` via `GATE_RESPONSE_MODE` env var
