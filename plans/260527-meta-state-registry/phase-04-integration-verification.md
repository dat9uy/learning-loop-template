---
phase: 4
title: "Integration Verification"
status: completed
effort: "1h"
dependencies: [1, 2, 3]
---

# Phase 4: Integration Verification

## Overview

End-to-end verification that the meta-state registry works across the full stack: MCP server loads tools, agent can report/list/ack/resolve, auto-resolve triggers on file change, and TTL expiry works. Run the full test suite and validate no regressions.

## Requirements

- **Functional:** All 4 MCP tools callable through the server, end-to-end JSONL lifecycle verified.
- **Non-functional:** No regressions in existing tests, no tool registration failures at startup.

## Architecture

Integration test simulates the agent workflow:
1. `meta_state_report` → creates entry
2. `meta_state_list` → sees entry in `reported`
3. Modify watched file → `meta_state_list` → sees `auto-resolved`
4. `meta_state_report` → creates second entry
5. `meta_state_ack` → promotes to `active`
6. `meta_state_list` → sees `active`, not `reported`
7. `meta_state_resolve` → terminal
8. `meta_state_list` with `include_expired: true` → sees `resolved`
9. Wait 24h (mock) → `meta_state_list` → third entry `expired`

## Related Code Files

- **Integration test:** `tools/learning-loop-mcp/__tests__/meta-state-integration.test.js`
- **Server:** `tools/learning-loop-mcp/server.js`
- **Manifest:** `tools/learning-loop-mcp/tools/manifest.json`

## Implementation Steps

1. **Server startup test**
   - Run `node tools/learning-loop-mcp/server.js` and capture stderr
   - Assert "registered 40 of 40 tools" (36 existing + 4 new)
   - Assert no "safeImport: skipped" for meta-state tools

2. **End-to-end lifecycle test**
   - Create temp directory as `GATE_ROOT`
   - Instantiate MCP server in-process (import server module or use stdio transport)
   - Call each tool handler directly (import from tool files, not via server transport)
   - Verify JSONL file contents after each operation

3. **Regression check**
   - Run `pnpm test` — assert all existing tests still pass
   - Run `pnpm check` — assert record validation, plan loop validation, unit tests all pass
   - Verify `agent-manifest.json` is valid JSON

4. **Documentation update**
   - Add `meta_state` tool group to any skill quickstart that lists MCP tools
   - Update `docs/journals/260527-meta-state-registry-brainstorm.md` to note the plan was implemented

## Success Criteria

- [x] `node tools/learning-loop-mcp/server.js` starts with "registered 40 of 40 tools"
- [x] End-to-end lifecycle test passes (report → list → auto-resolve → ack → resolve)
- [x] `pnpm test` passes with 0 failures
- [x] `pnpm check` passes with 0 failures
- [x] No regressions in existing MCP tool behavior (gate_check, record_create_observation, etc.)

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Tool registration fails silently | Server logs show registration count; integration test asserts exact count |
| JSONL file corruption on first real use | Atomic write + compaction + integration test with concurrent writes |
| Agent-manifest schema drift | Validate JSON parseability, validate all 4 tool names present in group |
