---
phase: 2
title: "Implement"
status: complete
effort: "30m"
dependencies: [1]
---

# Phase 2: Implement

## Overview

Write the protocol-level E2E test file using TDD: define assertions first, then verify they pass.

## Related Code Files

- Create: `tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs`
- Read: `tools/learning-loop-mcp/server.js` (server entry point)
- Read: `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (existing test patterns)
- Read: `tools/learning-loop-mcp/tools/manifest.json` (expected tool list)

## Implementation Steps

1. Create `mcp-protocol-e2e.test.cjs` with `node:test` + `node:assert` (matching existing test conventions)
2. **Test: server starts and responds to initialize** — spawn `node server.js` as child process, create `StdioClientTransport` wrapping the child's stdin/stdout, call `client.connect()`, assert no errors
3. **Test: tools/list returns all manifest tools** — call `client.listTools()`, assert the count matches `manifest.json` length, assert each tool has `name`, `description`, `inputSchema`
4. **Test: tools/call loop_describe returns expected shape** — call `client.callTool({ name: "loop_describe", arguments: { tier: "warm" } })`, assert response has `content` array with text item containing `"tools"` and `"discoverability_hints"`
5. **Test: tools/call meta_state_list with compact returns valid response** — call `client.callTool({ name: "meta_state_list", arguments: { compact: true } })`, assert response has `content` array
6. Add proper cleanup: close client, kill child process in `after`/`afterEach`
7. Set reasonable timeout (15s) for server startup

## TDD Approach

Write the test assertions first (expected behavior), run them to see failures, then ensure the server implementation satisfies them. The server already exists — this is verification testing, not implementation testing.

## Success Criteria

- [x] Test file created with 4 test cases
- [x] All tests use `@modelcontextprotocol/sdk` Client (no hand-rolled JSON-RPC)
- [x] Proper process cleanup (no orphaned child processes)
- [x] Tests pass with `node --test mcp-protocol-e2e.test.cjs`
