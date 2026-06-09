# MCP Server Restart Protocol

The learning-loop MCP server (`tools/learning-loop-mcp/server.js`) is a long-lived stdio child process. It does a one-shot import of all 52 tool modules at startup and holds the handlers in memory for the life of the process. Editing a tool file has zero effect on a live server.

This document covers how to pick up code changes when the reloader cannot reach the server handle.

## Symptom

You edited a file under `tools/learning-loop-mcp/tools/` and the change does not take effect. Concretely:

- `node --test` direct imports pass, but the MCP surface returns stale behavior
- An MCP tool returns an error that the source code no longer contains
- A `meta_state_check_grounding` call on a finding whose `evidence_code_ref` points to your edit reports `drifted: hash_mismatch` even though the edit was correct (this is the symptom that should be expected; refresh the fingerprint, do not restart)

## Preferred path: in-process reload

Call the `meta_state_refresh_tools` MCP tool. It re-imports the manifest in-process with ESM cache-busting and re-registers the handlers on the live server. No process restart, no orchestrator reconnect.

```text
meta_state_refresh_tools({})
→ { manifest_count: 55, refreshed_count: 55, failed_count: 0, status: "refreshed" }
```

A `dry_run: true` call returns the planned imports without mutating the server. Use it first when you want to verify what will change.

```text
meta_state_refresh_tools({ dry_run: true })
→ { dry_run: true, manifest_count: 55, plan: [{ file, export, abs_path, exists }, ...] }
```

If the reloader returns `error: "server_handle_unavailable"`, the `globalThis.__loopMcpServer` binding is missing (the server was started from a different entry point than `server.js`, or the binding was lost). Fall back to a full process restart.

## Fallback: full process restart

When the reloader cannot reach the server handle, kill the process and let the orchestrator (Droid) respawn it.

```bash
# Find the server PID
pgrep -f "tools/learning-loop-mcp/server.js"

# Kill it
kill <pid>

# The orchestrator respawns on the next tool call. If it shows "Not connected",
# close and reopen the Droid session.
```

There should normally be exactly one server process. If `pgrep` returns more than one, you have duplicate processes from prior session drift; kill all of them and let the orchestrator respawn a single one.

## When to refresh vs. restart

| Symptom | Action |
|---|---|
| Edited a tool file, want new behavior via MCP | `meta_state_refresh_tools` |
| Edited `server.js` itself or `tool-registry.js` | Full restart (the reloader's own code is not reloaded by it) |
| Edited `core/*.js` modules that the tools import | `meta_state_refresh_tools` (the tools get re-imported with cache-bust) |
| MCP shows "Not connected" | Check the process list; if no server is running, restart the session |
| Test fails with `hash_mismatch` on a finding whose evidence file you just edited | `meta_state_refresh_fingerprint` (separate concern; see "Drift" below) |

## Drift after edits

`server.js`, `tool-registry.js`, and core modules have `evidence_code_ref` pointing at them from various findings. After editing these files, `meta_state_check_grounding` will report `drifted: hash_mismatch` for those findings. This is expected — the drift is real. Refresh the fingerprints via `meta_state_refresh_fingerprint` (per finding) or `meta_state_refresh_fingerprint` with the broader sweep if you have a script for it.

Do not interpret the drift as a regression in the changed code. The drift is in the *recorded* fingerprint, not the code.

## Why not fs.watch?

A previous design considered adding `fs.watch` to the tool directory and reloading automatically. The reloader tool is the explicit, observable, opt-in version. Auto-watch is rejected for two reasons:

1. **In-process module state is not reset.** A tool that closes over a `let` counter or caches a reference at module load time will keep the old value even after re-import. The reloader clears the in-memory handler map, but module-level state in core modules (e.g., the registry LRU cache) is not reset. Auto-watch would silently produce inconsistent state.
2. **The orchestrator has no opportunity to react.** A tool call landing mid-reimport could see a half-populated `_registeredTools` map. The explicit reloader call is atomic from the orchestrator's perspective: the next call after it sees the new handlers, the call during it sees the cleared state and returns an error.

## Related

- Finding: `meta-260609T1028Z-mcp-server-tools-learning-loop-mcp-server-js-does-a-one-shot` (subtype: `mcp-server-stale-code`, category: `loop-anti-pattern`)
- Tool: `meta_state_refresh_tools` (see `tools/learning-loop-mcp/tools/meta-state-refresh-tools-tool.js`)
- Helper: `clearRegistrations(server)` (see `tools/learning-loop-mcp/tool-registry.js`)
- Server entry: `tools/learning-loop-mcp/server.js` (sets `globalThis.__loopMcpServer = server` after `connect`)
