---
phase: 1
title: "Prepare shared helper"
status: completed
priority: P1
dependencies: []
---

# Phase 1: Prepare shared helper

## Overview

Update `tools/learning-loop-mastra/__tests__/with-mcp-server.js` so all SDK-based MCP tests default to isolated in-memory storage and expose a clean contract for the conversions in Phases 2 and 3.

## Requirements

- Functional: `withMcpServer` and `connectMcpServer` set `MASTRA_STORAGE_DRIVER=memory` so spawned servers do not contend on `tools/learning-loop-mastra/data/mastra-memory.db`.
- Non-functional: no behavior change for existing callers; keep ESM/CJS dynamic-import compatibility.

## Related Code Files

- Modify: `tools/learning-loop-mastra/__tests__/with-mcp-server.js`

## Implementation Steps

1. In `connectMcpServer`, change the transport `env` spread to include `MASTRA_STORAGE_DRIVER: "memory"`.
2. Add an optional `env` parameter to `connectMcpServer` so callers can override or extend env without losing the memory default.
3. Verify the helper still imports correctly from CJS via dynamic `import()`.

## Success Criteria

- [x] `withMcpServer` spawns server with `MASTRA_STORAGE_DRIVER=memory` by default.
- [x] Existing SDK-based tests (`mcp-protocol-e2e.test.cjs`, `workflow-parity.test.cjs`, `storage-parity.test.cjs`) still pass.

## Risk Assessment

- **Risk:** Existing tests may rely on the real SQLite file. Mitigation: run them before and after; if any fail, make memory driver opt-in instead of default.
- **Risk:** Phase D Plan 2 storage also references this helper. Mitigation: the change is additive (env default) and does not alter the helper's API shape.
