---
phase: 5
title: "Parallel Cold-Session Test (F9)"
status: pending
priority: P1
effort: "1h"
dependencies: ["2", "3"]
---

# Phase 5: Parallel Cold-Session Test (F9)

## Overview

Ship `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs` — a protocol-level E2E test for the mastra server, parallel structure to `tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs` (the legacy cold-session test). Spawns the mastra server as a child process, connects via `StdioClientTransport`, calls `tools/list` + `tools/call` for `loop_describe` + `meta_state_list`. Verifies the mastra server enumerates 29 tool names matching `tools/learning-loop-mastra/tools/manifest.json`.

**Resolves F9** (red team, Plan 1): "Plan 2 adds a parallel cold-session test for mastra manifest." The legacy test enumerates 25 (agent-manifest entries); the mastra test enumerates 29 (tools/manifest.json entries). The 4-tool gap in `agent-manifest.json` is deferred to Plan 3 / C7 per M-C4.

## Why parallel structure (not reuse)

The legacy `mcp-protocol-e2e.test.cjs` is locked to `SERVER_ENTRY = tools/learning-loop-mcp/server.js` and `MANIFEST_PATH = tools/learning-loop-mcp/tools/manifest.json`. Plan 2's parallel test mirrors the structure but points at the mastra server + manifest. The duplication is intentional: the two tests are the cold-session discoverability gates for the two servers, and a parallel structure makes the "29 vs 25" gap visible at a glance.

## Requirements

- **Functional:** the test (a) spawns the mastra server, (b) calls `initialize`, (c) calls `tools/list`, (d) asserts the tool count matches `tools/learning-loop-mastra/tools/manifest.json` (29 entries), (e) calls `tools/call loop_describe { tier: "warm" }` and asserts the response contains `tools` + `discoverability_hints`, (f) calls `tools/call meta_state_list { compact: true }` and asserts the response has `entries` + `count`.
- **Non-functional:** uses `mkdtempSync` for the `GATE_ROOT`; tests are independent and can run in any order.

## Architecture

```
mcp-protocol-e2e.test.cjs (Mastra side)
├── describe("mastra mcp protocol e2e")
│   ├── before: spawnServer() — same pattern as legacy
│   ├── after: server.cleanup()
│   ├── test 1: server starts and responds to initialize
│   ├── test 2: tools/list returns 29 tools (matches manifest)
│   │     └── assert each tool has name, description, inputSchema
│   ├── test 3: tools/call loop_describe returns expected shape
│   └── test 4: tools/call meta_state_list with compact returns valid response
```

## Related Code Files

- Create: `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs` (~120 lines; mirrors the legacy test 1:1)

## Implementation Steps

1. **Copy the legacy test as a starting point.** `cp tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs`.
2. **Update the constants.**
   - `SERVER_ENTRY = "tools/learning-loop-mastra/server.js"`
   - `MANIFEST_PATH = "tools/learning-loop-mastra/tools/manifest.json"`
   - `TOOL_COUNT = 29` (from the new manifest; 25 in the legacy test was per `agent-manifest.json`; the mastra `tools/manifest.json` is the source of truth for the parity subset)
3. **Update the `tools/list` assertion.** Each tool's name starts with `mastra_`. Add `assert.ok(tool.name.startsWith("mastra_"), ...)` as a sanity check.
4. **Run, confirm 4/4 GREEN.**
5. **Add a 5th test:** `tools/list` returns 29 distinct names, no duplicates. `assert.equal(new Set(result.tools.map(t => t.name)).size, 29)`.
6. **Verify no regression:** legacy `mcp-protocol-e2e.test.cjs` still passes 4/4.

## Success Criteria

- [ ] 4 base tests + 1 duplicate-check = 5 tests pass
- [ ] The mastra server enumerates 29 distinct tool names
- [ ] All `mastra_*`-prefixed names
- [ ] `loop_describe` returns `tools` + `discoverability_hints`
- [ ] `meta_state_list` returns valid `{ entries, count }`
- [ ] F9 finding marked resolved in `meta-state.jsonl` via `meta_state_log_change`

## Risk Assessment

- **Risk:** the mastra server's `loop_describe` may return a different shape than the legacy (e.g., may not include `discoverability_hints` in `tier: "warm"`). **Mitigation:** the test asserts the SHAPE (object with `tools` and `discoverability_hints` keys), not the exact content. If the mastra server is missing `discoverability_hints`, that's a real gap, not a test bug — the test fails, surface to the operator.
- **Risk:** the mastra server's `meta_state_list` may not support `compact: true` (Plan 1's parity contract test doesn't cover this). **Mitigation:** the test calls the same tool with the same arg as the legacy test; if it fails, the test surfaces a real gap.
- **Risk:** running both cold-session tests in parallel (legacy + mastra) may have port conflicts. **Mitigation:** stdio doesn't have ports; both spawn child processes, no network. Safe to run in parallel via `node --test`.

## Security Considerations

None. The cold-session test only reads the registry (`loop_describe` + `meta_state_list compact`); no write operations.

## Next Steps

Phase 6 uses the dual-server spawn to verify the 40 + 29 = 69 distinct tool names claim. Phase 7 closes the gate.
