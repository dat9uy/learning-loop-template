---
phase: 2
title: "Rewrite MCP stdio tests with SDK"
status: pending
priority: P1
dependencies: [1]
---

# Phase 2: Rewrite MCP stdio tests with SDK

## Overview

Replace every hand-rolled MCP stdio parser in tests with the SDK-based `withMcpServer` / `connectMcpServer` helper. This fixes the deadlock and removes duplicate protocol code.

## Requirements

- Functional: the 4 deadlocked tests pass; `meta-state-list-id-stdio.test.js` keeps passing.
- Non-functional: preserve all existing assertions, registry reads, and temp-root isolation.

## Related Code Files

- Modify:
  - `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs`
  - `tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js`
  - `tools/learning-loop-mcp/__tests__/meta-state-patch-derived-schema.test.js`
  - `tools/learning-loop-mcp/__tests__/zod-coerce-top-level.test.js`
  - `tools/learning-loop-mcp/__tests__/meta-state-list-id-stdio.test.js`
- Reuse: `tools/learning-loop-mastra/__tests__/with-mcp-server.js`

## Implementation Steps

1. For each `.js` test, replace the local `withMcpServer` / spawn block with `import { withMcpServer } from ".../with-mcp-server.js"`.
2. For the `.cjs` test, use dynamic `import()` of the ESM helper (pattern already used in `mcp-protocol-e2e.test.cjs`).
3. Map helper API to test needs:
   - `callTool(name, args)` returns parsed JSON text — replace the old `call(id, name, args)`.
   - `listTools()` returns tools array — replace the old `send(id, "tools/list", {})`.
   - `tempRoot` is exposed for `readRegistry(tempRoot)` calls.
4. Delete duplicated spawn, buffer parser, `send`, and `call` code from each test.
5. Keep `GATE_ROOT` temp-root behavior; the helper handles schema copying and cleanup.

## Success Criteria

- [ ] Each rewritten test passes when run in isolation with `--test-timeout=15000`.
- [ ] `pnpm test` no longer deadlocks on these files.
- [ ] No hand-rolled JSON-RPC remains in any test file.

## Risk Assessment

- **Risk:** Test assertions depend on exact response shape. Mitigation: `callTool` already parses `result.content[0].text` as JSON, matching the old behavior.
- **Risk:** `meta-state-list-id-stdio.test.js` seeds `meta-state.jsonl` directly before spawning. Mitigation: keep the seed step; only replace the spawn/parser block.
- **Risk:** CJS dynamic import of ESM helper can fail. Mitigation: use `pathToFileURL` + `import()` pattern from existing CJS tests.
