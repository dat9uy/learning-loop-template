---
phase: 1
title: "Research"
status: complete
effort: "15m"
dependencies: []
---

# Phase 1: Research

## Overview

Verify the MCP SDK client API surface and confirm the test approach before writing code.

## Key Insights

- `server.js` uses `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js` + `StdioServerTransport`
- Client counterpart: `Client` from `@modelcontextprotocol/sdk/client/index.js` + `StdioClientTransport` from `@modelcontextprotocol/sdk/client/stdio.js`
- The server starts via `node tools/learning-loop-mcp/server.js` and communicates over stdin/stdout
- SDK version 1.29.0 is already installed — no new deps needed

## Implementation Steps

1. Verify `Client` and `StdioClientTransport` are available in the installed SDK version
2. Confirm the test can spawn the server as a child process and connect via stdio transport
3. Identify the minimal assertions: `tools/list` returns registered tools, `tools/call` on `loop_describe` returns expected shape

## Success Criteria

- [x] Confirmed SDK client classes are importable
- [x] Confirmed stdio transport connects to the server process
- [x] Test approach validated with a manual probe
