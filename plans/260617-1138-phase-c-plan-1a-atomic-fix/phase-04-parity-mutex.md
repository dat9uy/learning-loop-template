---
phase: 4
title: "parity-mutex"
status: pending
priority: P1
effort: "1h"
dependencies: ["phase-03-zod-pin"]
---

# Phase 4: parity-mutex (CR-2)

## Overview

Fix CR-2 from `plans/reports/code-reviewer-260617-0131-GH-2200-phase-c-plan-2-pr-review-report.md` § GAP-2: the `withBothMcpServers` helper has a Promise-based mutex (`with-both-mcp-servers.js:49-59`) that serializes cross-server calls. **But `parity-zod-to-json-schema.test.js` does NOT use the helper** — it uses `connectMcpServer` directly and calls both servers in parallel via `Promise.all`. The mutex is bypassed.

**Why this matters:** Plan 3 will add write-side content parity (the 25 currently-skip tools). When that lands, parallel `meta_state_report` / `meta_state_patch` calls will race on `meta-state.jsonl` writes and produce flakiness or false parity failures. The race is theoretical today (read-only tools are exercised in the existing test) but becomes real with write-side coverage.

**Fix disposition (operator + code-reviewer):** **Option (b) — push the in-process serializer into `connectMcpServer` itself.** More robust than option (a) (rewrite the test to use `withBothMcpServers`) because it removes the "test author must remember to use the wrapper" footgun. The `withBothMcpServers` helper's mutex becomes belt-and-suspenders.

## Context Links

- `tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js:9, 79-80, 141-144, 166-169` — bypasses the mutex (uses `connectMcpServer` + `Promise.all`)
- `tools/learning-loop-mastra/__tests__/with-both-mcp-servers.js:49-59` — the existing mutex (Promise queue)
- `tools/learning-loop-mastra/__tests__/with-mcp-server.js` — `connectMcpServer` factory; this is where the new serializer lives
- `tools/learning-loop-mastra/__tests__/with-both-mcp-servers.test.js` — 2 smoke tests (mutex + shared GATE_ROOT); must still pass after the fix
- `plans/reports/code-reviewer-260617-0131-GH-2200-phase-c-plan-2-pr-review-report.md` § GAP-2 (R-03 PARTIAL)

## Requirements

- **Functional:** two parallel `callTool` invocations on the same `GATE_ROOT` produce serialized registry writes (no race). The serialization is per-process (in-process mutex), not per-server-side. The `withBothMcpServers` helper's existing mutex continues to work (now redundant but still correct).
- **Non-functional:** the change is in test infra only; no production code changes. The mutex adds ~1-2ms per call (negligible vs the ~50ms stdio spawn cost). The fix does NOT require any other test to be rewritten.

## Architecture

The fix is a ~10-line change to `with-mcp-server.js`:

```js
// In-process serializer: a module-level FIFO queue of in-flight operations.
// This protects tests that spawn multiple servers (legacy + mastra) with a
// shared GATE_ROOT from racing on registry writes. Per-process scope is
// intentional: each test process gets its own queue; cross-process races are
// out of scope (they don't happen in the test suite because each test gets
// its own mkdtempSync GATE_ROOT).
let inFlight = Promise.resolve();
function withMutex(operation) {
  const release = inFlight;
  const next = release.then(() => operation(), () => operation());
  inFlight = next.then(() => undefined, () => undefined);
  return next;
}

export async function connectMcpServer(entry, gateRoot) {
  // ... existing connection logic ...
  return {
    listTools: () => withMutex(() => /* original listTools impl */),
    callTool: (name, args) => withMutex(() => /* original callTool impl */),
    cleanup: () => /* unchanged */,
  };
}
```

**Why module-level queue (not per-`connectMcpServer` call)?** The race is between two `connectMcpServer` invocations that share `GATE_ROOT`. A per-call queue would only serialize within one client; the race is between the two clients. A module-level queue serializes all clients spawned in the same process. **This is intentional** — the in-process scope is a feature, not a bug: the test suite runs each test in its own process (or its own `GATE_ROOT`), so the queue never starves.

