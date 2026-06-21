# Scout Report — Hand-Rolled MCP stdio Clients

**Date:** 2026-06-21
**Trigger:** `meta-260621T1743Z` deadlock; operator chose Option C (use official `@modelcontextprotocol/sdk Client`) for the fix
**Goal:** Find every hand-rolled MCP stdio/JSON-RPC client in code + tests so the fix eliminates all unnecessary technical debt, not just the 4 deadlocked tests.

---

## 1. Summary

There are **6 hand-rolled MCP stdio clients** in the repo. Five are in tests; one is in production Droid hook code. Two SDK-based helpers already exist and can replace most of them.

| # | File | Type | Status | Why it is hand-rolled | Recommended action |
|---|---|---|---|---|---|
| 1 | `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs` | test | **broken** — hangs under `pnpm test` | custom spawn + parser | Replace with `withMcpServer` (SDK) |
| 2 | `tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js` | test | **broken** — hangs under `pnpm test` | custom spawn + parser | Replace with `withMcpServer` (SDK) |
| 3 | `tools/learning-loop-mcp/__tests__/meta-state-patch-derived-schema.test.js` | test | **broken** — hangs under `pnpm test` | custom spawn + parser | Replace with `withMcpServer` (SDK) |
| 4 | `tools/learning-loop-mcp/__tests__/zod-coerce-top-level.test.js` | test | **broken** — hangs under `pnpm test` | custom spawn + parser | Replace with `withMcpServer` (SDK) |
| 5 | `tools/learning-loop-mcp/__tests__/meta-state-list-id-stdio.test.js` | test | works, but debt | custom spawn + parser | Replace with `withMcpServer` (SDK) |
| 6 | `.factory/hooks/loop-surface-inject.cjs` | production hook | works, but debt | custom `spawnAndCall` JSON-RPC | Evaluate SDK rewrite separately |

**Already using SDK (good patterns to copy):**

- `tools/learning-loop-mastra/__tests__/with-mcp-server.js` — reusable helper, SDK `Client` + `StdioClientTransport`
- `tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs` — SDK client
- `tools/learning-loop-mastra/__tests__/mcp-protocol-e2e.test.cjs` — SDK client

---

## 2. Why the 4 tests hang

Their hand-rolled parsers keep non-JSON stdout lines in the buffer. The current `@mastra/mcp@1.10.0` server logs `Started MCP Server (stdio)` to stdout. That log line concatenates with the first JSON-RPC response, `JSON.parse` fails, and the response is never delivered. The test waits forever on the first `await send("initialize", ...)`.

`meta-state-list-id-stdio.test.js` and `.factory/hooks/loop-surface-inject.cjs` correctly skip non-JSON lines, so they do not deadlock. They are still technical debt because they re-implement a protocol the SDK already handles.

---

## 3. File-by-file details

### 3.1 Broken test: `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs`

- Lines: `57-119` (spawn + parser + `send`/`call`)
- Server entry: `tools/learning-loop-mastra/server.js`
- Calls: `mastra_loop_describe`, `mastra_meta_state_report`, `mastra_meta_state_log_change`
- Copies schemas to temp `GATE_ROOT`
- Also uses `probeL1` helper for the `.mcp.json` gap probe (no MCP spawn)
- **Fix:** Replace the direct-spawn stdio block with `withMcpServer` from `tools/learning-loop-mastra/__tests__/with-mcp-server.js`.

### 3.2 Broken test: `tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js`

- Lines: `86-131` (stdio transport block)
- Server entry: `tools/learning-loop-mastra/server.js`
- Calls: `mastra_loop_get_instruction`
- **Fix:** Rewrite stdio `describe` block with `withMcpServer`.

### 3.3 Broken test: `tools/learning-loop-mcp/__tests__/meta-state-patch-derived-schema.test.js`

- Lines: `30-120` (`withMcpServer` helper local to the file)
- Server entry: `tools/learning-loop-mastra/server.js`
- Calls: `mastra_meta_state_propose_design`, `mastra_meta_state_patch`
- Reads registry from `tempRoot` after calls (still works with SDK client)
- **Fix:** Replace local `withMcpServer` with the shared SDK-based helper.

### 3.4 Broken test: `tools/learning-loop-mcp/__tests__/zod-coerce-top-level.test.js`

