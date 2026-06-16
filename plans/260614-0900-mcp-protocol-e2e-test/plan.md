---
title: "MCP Protocol-Level E2E Test for Cold-Session Discoverability"
description: "Add a protocol-level E2E test using @modelcontextprotocol/sdk Client to exercise the MCP wire protocol (server startup, tools/list, tools/call over JSON-RPC via stdio), replacing the flaky hand-rolled JSON-RPC test that was eliminated in the 260614 rewrite."
status: complete
priority: P2
branch: "main"
tags: ["testing", "mcp", "e2e", "meta-state"]
blockedBy: []
blocks: []
created: "2026-06-13T18:39:01.076Z"
createdBy: "ck:plan"
source: skill
---

# MCP Protocol-Level E2E Test for Cold-Session Discoverability

## Problem

Finding `meta-260614T0107Z-cold-session-discoverability-test-rewrite-260614-eliminated` (status: reported) identifies a coverage gap: the cold-session discoverability test rewrite eliminated flaky droid-exec spawning but left no protocol-level E2E test. Current tests (7 of them) verify schemas, hints, and core logic via direct imports — they never exercise the actual MCP wire protocol (JSON-RPC over stdio).

The old test 2 (direct MCP server spawn) tested this path but used brittle hand-rolled JSON-RPC parsing. The fix: add a deterministic E2E test using `@modelcontextprotocol/sdk` Client to connect to the server via stdio and verify `tools/list` + `tools/call`.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Research](./phase-01-research.md) | ✅ Complete |
| 2 | [Implement](./phase-02-implement.md) | ✅ Complete |
| 3 | [Test](./phase-03-test.md) | ✅ Complete |
| 4 | [Resolve](./phase-04-resolve.md) | ✅ Complete |

## Dependencies

- `@modelcontextprotocol/sdk@1.29.0` (already in package.json)
- No new dependencies required
