---
phase: 4
title: "phase-04-smoke-test"
status: pending
effort: ""
---

# Phase 4: Programmatic Smoke Test (Tool Round-Trip)

## Overview

Write a separate `scripts/smoke-mastracode.cjs` (NOT extend Phase 1 probe — red-team fix F4). The smoke test:

1. Invokes `createMastraCode({ cwd })` with our `.mastracode/mcp.json` (MCP-only integration per red-team fix F2)
2. Asserts MCP server connection succeeds
3. Verifies tool namespacing for one tool (e.g., `loop_describe` → `learning-loop_loop_describe` or actual format)
4. **Verifies hook I/O wire format compatibility** (red-team Security obs) — Mastra Code's documented hook stdin/stdout JSON shape differs from Claude Code's; universal scripts must parse Mastra Code's wire format OR we discover this gap before merge
5. Calls one tool round-trip via the `mcpManager` (NOT `harness.callTool` directly — that was the programmatic path, deferred)
6. Asserts response shape; cleans up

**Method whitelist:** only call harness methods that Phase 1 probe documented as present (`typeof === 'function'`). If a method is absent, log the gap as a finding; do not call it.

## Requirements

- **Functional:** `node scripts/probe-mastracode.cjs` exits 0 + writes `{ok: true, smoke_test: {...}}` JSON with one tool round-tripped
- **Non-functional:** end-to-end — boots Mastra Code, connects to MCP server OR imports tool factory, invokes tool, asserts response shape, cleans up
- **Testability:** CI-runnable; no interactive prompts; cleans up after itself

## Architecture

**MCP-only integration in action** (red-team fix F2: programmatic deferred to follow-up):

```
scripts/smoke-mastracode.cjs (separate from Phase 1 probe per red-team fix F4)
  ↓
const { harness, mcpManager, hookManager } = await createMastraCode({
  cwd: process.cwd(),
  resourceId: 'mastra-code',
  // MCP-only: no extraTools; tools come from .mastracode/mcp.json server registration
})
  ↓
// Verify MCP server reachable (PRIMARY path)
const mcpServers = await mcpManager.listServers()
assert mcpServers.find(s => s.name === 'learning-loop')?.connected === true
  ↓
// Verify tool namespacing (Phase 1 probe documented actual format)
const mcpTools = await mcpManager.listTools('learning-loop')
assert mcpTools.some(t => t.name === '<ACTUAL_FORMAT>')  // e.g., 'loop_describe' or 'learning-loop_loop_describe'
  ↓
// Verify hook I/O wire format (red-team Security obs)
// Synthesize a Mastra Code hook payload, pipe to a universal hook script, verify parse + decision
const hookInput = { session_id: 'test', cwd: process.cwd(), hook_event_name: 'PreToolUse', tool_name: 'execute_command', tool_input: { command: 'ls' } }
const proc = spawnSync('node', ['tools/learning-loop-mastra/hooks/legacy/bash-gate.js'], { input: JSON.stringify(hookInput) })
assert proc.status === 0
assert JSON.parse(proc.stdout).decision !== undefined
  ↓
// Tool round-trip via MCP (the proof)
const result = await mcpManager.callTool('learning-loop', '<ACTUAL_FORMAT_loop_describe>', { tier: 'warm' })
assert result.ok === true
  ↓
// Cleanup (only call methods present in Phase 1 probe inventory)
if (typeof mcpManager.disconnectAll === 'function') await mcpManager.disconnectAll()
if (typeof harness.shutdown === 'function') await harness.shutdown()
  ↓
write JSON {ok, smoke_test: {mcp_servers, mcp_tool_namespacing, hook_wire_format_compatible, tool_roundtrip_response_shape, harness_method_inventory_used}, error?}
exit 0 / 1
```

**Why this proves the contract works:**
- Demonstrates MCP-only integration (matches scope report E.5)
- Verifies MCP server reachability + tool registration
- Captures tool namespacing format (the actual convention)
- Verifies hook I/O wire format compatibility (the gap red-team Security flagged)
- Confirms resourceId propagation
- Method whitelist prevents calling non-existent APIs (red-team fix F8)