- Lines: `30-120` (same local `withMcpServer` pattern as 3.3)
- Server entry: `tools/learning-loop-mastra/server.js`
- Calls: `mastra_meta_state_report`, `tools/list`
- Reads registry from `tempRoot` after calls
- **Fix:** Replace local helper with shared SDK-based helper.

### 3.5 Working but debt: `tools/learning-loop-mcp/__tests__/meta-state-list-id-stdio.test.js`

- Lines: `28-84` (local `withMcpServer`)
- Server entry: `tools/learning-loop-mastra/server.js`
- Calls: `mastra_meta_state_list`
- This parser correctly skips non-JSON lines, so it passes today.
- **Fix:** Replace with `withMcpServer` to remove duplicate protocol code.

### 3.6 Production hook: `.factory/hooks/loop-surface-inject.cjs`

- Lines: `312-390` (`spawnAndCall`)
- Server entry: read from `.mcp.json` (`learning-loop-mastra`)
- Calls: `mastra_loop_describe`
- Has 10s timeout, `child.unref()`, manual cleanup, allowed-commands guard.
- Parser skips non-JSON lines, so it does not deadlock. It also does not send `notifications/initialized`.
- **Fix:** This is the only *production* hand-rolled MCP client. Converting it to the SDK is recommended, but it should be a separate, carefully tested change because:
  - It is a Droid SessionStart hook (latency-sensitive).
  - It has custom security guards (`ALLOWED_COMMANDS`) and `child.unref()` behavior.
  - The current test `loop-surface-inject-real-spawn.test.cjs` passes and guards against the old chicken-and-egg bug.

---

## 4. What to reuse

`tools/learning-loop-mastra/__tests__/with-mcp-server.js` already does exactly what the broken tests need:

- Creates isolated temp `GATE_ROOT`
- Copies `schemas/*.schema.json`
- Spawns `tools/learning-loop-mastra/server.js`
- Connects via SDK `Client` / `StdioClientTransport`
- Provides `callTool(name, args)` that returns parsed JSON
- Provides `listTools()`
- Serializes operations per `tempRoot` to avoid registry write races
- Cleans up child process

The helper is ESM. The 4 broken test files are a mix of ESM (`.js`) and CJS (`.cjs`). For CJS files, dynamic `import()` of the helper works (the existing `mcp-protocol-e2e.test.cjs` pattern).

---

## 5. Recommended cleanup order

1. **Fix the deadlock now** — convert the 4 broken tests to `withMcpServer`.
2. **Add `--test-timeout=30000`** to `package.json` `test` script so any future hang fails fast.
3. **Convert `meta-state-list-id-stdio.test.js`** to `withMcpServer` in the same PR (pure debt cleanup, no behavior change).
4. **Refactor `.factory/hooks/loop-surface-inject.cjs`** in a follow-up. Keep its security/timeout/unref semantics; swap the hand-rolled JSON-RPC for SDK `Client`/`StdioClientTransport`.

---

## 6. Non-MCP spawns found (not in scope)

These were flagged by the `stdio: pipe` search but are not MCP JSON-RPC clients:

- `.factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs` — tests the hook, not hand-rolled MCP itself.
- `.claude/coordination/__tests__/{write-coordination-gate-minimal,preflight-gate,artifact-aware-gate}.test.cjs` — spawn coordination-gate hooks.
- `.claude/coordination/hooks/*.cjs` + `.factory/hooks/*.cjs` — coordination gates using `execFileSync` shims.
- `tools/learning-loop-mcp/scout/test-fixtures/mini-codebase/__tests__/bucket-d.test.js` — spawns `droid exec`.
- `tools/learning-loop-mcp/__tests__/{fix-loop-design-refs,backfill-mechanism-check}.test.js` — spawn standalone scripts.

No action needed for these.

---

## 7. Unresolved questions

1. Should `meta-state-list-id-stdio.test.js` be converted in the same PR as the deadlock fix, or deferred to keep the PR focused?
2. Should `.factory/hooks/loop-surface-inject.cjs` be refactored to the SDK client now, or tracked as a follow-up finding?
3. The shared `withMcpServer` helper does not set `MASTRA_STORAGE_DRIVER=memory`. Should it default to `memory` for tests to avoid SQLite contention, or leave that to callers?
4. Should the global `--test-timeout=30000` be applied only to the `test` script, or also to `test:cold-session`?
5. Do any of the 4 broken tests intentionally test wire-format edge cases that the SDK client would hide? (Initial scan: no — they test tool behavior and registry state, not transport framing.)
