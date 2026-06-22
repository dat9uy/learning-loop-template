# Debug Report — `meta-260621T1743Z` pnpm test deadlock

**Date:** 2026-06-21
**Finding:** `meta-260621T1743Z-the-full-pnpm-test-glob-fired-by-pre-commit-hook-package-jso`
**Trigger:** pre-commit `pnpm test` hung 56+ min, required `--no-verify`
**Report type:** root-cause + scope verdict

---

## 1. Scope verdict: distinct from the brainstorm report

The finding is **related but separate** from `plans/reports/brainstorm-260621-1355-GH-2246-pnpm-test-glob-problem-report.md`.

| | Brainstorm report | This finding |
|---|---|---|
| Target finding | `meta-260620T2108Z-the-full-pnpm-test-glob-...` | `meta-260621T1743Z-...` |
| Failure mode | slow (10 min) **but completes** | **deadlock — never completes** |
| Root cause territory | Layer 1 agent↔runner interface + Layer 2 agent degenerate loops | Hand-rolled MCP stdio clients in 4 tests are non-compliant with server stdout/log line |
| Operator framing | slowness is a deliberate catch-mechanism | this is a bug that blocks every commit |

The finding itself says it is separate from the slow-suite finding. Confirmed. The brainstorm §11 mentions "test runner has no loop protection" as a symptom class, but the actual mechanism here is a parser/protocol error in the tests, not an agent loop.

---

## 2. Root cause

Four tests spawn `node tools/learning-loop-mastra/server.js` and speak JSON-RPC over stdio with a hand-rolled parser. The parser has two fatal flaws against the current `@mastra/mcp` server:

1. **It keeps non-JSON stdout lines in the buffer.** The server logs `Started MCP Server (stdio)` to stdout via `this.logger.info` (`@mastra/mcp/dist/index.js`). The parser treats this as a partial line and concatenates it with the next JSON-RPC message, so the initialize response is never parsed. The test waits forever on the first `await send(0, "initialize", ...)`.
2. **It never sends the MCP `notifications/initialized` notification.** Even if the parser discarded the log line, the server waits for this notification before processing `tools/list` / `tools/call`. The tests go straight from `initialize` to `tools/call`, which also hangs.

The tests were probably written against an older/lenient server that either did not log to stdout or processed requests without the initialized notification. The current `@mastra/mcp@1.10.0` server does both.

A third contributing factor is shared SQLite. The tests set `GATE_ROOT` to a temp dir but do **not** set `MASTRA_STORAGE_DRIVER=memory`, so every spawned server opens the same `tools/learning-loop-mastra/data/mastra-memory.db`. This does not cause the observed deadlock, but it adds I/O contention and fragility when Node's test runner spawns these files in parallel.

---

## 3. Affected files correction

The finding lists one wrong path:

- ❌ Finding says: `tools/learning-loop-mcp/__tests__/claude-code-mcp-loading.test.cjs`
- ✅ Actual file: `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs`

Confirmed by `ls` and `grep`. The file is in `.claude/coordination/__tests__/` and is picked up by the `pnpm test` glob `'.claude/coordination/__tests__/*.test.cjs'`.

All four affected files share the same hand-rolled stdio parser and `send` helper:

1. `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs:72-94`
2. `tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js:96-119`
3. `tools/learning-loop-mcp/__tests__/meta-state-patch-derived-schema.test.js:48-70`
4. `tools/learning-loop-mcp/__tests__/zod-coerce-top-level.test.js:48-70`

---

## 4. Evidence

### 4.1 Reproduced the hang

```bash
timeout 30 node --test --test-timeout=30000 \
  'tools/learning-loop-mcp/__tests__/loop-get-instruction.test.js'
```

Hung until killed. The first `describe` block (direct tool handler calls) is fast; the stdio `describe` block never returns.

### 4.2 SDK client works against the same server

```bash
node sdk-repro.mjs   # (temporary script using @modelcontextprotocol/sdk Client)
```

Output:

