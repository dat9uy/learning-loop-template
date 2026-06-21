---
phase: 3
title: "Refactor Droid hook to SDK client"
status: pending
priority: P1
dependencies: [1]
---

# Phase 3: Refactor Droid hook to SDK client

## Overview

Convert `.factory/hooks/loop-surface-inject.cjs` from a hand-rolled JSON-RPC probe to an official `@modelcontextprotocol/sdk` `Client` probe. Keeps the existing security, timeout, and cleanup semantics.

## Requirements

- Functional: hook still returns `loop_describe({ tier })` summary on success and reports failures on error/timeout.
- Non-functional: preserve `ALLOWED_COMMANDS` guard, 10s wall-clock timeout, `child.unref()`, and cleanup behavior.

## Related Code Files

- Modify: `.factory/hooks/loop-surface-inject.cjs`
- Tests: `.factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs`

## Implementation Steps

1. Import `Client` and `StdioClientTransport` dynamically inside `spawnAndCall` (CJS module).
2. Build `StdioClientTransport` with the allowed command/args and cwd.
3. Connect the client; call `client.callTool({ name: "mastra_loop_describe", arguments: { tier } })`.
4. Parse `result.content[0].text` as JSON and return it.
5. Preserve the existing 10s timeout race; kill the child and reject/resolve(null) on timeout.
6. Preserve `ALLOWED_COMMANDS` check before spawning.
7. Update `loop-surface-inject-real-spawn.test.cjs` only if the new implementation changes observable behavior.

## Success Criteria

- [ ] `loop-surface-inject-real-spawn.test.cjs` passes.
- [ ] Hook still reports `mcp-connection` findings on timeout or connection failure.
- [ ] No hand-rolled `jsonrpc` writes remain in the hook.

## Risk Assessment

- **Risk:** SDK client is heavier than raw spawn; SessionStart hook latency may increase. Mitigation: measure with the real-spawn test; if it exceeds ~1s consistently, reconsider.
- **Risk:** `child.unref()` semantics differ with SDK transport. Mitigation: explicitly manage transport lifecycle and kill the spawned process on cleanup.
- **Risk:** Hook is production surface for Droid CLI. Mitigation: run the full `.factory/hooks/__tests__/` suite and manual smoke test before commit.
