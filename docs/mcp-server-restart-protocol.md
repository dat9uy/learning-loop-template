# MCP Server Restart Protocol

The learning-loop-mastra MCP server (`tools/learning-loop-mastra/mastra/server.js`) is a long-lived stdio child process. It does a one-shot import of all tool modules at startup and holds the handlers in memory for the life of the process. Editing a tool file has zero effect on a live server.

This document covers the canonical path for picking up code changes: a full process restart.

## Symptom

You edited a file under `tools/learning-loop-mastra/tools/` and the change does not take effect. Concretely:

- `node --test` direct imports pass, but the MCP surface returns stale behavior
- An MCP tool returns an error that the source code no longer contains
- A `meta_state_check_grounding` call on a finding whose `evidence_code_ref` points to your edit reports `drifted: hash_mismatch` even though the edit was correct (this is the symptom that should be expected; refresh the fingerprint, do not restart)

## Canonical path: full process restart

Kill the running server process and let the orchestrator (Claude Code / Droid CLI) respawn it from `.mcp.json`. The restart cost is ~1s.

```bash
# Find the server PID
pgrep -f "tools/learning-loop-mastra/mastra/server.js"

# Kill it
kill <pid>

# The orchestrator respawns on the next tool call. If it shows "Not connected",
# close and reopen the session.
```

There should normally be exactly one server process. If `pgrep` returns more than one, you have duplicate processes from prior session drift; kill all of them and let the orchestrator respawn a single one.

## When to restart vs. refresh a fingerprint

| Symptom | Action |
|---|---|
| Edited a tool file, want new behavior via MCP | Full restart |
| Edited `server.js` itself or `tools/manifest.json` | Full restart |
| Edited `core/*.js` modules that the tools import | Full restart |
| MCP shows "Not connected" | Check the process list; if no server is running, restart the session |
| Test fails with `hash_mismatch` on a finding whose evidence file you just edited | `meta_state_refresh_fingerprint` (separate concern; see "Drift" below) |

## Drift after edits

`server.js` and core modules have `evidence_code_ref` pointing at them from various findings. After editing these files, `meta_state_check_grounding` will report `drifted: hash_mismatch` for those findings. This is expected — the drift is real. Refresh the fingerprints via `meta_state_refresh_fingerprint` (per finding) or `meta_state_refresh_fingerprint` with the broader sweep if you have a script for it.

Do not interpret the drift as a regression in the changed code. The drift is in the *recorded* fingerprint, not the code.

## History

The previous in-process reload path (`meta_state_refresh_tools` + `core/mcp-server-reload.js`) was removed after Plan 3 cut-over. The reload tool targeted legacy `@modelcontextprotocol/sdk` internals (`_registeredTools`, `setToolRequestHandlers`, `sendToolListChanged`) that have no analog in Mastra's `MCPServer` SDK. Even with a `globalThis.__loopMcpServer` binding, the body could not work. Operator restart via the orchestrator (~1s) is the canonical path; an in-process reload is not needed at this layer.

## Related

- Finding: `meta-260609T1028Z-mcp-server-tools-learning-loop-mcp-server-js-does-a-one-shot` (subtype: `mcp-server-stale-code`, category: `loop-anti-pattern`)
- Server entry: `tools/learning-loop-mastra/mastra/server.js`
