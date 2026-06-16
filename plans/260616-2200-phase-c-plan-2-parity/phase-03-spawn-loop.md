---
phase: 3
title: "Dual-Server Spawn Loop"
status: pending
priority: P1
effort: "1h"
dependencies: ["2"]
---

# Phase 3: Dual-Server Spawn Loop

## Overview

Ship `tools/learning-loop-mastra/__tests__/with-both-mcp-servers.js` — a test helper that spawns BOTH `learning-loop-mcp` AND `learning-loop-mastra` in the same test process, sharing a single `GATE_ROOT` so both servers read/write the same registry. Extends the `withMcpServer` pattern from `tools/learning-loop-mcp/__tests__/wire-format-top-level-coercion.test.js:32-122` (single-server) to a dual-server variant.

## Why a separate spawn helper

The existing `withMcpServer` helper handles one server. The parity gate needs both running in the same test, with:
- **Same `GATE_ROOT`** — both servers see the same `meta-state.jsonl` + `runtime-state.jsonl`. A `meta_state_report` call against either server lands in the same registry.
- **Independent client connections** — two `Client` instances from `@modelcontextprotocol/sdk`, each pointed at its own `StdioClientTransport`. No shared state at the MCP layer.
- **Sequential test orchestration** — the helper exposes `fn({ legacy: client, mastra: client, ... })` so tests can call both servers in sequence, not parallel (parallel writes to `meta-state.jsonl` would interleave).

## Requirements

- **Functional:** the helper spawns both servers, exposes a `call(name, args, { server: "legacy" | "mastra" })` function, exposes `listTools({ server })` for `tools/list`, and cleans up both child processes on test end.
- **Non-functional:** fails fast if either server fails to start within 5 seconds. No flaky warmup (300ms is enough; verified by Phase 1's existing `withMcpServer` pattern).

## Architecture

```
with-both-mcp-servers.js
├── withBothMcpServers(fn) {
│     ├── tempRoot = mkdtempSync(...)                    // shared GATE_ROOT
│     ├── legacyServer = spawnLegacyServer(tempRoot)     // child process 1
│     ├── mastraServer = spawnMastraServer(tempRoot)     // child process 2
│     ├── legacyClient = new Client(...) ; connect(legacyTransport)
│     ├── mastraClient = new Client(...) ; connect(mastraTransport)
│     ├── wait for both servers to respond to "initialize"
│     ├── try { await fn({ legacy, mastra, tempRoot, listTools, call }) }
│     └── finally { legacyClient.close(); mastraClient.close();
│                   legacyServer.kill(); mastraServer.kill(); }
│   }
├── spawnLegacyServer(tempRoot) → child process
│     └── command: "node", args: [PROJECT_ROOT + "/tools/learning-loop-mcp/server.js"]
│         env: { ...process.env, GATE_ROOT: tempRoot }
└── spawnMastraServer(tempRoot) → child process
      └── command: "node", args: [PROJECT_ROOT + "/tools/learning-loop-mastra/server.js"]
          env: { ...process.env, GATE_ROOT: tempRoot }
```

## Related Code Files

- Create: `tools/learning-loop-mastra/__tests__/with-both-mcp-servers.js` (~150 lines)
- Create: `tools/learning-loop-mastra/__tests__/with-both-mcp-servers.test.js` (smoke test: both servers start, both respond to `tools/list`)

## Implementation Steps

1. **Refactor `withMcpServer` (in `wire-format-top-level-coercion.test.js`) into a reusable helper.** The current helper is inline (32-122). Extract the spawn + handshake + cleanup pattern into a function that takes `(serverEntry, env, fn)`.
   - **Question:** where to put the extracted helper? Two options:
     - (a) New file `tools/learning-loop-mastra/__tests__/with-mcp-server.js` (single-server primitive); Plan 2's tests import it.
     - (b) Inline in `with-both-mcp-servers.js` (no new file; both servers use the same primitive).
   - **Recommendation: (a).** Single-server primitive is reusable; the dual-server helper composes it. Phase 5 (cold-session test) uses the single-server primitive alone.
2. **Write 1 smoke test (RED):** both servers start, `tools/list` returns non-empty arrays for both.
3. **Implement `with-both-mcp-servers.js`** (~150 lines): two `Client` instances, two `StdioClientTransport` instances, two child processes, shared `GATE_ROOT`. Cleanup in `finally`.
4. **Run smoke test, confirm GREEN.**
5. **Verify no regression:** existing `wire-format-top-level-coercion.test.js` (6 tests) still passes.

## Success Criteria

- [ ] Smoke test passes: both servers respond to `tools/list` with non-empty arrays
- [ ] Existing 6 stdio tests in `wire-format-top-level-coercion.test.js` still pass (no regression from the refactor)
- [ ] Cleanup: both child processes killed on test end (no orphaned processes)
- [ ] Shared `GATE_ROOT`: a `meta_state_report` call to legacy is visible to mastra (and vice versa)
- [ ] No flake: 5 consecutive runs of the smoke test all pass within 1 second each

## Risk Assessment

- **Risk:** both servers writing to the same `meta-state.jsonl` simultaneously produces interleaved JSON. **Mitigation (per R-03 default + validation):** the helper exposes sequential `await fn(...)` semantics AND the `call(name, args, { server })` function holds an in-process mutex (a single in-flight promise; subsequent calls queue) when `GATE_ROOT` is shared. The mutex applies to **all calls** (read AND write) for consistency — read-only `tools/list` calls also queue. The mutex is ~5 lines; data integrity > convenience.
- **Risk:** MCP `Client` from `@modelcontextprotocol/sdk` may have warmup quirks (LIM-5 hardening track notes 300ms warmup fragility). **Mitigation:** the helper waits for `initialize` to complete (the MCP handshake) before invoking `fn`. 300ms is enough; verified by Phase 1's existing pattern. **R-08 flake budget (5 consecutive runs within 1s each):** if a flake surfaces in CI, the recovery playbook is (a) bump warmup to 1000ms, (b) check if both servers are sequentializing the `initialize` handshake, (c) check `mkdtempSync` cleanup (orphaned temp dirs cause disk pressure). If 5/5 fail in CI, the budget is too small — bump to 20+ runs and re-evaluate.
- **Risk:** pnpm install for `@mastra/*` may be blocked by the bash gate. **Mitigation:** Phase 1 already shipped; if `tools/learning-loop-mastra/server.js` exists and works in isolation, this phase inherits. If the bash gate blocks, follow Phase 1's documented fallback (install in `/tmp/mastra-install.<hash>/` and symlink).

## Security Considerations

- The dual-server spawn creates 2 child processes per test. Each has `GATE_ROOT` set to a `mkdtempSync` directory; no shared host filesystem state.
- No privileged operations; no network calls; no vendor API access.
- The shared `GATE_ROOT` is the same `mkdtempSync` directory; both servers see the same registry. This is the intended test setup; the `meta-state.jsonl` is per-test, not per-server.

## Next Steps

Phase 4 uses the harness + spawn helper to run `tools/call` parity tests. Phase 5 uses the single-server primitive (extracted in Step 1) for the parallel cold-session test. Phase 6 uses the dual-server helper for the collision test.
