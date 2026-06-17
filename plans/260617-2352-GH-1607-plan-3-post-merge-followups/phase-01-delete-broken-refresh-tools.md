---
phase: 1
title: "delete-broken-refresh-tools"
status: pending
priority: P3
effort: "30 min"
dependencies: ["plan-3-merged"]
---

# Phase 1: Delete Broken `meta_state_refresh_tools`

## Context

PR #4 (Plan 3 cut-over) shipped `meta_state_refresh_tools` to the canonical mastra server, but:
1. `globalThis.__loopMcpServer` is never bound in `tools/learning-loop-mastra/server.js` — every call returns `{error: "server_handle_unavailable"}`.
2. The tool's body (`server._registeredTools` mutation, `server.setToolRequestHandlers()`, `server.sendToolListChanged()`) targets `@modelcontextprotocol/sdk`'s private internals. Mastra's `MCPServer` is a different SDK; verified zero references to those names in `tools/learning-loop-mastra/`. Even binding the global would not make the body work.

Operator decision (2026-06-17): **delete the tool**. Restart via `pnpm gate:server` (~1s).

## Acceptance

- `meta_state_refresh_tools` is no longer registered (manifest count 39).
- `tools/learning-loop-mcp/core/mcp-server-reload.js` deleted.
- `tools/learning-loop-mcp/__tests__/meta-state-refresh-tools-tool.test.js` deleted.
- `docs/mcp-server-restart-protocol.md` rewritten to restart-only flow OR deleted.
- `pnpm test` passes (1040 → ~1035 tests, 0 fail).

## Implementation Steps

### Step 1.1 — Remove from active manifests

**`tools/learning-loop-mastra/tools/manifest.json`** — delete line 38:
```json
{ "file": "tools/meta-state-refresh-tools-tool.js", "export": "metaStateRefreshToolsTool" },
```
Result: 39 entries.

**`tools/learning-loop-mastra/agent-manifest.json:19`** — remove `"mastra_meta_state_refresh_tools"` from `meta_state.tools` array (20 → 19 entries).

### Step 1.2 — Remove from legacy manifests (cleanup)

**`tools/learning-loop-mcp/tools/manifest.json:38`** — delete entry.
**`tools/learning-loop-mcp/agent-manifest.json:47`** — delete `meta_state_refresh_tools` from the relevant group.

### Step 1.3 — Delete source files

```bash
git rm tools/learning-loop-mcp/tools/meta-state-refresh-tools-tool.js
git rm tools/learning-loop-mcp/core/mcp-server-reload.js
git rm tools/learning-loop-mcp/__tests__/meta-state-refresh-tools-tool.test.js
```

### Step 1.4 — Update docs

**`docs/mcp-server-restart-protocol.md`** — rewrite as restart-only protocol. Remove all `meta_state_refresh_tools` references. The tool no longer exists; the canonical path is now `pnpm gate:server` restart. If the doc adds no value post-rewrite, `git rm` it instead.

**`docs/project-changelog.md`** — add entry under post-Plan-3 hygiene:
> Deleted broken `meta_state_refresh_tools` and `core/mcp-server-reload.js`. The tool targeted legacy `@modelcontextprotocol/sdk` internals incompatible with Mastra's `MCPServer`. Operator hot-reload uses `pnpm gate:server` restart.

### Step 1.5 — Verify no lingering imports

```bash
grep -rn "meta_state_refresh_tools\|metaStateRefreshTools\|mcp-server-reload" tools/ .claude/ .factory/ docs/ AGENTS.md CLAUDE.md README.md \
  | grep -v node_modules
```
Expected: 0 hits (or only gate-log historical entries in `.claude/coordination/gate-log.jsonl` which is append-only).

### Step 1.6 — Boot test + suite

```bash
node tools/learning-loop-mastra/server.js < /dev/null 2>&1 | head -1
# Expected: "learning-loop-mastra: registered 39 of 39 tools"

pnpm test
# Expected: 0 fail; ~1035 pass (5 tests removed); 1 skip
```

### Step 1.7 — Cascade-resolve the finding

```
meta_state_resolve({
  id: "meta-260617T2356Z-pr-4-plan-3-cut-over-shipped-meta-state-refresh-tools-to-the",
  resolution: "Deleted meta_state_refresh_tools, core/mcp-server-reload.js, and its test. Operator hot-reload uses pnpm gate:server restart (~1s).",
  resolved_by: "operator"
})
```

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Legacy gate-log entries reference the tool | Low | Append-only audit log; do not edit |
| Tests assuming 40 tools fail | Low | Step 1.6 catches regressions |
| Operator workflow breaks | Low | Restart via `pnpm gate:server` documented in updated `mcp-server-restart-protocol.md` |
