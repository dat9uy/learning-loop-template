# MCP Protocol-Level E2E Test — Session Journal

**Date:** 2026-06-13
**Commit:** `edfdda7`
**Plan:** `plans/260614-0900-mcp-protocol-e2e-test/`

## What happened

Added a protocol-level E2E test (`mcp-protocol-e2e.test.cjs`) that exercises the actual MCP wire protocol using `@modelcontextprotocol/sdk` Client. This fills the coverage gap left when the flaky hand-rolled JSON-RPC test was eliminated in the 260614 rewrite.

## What was built

- **Test file:** `tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs`
- **4 test cases:** server startup, tools/list (37 tools), tools/call loop_describe, tools/call meta_state_list
- **Pattern:** shared server via `before()` hook, cleanup via `client.close()` in `after()`, 10s timeout per test
- **Result:** 865 pass, 0 fail, 1 skip (full suite)

## Meta-state cleanup

- Resolved and archived 13 cold-session flaky test findings (`session_id=test-cold-session-mcp-client-loading`)
- Resolved `meta-260614T0107Z-cold-session-discoverability-test-rewrite-260614-eliminated` (coverage gap)
- Updated master tracker (`plans/reports/productization-260612-1530-master-tracker.md`)

## Mistake caught and corrected

Archived `rule-cold-session-test-must-pass-before-resolution` (a gate rule) when cleaning up flaky test findings. User caught this — the rule is still important. Restored it to `active`, updated pattern from `test-cold-session-mcp-client-loading` to `mcp-protocol-e2e-test`.

**Lesson:** Gate rules are not artifacts of the test — they are guards on resolution. Replacing a test doesn't remove the need for the gate.

## Debugging finding: `session_id` invisible in compact responses

Investigated why `meta_state_list({compact:true})` couldn't find entries by `session_id`. Root cause: `summarize()` in `loop-introspect.js` is a curated field whitelist that omits `session_id`. The tool exposes `session_id` as a **server-side filter** — use that instead of client-side filtering on projected-away fields.

## Code review feedback applied

- Replaced sequential test dependency with `before()` hook (no cascade failures)
- Changed `transport.close()` → `client.close()` in cleanup (proper Protocol state cleanup)
- Added 10s timeouts per test case
