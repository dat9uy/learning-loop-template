---
phase: 2
title: "phase-2-mutex-scope"
status: pending
effort: "45min"
---

# Phase 2: Mutex Scope Per-Connection (Plan 1a review Important + Minor 1)

## Overview

Move the `inFlight` queue from module scope in `with-mcp-server.js:14-28` to closure scope inside `connectMcpServer` so each `(serverEntry, tempRoot)` pair gets its own FIFO queue. Also fix the stale-rejection bug in `with-both-mcp-servers.js:46-60` by adopting the same `inFlight.then(() => operation(), () => operation())` pattern.

## Context Links

- `plans/reports/code-reviewer-260617-1338-phase-c-plan-1a-atomic-fix-review-report.md` [Important] + [Minor 1]
- `tools/learning-loop-mastra/__tests__/with-mcp-server.js:14-28` (target; module-level `inFlight`)
- `tools/learning-loop-mastra/__tests__/with-both-mcp-servers.js:46-60` (target; stale-rejection bug)
- `tools/learning-loop-mcp/core/meta-state.js:300-312` (server-side write queue; see Unresolved Q2 from Plan 1a review)

## Requirements

- **Functional:** Two `connectMcpServer` calls with different `tempRoot` values execute `listTools` concurrently (no module-level serialization). The stale-rejection bug in `with-both-mcp-servers.js` is fixed.
- **Non-functional:** Existing tests (`connect-mcp-server-mutex.test.js`, `with-both-mcp-servers.test.js`, `parity-zod-to-json-schema.test.js`) continue to pass.

## Architecture

**Before (module-level):**
```js
// with-mcp-server.js
let inFlight = Promise.resolve();  // shared across ALL connectMcpServer calls
function withMutex(operation) { ... }
```

**After (closure-level):**
```js
// with-mcp-server.js
export async function connectMcpServer(serverEntry, tempRoot) {
  // ... transport setup ...
  let inFlight = Promise.resolve();  // per-connection queue
  const withMutex = (operation) => {
    const release = inFlight;
    const next = release.then(() => operation(), () => operation());
    inFlight = next.then(() => undefined, () => undefined);
    return next;
  };
  // ... return { listTools, callTool } wrapping withMutex ...
}
```

**Stale-rejection fix in `with-both-mcp-servers.js`:**
```js
// Before (lines 49-59):
let inFlight = Promise.resolve();
const withMutex = async (operation) => {
  const release = await inFlight;
  inFlight = operation().finally(() => {});  // BUG: rejection propagates
  return inFlight;
};

// After:
let inFlight = Promise.resolve();
const withMutex = (operation) => {
  const release = inFlight;
  const next = release.then(() => operation(), () => operation());
  inFlight = next.then(() => undefined, () => undefined);
  return next;
};
```

## Related Code Files

- **Modify:** `tools/learning-loop-mastra/__tests__/with-mcp-server.js:14-28` (move `inFlight` into `connectMcpServer` closure)
- **Modify:** `tools/learning-loop-mastra/__tests__/with-both-mcp-servers.js:46-60` (fix stale-rejection bug)
- **Create:** `tools/learning-loop-mastra/__tests__/mutex-scope.test.js` (new RED test)

## Implementation Steps

1. **RED:** Write `mutex-scope.test.js` that:
   - Spawns two `connectMcpServer` calls with different `tempRoot` values (legacy + mastra or two legacy).
   - Calls `listTools()` on both in `Promise.all` with timestamp assertions: both `listTools` invocations start before either completes.
   - Asserts no module-level serialization.
2. **GREEN (with-mcp-server.js):** Move `let inFlight = Promise.resolve()` and `withMutex` into the `connectMcpServer` closure (lines 14-28 → inside the function body). Update `listTools` and `callTool` to use the closure-local `withMutex`.
3. **GREEN (with-both-mcp-servers.js):** Replace the closure-level `withMutex` at lines 55-59 with the same `release.then(() => operation(), () => operation())` pattern.
4. **Verify:** Run `mutex-scope.test.js` (GREEN), `connect-mcp-server-mutex.test.js` (GREEN), `with-both-mcp-servers.test.js` (GREEN if exists), `parity-zod-to-json-schema.test.js` (GREEN).
5. **Verify:** `pnpm test` runs GREEN; no regressions.

## Success Criteria

- [ ] `mutex-scope.test.js` exists and runs GREEN.
- [ ] `connectMcpServer` instances with different `tempRoot` execute `listTools` calls concurrently (timestamp assertion).
- [ ] `with-both-mcp-servers.js` does not propagate stale rejections to subsequent operations.
- [ ] All 10 test namespaces pass; 0 regressions.
- [ ] The existing mutex race test (`connect-mcp-server-mutex.test.js`) still passes 20-parallel mixed-server writes.

## Risk Assessment

- **Risk:** Moving `inFlight` to closure scope changes test timing in `connect-mcp-server-mutex.test.js`. **Mitigation:** The closure scope is per-`(serverEntry, tempRoot)`; two `connectMcpServer` calls with the same `tempRoot` still serialize (the race is intra-tempRoot, not inter-tempRoot). Verify by running the test.
- **Risk:** The stale-rejection fix in `with-both-mcp-servers.js` could surface a real race that was previously masked. **Mitigation:** The current test suite is GREEN; the fix only changes the rejection-handling path. If a real race surfaces, the mutex-scope RED test will catch it.
- **Risk:** Plan 1a review Unresolved Q2 — does the server-side write queue at `meta-state.js:300-312` already guard the cross-process race, making the test-level mutex redundant? **Mitigation:** Out of scope for Plan 1b; the test-level mutex is belt-and-suspenders; the server-side queue is server-side. The scope change is a perf optimization, not a correctness change.

## TDD Note

This phase is strict RED → GREEN:
- RED: `mutex-scope.test.js` fails on the current module-level `inFlight` (timestamps show serialization).
- GREEN: after moving `inFlight` to closure scope, the test passes.

The stale-rejection fix in `with-both-mcp-servers.js` does not need a separate RED test — it's a bug fix in the same logical change. The verification is the existing test suite continuing to pass.

## Next Steps

- Phase 3 (test strengthening) builds on the new mutex-scope test to add a deterministic race test.
