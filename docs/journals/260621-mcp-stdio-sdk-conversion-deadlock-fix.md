# MCP stdio SDK conversion — deadlock eliminated, 1114 tests green

**Date**: 2026-06-21 22:23
**Severity**: High
**Component**: MCP stdio transport, test suite, Droid hook
**Status**: Resolved

## What Happened

`pnpm test` deadlocked during pre-commit because four test files used hand-rolled JSON-RPC stdio parsers that could not handle a log line emitted by the spawned MCP server. The parser read the log line as JSON, threw, and never recovered — so `notifications/initialized` was never sent, the server never started processing requests, and the test hung forever. We converted all hand-rolled MCP stdio clients (five tests + the Droid hook `.factory/hooks/loop-surface-inject.cjs`) to the official `@modelcontextprotocol/sdk Client`, defaulted spawned servers to `MASTRA_STORAGE_DRIVER=memory`, added `--test-timeout=30000` to the test script, and resolved `meta-260621T1743Z` with the corrected root cause.

## The Brutal Truth

This was a classic "reinvent the wheel and get the hub stuck in your finger" situation. We spent real time debugging a deadlock that the official SDK would have handled out of the box. The hand-rolled parser was fragile: it assumed every stdout line was a JSON-RPC message, and one innocent `console.log` from the server shattered that assumption. The frustrating part is that the official SDK existed the whole time, and we wrote the custom parser anyway. The real kick in the teeth is that this only manifested during pre-commit because the pre-commit hook spawned the server in a way that produced stdout noise the direct test runs did not.

## Technical Details

- Deadlock symptom: `pnpm test` hung indefinitely on `tools/learning-loop-mastra/__tests__/*.test.js` files.
- Root cause: hand-rolled `readline` + `JSON.parse` parser in test files choked on non-JSON stdout lines (server logs) and never sent the required `notifications/initialized` notification.
- Fix: replaced all hand-rolled clients with `new Client(new StdioClientTransport(...))` from `@modelcontextprotocol/sdk`.
- Files changed: 5 test files + `.factory/hooks/loop-surface-inject.cjs` + `with-mcp-server.js` + `package.json`.
- `with-mcp-server.js` now defaults spawned servers to `MASTRA_STORAGE_DRIVER=memory` with optional env override.
- `package.json` test script: added `--test-timeout=30000` so future hangs fail fast instead of blocking CI.
- Full `pnpm test` result: **1114 pass / 0 fail / 1 skipped**.
- Committed in 2 logical commits on branch `260619-2246-phase-d-plan-2-storage`.
- `meta-260621T1743Z` updated with corrected root cause and `evidence_test` path, then resolved.

## What We Tried

1. **Scouted the deadlock** — traced the hang to the four test files spawning an MCP server via hand-rolled stdio. Confirmed the parser broke on stdout log lines.
2. **Evaluated SDK adoption** — confirmed `@modelcontextprotocol/sdk` was already a dependency and provided `StdioClientTransport` + `Client`.
3. **Refactored incrementally** — Phase 1: prepared `with-mcp-server.js` with memory default; Phase 2: rewrote tests; Phase 3: refactored Droid hook; Phase 4: hardened runner and closed finding; Phase 5: verified full suite.

## Root Cause Analysis

We assumed stdout from a spawned MCP server would be pure JSON-RPC. That assumption was wrong as soon as the server logged anything. The hand-rolled parser had no framing, no error recovery, and no handling for the `notifications/initialized` lifecycle requirement. The official SDK handles all of this: line framing, JSON parsing with error recovery, and the full initialization handshake. We should have used it from the start.

## Lessons Learned

1. **Do not hand-roll protocol parsers for standard protocols.** The MCP stdio protocol has edge cases (log lines, initialization handshake, message framing) that are easy to miss and hard to debug. Use the official SDK.
2. **Default test server storage to memory.** Disk-backed storage in tests is a source of flakiness and side effects. `MASTRA_STORAGE_DRIVER=memory` should have been the default in `with-mcp-server.js` from day one.
3. **Add test timeouts before you need them.** A 30-second timeout turns an infinite hang into a fast failure with a clear error. We added it after the pain; add it before the next pain.
4. **Pre-commit hooks are a different environment.** The server spawned by pre-commit produced stdout the direct test runs did not. Test in the actual CI/pre-commit path, not just locally.

## Next Steps

- None. Plan is complete. Branch `260619-2246-phase-d-plan-2-storage` is ready for merge.
- Consider backporting the `--test-timeout=30000` pattern to other test scripts if they also spawn long-lived processes.
- Keep `@modelcontextprotocol/sdk` up to date; future protocol changes will be handled by SDK updates, not custom parser rewrites.