**Why not use `await` + a flag?** The Promise-chain pattern is the canonical "lock" idiom for in-process serialization in Node.js (no external dep, no race window, microtask-friendly). The flag pattern has a TOCTOU race between the check and the set.

**Why is `withBothMcpServers` mutex still useful?** Belt-and-suspenders: if a test author spawns a third server (e.g., for a 3-way parity test), the helper's mutex still serializes the 2 servers it owns. The two mutexes compose (the module-level one fires first; the helper's fires second; both are no-ops in terms of correctness).

## Related Code Files

- Modify: `tools/learning-loop-mastra/__tests__/with-mcp-server.js` (add `withMutex` + wrap `listTools` + `callTool`)
- Add: `tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js` (new; 1 RED race test)
- No production code changes. No `withBothMcpServers` changes (its mutex becomes redundant but still correct).
- No mastra peer changes (the production server doesn't use `connectMcpServer`; only the test suite does).

## Implementation Steps

1. **RED test:** in the new test file, write a race test:
   - Spawn 2 `connectMcpServer` instances with the same `GATE_ROOT` (legacy + mastra).
   - Fire 10 parallel `callTool("meta_state_log_change", {entry: <unique-id>})` calls on each (20 total).
   - Assert: all 20 entries land in `meta-state.jsonl` (no lost writes, no corrupt JSON, no test failure).
   - Run the test: should FAIL on the assertion (current code lets the 20 calls race; the registry's `readRegistry` may return an incomplete view, OR the file write may interleave and produce a parse error).
2. **GREEN fix:** add `withMutex` to `with-mcp-server.js`; wrap `listTools` and `callTool` returns. Re-run the test: should PASS.
3. **Regression check 1:** run `parity-zod-to-json-schema.test.js` (the test that bypassed the mutex) to confirm it still passes (now via the new module-level mutex, not via `withBothMcpServers`).
4. **Regression check 2:** run `with-both-mcp-servers.test.js` to confirm the helper's own mutex still works.
5. **Regression check 3:** run full `pnpm test` to confirm 0 regressions.
6. **Commit:** `fix(test-infra): serialize connectMcpServer listTools/callTool for shared GATE_ROOT` (1 commit).

## Success Criteria

- [ ] RED test fails on master (current code lets parallel calls race)
- [ ] GREEN test passes after the fix (20 parallel calls produce 20 entries, no lost writes, no corrupt JSON)
- [ ] `pnpm test` shows all 9 test namespaces pass (durable 9-namespace anchor) + 0 regressions
- [ ] `parity-zod-to-json-schema.test.js` (the test that bypassed the mutex) still passes
- [ ] `with-both-mcp-servers.test.js` (the helper's own mutex test) still passes
- [ ] Module-level `inFlight` queue is FIFO and bounded by process lifetime
- [ ] Future Plan 3 write-side content parity tests inherit the mutex automatically (no test-author discipline required)

## Risk Assessment

- **Module-level queue blocks unrelated tests in the same process.** Very low: each test spawns its own `connectMcpServer` instance, but the queue is shared. The queue is FIFO; tests in the same process serialize. Mitigation: the existing `withBothMcpServers` test confirms serialization works; the test suite runs each test file in its own process via `node --test` (per `package.json#scripts.test`).
- **Mutex makes the suite slower.** Negligible: each call adds ~1-2ms (microtask scheduling). The mastra namespace contains 75 tests per Plan 2 baseline; ~4 calls per test on average = ~300 calls × 1-2ms = ~300-600ms total. Acceptable.
- **`withBothMcpServers` mutex becomes redundant but still works.** Intentional: belt-and-suspenders. The 2 mutexes compose correctly (no deadlock; the helper's `inFlight` is local to the helper, the module's is module-level; both are FIFO).
- **Future 3-way parity test (3 servers, 1 GATE_ROOT) needs explicit serialization.** Low: the module-level queue handles 2+ servers automatically (FIFO across all clients in the process). No test-author discipline required.

## Security Considerations

- No security impact. The fix is in test infra; no production code changes; the in-process queue is bounded by process lifetime.