```
connected
tools count: 41
tool result: {"content":[{"type":"text","text":"{\"count\":1,\"results\":[{\"key\":\"reopens-script\"..."}]}
```

Same server, same env (`GATE_ROOT=temp`, `MASTRA_STORAGE_DRIVER=memory`). The server is not deadlocked. The hand-rolled client is the problem.

### 4.3 Hand-rolled client parses initialize only after discarding the log line

Temporary repro confirmed:

- With parser that keeps non-JSON lines → pending id 0 never resolves (initialize response lost).
- With parser that discards non-JSON lines → initialize resolves.
- Without `notifications/initialized` → `tools/list` hangs (server waits for notification).
- With SDK client → full handshake + tool call succeeds.

### 4.4 Server startup log source

```bash
grep -R "Started MCP Server" node_modules/@mastra/mcp/dist/index.js
# this.logger.info("Started MCP Server (stdio)");
```

---

## 5. Why the finding's original hypothesis was wrong

The finding hypothesized the server child "never writes back" because of a server-side deadlock (`setTimeout` chain, synchronous wait, etc.). The server does write back; the test's parser drops the response because of the stdout log line, and even after fixing the parser the test violates the MCP initialized-notification contract. The deadlock is on the test side, not the server side.

---

## 6. Recommended fix

Three options, ordered from minimal to structural:

### Option A — minimal patch (fastest, scoped)

In each of the 4 files, change the stdout parser to:

- discard non-JSON lines instead of keeping them in `buffer`
- send `notifications/initialized` after receiving the initialize response

Also add `MASTRA_STORAGE_DRIVER: "memory"` to the child's `env` to avoid shared SQLite contention.

### Option B — shared helper

Extract the spawn + handshake logic into a test helper (e.g. `tools/learning-loop-mcp/__tests__/mcp-stdio-client.cjs`) and have the 4 tests import it. Same protocol fixes as Option A, but DRY.

### Option C — use the official MCP SDK client (preferred)

`tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs` already uses `@modelcontextprotocol/sdk Client` + `StdioClientTransport` and successfully talks to the server. Rewrite the stdio portions of the 4 tests to use the SDK client. This removes the hand-rolled protocol entirely and is the most robust against future SDK changes.

The SDK client supports `env` so `GATE_ROOT` and `MASTRA_STORAGE_DRIVER=memory` can still be passed. Tests that read `readRegistry(tempRoot)` after tool calls can keep doing so.

### Additional hardening

- Add `--test-timeout=30000` to the `test` script in `package.json` so any future hang surfaces as a test failure instead of a silent pre-commit hang.
- Update the finding's `evidence_test` to the correct path `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs`.

---

## 7. Blast radius

- Every commit on this branch until fixed (pre-commit blocks on `pnpm test`).
- PR#8 review path is blocked per operator decision in the brainstorm report.
- The 4 tests are currently dead code paths under `pnpm test`; they will all start running again once fixed, which may surface unrelated assertion failures (e.g. the `mcp-protocol-e2e.test.cjs` already shows `expected 31 tools, got 41` because workflows are also exposed as tools).

---

## 8. Unresolved questions

1. **Fix option:** Do you want minimal patch (Option A), shared helper (Option B), or SDK-client rewrite (Option C)?
2. **Test timeout value:** Is 30s acceptable for the global `--test-timeout`, or should it be larger to preserve the slow-test-as-signal behavior from the brainstorm report?
3. **Finding update:** Should I patch `meta-260621T1743Z` to correct `evidence_test` path and update the root-cause description, or leave it for the fix PR?
4. **`claude-code-mcp-loading.test.cjs` path:** The finding lists the wrong directory. Should the corrected path be noted in meta-state now?
5. **Workflow-as-tool count:** `mcp-protocol-e2e.test.cjs` currently fails on `expected 31 tools, got 41`. Is that a known/accepted mismatch, or should the manifest test count be updated?

---

**Status:** Root cause confirmed. Fix pending operator choice of Option A/B/C.
