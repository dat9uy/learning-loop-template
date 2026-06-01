# CLAUDE.md — Learning Loop Template

See `AGENTS.md` for the full coordination system reference (hooks, MCP tools, gate protocols, and implementation workflows). Both Claude Code and Droid CLI share the same rules via universal hooks in `tools/learning-loop-mcp/hooks/`.

Quick reference:
- **MCP server:** `tools/learning-loop-mcp/server.js` — see `tools/manifest.json` for current tool list
- **Hooks:** `tools/learning-loop-mcp/hooks/{bash,write,inbound}-gate.js`
- **Core logic:** `tools/learning-loop-mcp/core/` — single source of truth
- **Discovery:** call `loop_describe({tier: "warm"})` at session start to discover the loop's surface and active rules
- **Preflight:** use `gate_mark_preflight` MCP tool to unlock `product/**` writes
- **Records:** all `records/**` writes go through MCP tools; direct file writes are blocked
- **Gate response mode:** `warn` (default) or `escalate` via `GATE_RESPONSE_MODE` env var
- **Budget check:** before vendor-api commands, call `budget_check`, then `meta_state_report(category="budget-check")` to record reasoning. See `AGENTS.md` for full flow.