## Related Code Files

- Modify: `scripts/probe-mastracode.cjs` (extend Phase 1 probe; ~80 LoC → ~150 LoC)
- Modify: `package.json` (add `pnpm smoke:mastracode` script: `node scripts/probe-mastracode.cjs`)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/mastra-code-smoke.test.js` (NEW regression test wrapper; runs probe + asserts exit 0 + JSON shape)

## Implementation Steps

1. **Extend probe script.** Add tool round-trip section:
   - Import `loop_describe` tool factory from `tools/learning-loop-mastra/mastra/tools/legacy/loop-describe-tool.js` (or whatever the actual entry path is — discover via `tools/learning-loop-mastra/tools/manifest.json`)
   - Call via `harness.callTool('loop_describe', { tier: 'warm' })`
   - Assert response.ok === true
   - Capture hook events that fire during the call (via `harness.subscribe('tool_start' / 'tool_end')`)

2. **Run probe.** Confirm exit 0; capture stdout JSON.

3. **Wire into package.json.** Add `"smoke:mastracode": "node scripts/probe-mastracode.cjs"` to scripts.

4. **Add regression test.** `tools/learning-loop-mastra/__tests__/legacy-mcp/mastra-code-smoke.test.js`:
   - Spawn probe as child process
   - Assert exit code 0
   - Parse stdout JSON; assert `ok === true`
   - Assert `smoke_test.tool_name === 'loop_describe'` (or whatever tool was called)
   - Assert `smoke_test.hook_events_fired` array contains expected events

5. **Run full test suite.** `pnpm test` — all 13 namespaces GREEN + the new namespace for Mastra Code smoke.

6. **File findings (if any).** If probe reveals additional Q6 / Q7-class questions (e.g., `harness.callTool` signature differs from docs, MCP namespacing is unexpected), file `meta_state_report` findings. If smoke test fails for fixable reasons, fix and rerun.

## Success Criteria

- [ ] `node scripts/probe-mastracode.cjs` exits 0 with `{ok: true, smoke_test: {...}}` JSON
- [ ] Probe boots Mastra Code, connects MCP, calls `loop_describe`, receives response
- [ ] `pnpm smoke:mastracode` runs the probe (via package.json script)
- [ ] `pnpm test` GREEN across all 13 namespaces + new `mastracode-smoke.test.js` namespace
- [ ] `meta_state_log_change` filed with `reason: 'Phase E Plan 4 smoke test passed; programmatic integration confirmed'`

## Risk Assessment

- **Probe tool discovery:** if `loop_describe` factory path is wrong, probe fails to import. Mitigation: read `tools/learning-loop-mastra/tools/manifest.json` to discover canonical paths; verify before smoke.
- **MCP tool namespacing in `harness.callTool`:** if programmatic integration requires namespace prefix (e.g., `learning-loop_loop_describe`), probe must call the namespaced name. Mitigation: Phase 1 probe already documents namespacing; Phase 4 uses documented value.
- **Hook payload tool_name mismatch:** if Mastra Code's built-in write/edit tool name in the hook payload differs from the `hooks.json` matcher, write-gate won't fire. Mitigation: Phase 2 already used Phase 1 probe value; Phase 4 smoke test triggers a synthetic write to verify hook fires.
- **LibSQL lock conflict (R3):** if Phase 1 probe detected conflict, Phase 4 must use the resolved `.mastracode/database.json` config (sibling DB path). Mitigation: probe reads configured DB path; smoke test runs against the configured path.

## Cross-references

- **Phase 1 probe:** `scripts/probe-mastracode.cjs` (skeleton created in Phase 1)
- **Tool factory:** `tools/learning-loop-mastra/mastra/tools/legacy/loop-describe-tool.js` (canonical path; verify)
- **Tool manifest:** `tools/learning-loop-mastra/tools/manifest.json`
- **Mastra Code API:** `https://code.mastra.ai/reference.md#createmastracode`
- **Harness API:** `node_modules/@mastra/core/dist/harness/harness.d.ts` (already read in harness-class report)