---
title: "Fix spawnAndCall chicken-and-egg deadlock in session-start hook"
date: "2026-06-06"
session: ad-hoc
status: completed
commit: c374d99
fix_id: "fix:loop-surface-inject-spawnandcall-chicken-egg"
related_entries:
  - "meta-260606T0155Z-loop-surface-inject-spawnandcall-chicken-egg (resolved finding)"
  - "meta-260606T0200Z-loop-surface-inject-spawnandcall-chicken-egg-fix (this change-log)"
  - "meta-260605T1356Z-sp0-sp3-tools-require-live-mcp-server-connection (closed empirically by this fix)"
  - "meta-260606T0200Z-loop-surface-inject-spawnandcall-chicken-egg-fix (the change-log this journal backs)"
related_plan: "plans/260605-superseded-status-and-discoverability/phase-4-mcp-connection-discoverability.md"
files:
  modified:
    - ".factory/hooks/loop-surface-inject.cjs"
    - "meta-state.jsonl"
  added:
    - ".factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs"
tests: "1 new (real-spawn end-to-end); 691 total at time of fix (16 added later by plan 260605 cook + 1 housekeeping)"
---

# Fix spawnAndCall chicken-and-egg deadlock

## Summary

`loop-surface-inject.cjs#spawnAndCall` had a chicken-and-egg deadlock that caused every SessionStart probe to hit the 10-second timeout. The hook was writing the JSON-RPC `initialize` message *inside* the `child.stdout.on("data")` handler, but the first stdout data from a freshly spawned MCP server is the *response* to `initialize` — which could never be sent, because the handler was what was supposed to trigger the send.

The fix moves the `initialize` + `tools/call` writes to a `setTimeout(sendInitAndCall, 200)` call right after `spawn()`. The 200ms delay gives the server time to register its stdin `data` listener before we write. A real-spawn regression test (`loop-surface-inject-real-spawn.test.cjs`) locks the end-to-end behavior by racing the probe against a 9-second wall clock — the old code would have failed this test at ~9s with a `wall_clock_exceeded_9s` error instead of a clean `null` return.

## Symptom

Running the hook with realistic SessionStart input (`{"hook_event_name":"SessionStart","source":"startup"...}`) produced the MCP-failure banner:

```
=== MCP connection probe failed (loop-surface-inject) ===
reason: timeout
session_id: droid-debug-probe-2026-06-06

The 5 SP0-SP3 tools (meta_state_log_change, meta_state_derive_status, meta_state_check_grounding,
meta_state_refresh_fingerprint, meta_state_query_drift) may be unreachable in this session.
...
```

…and Phase 4 of plan 260605 logged a `meta_state_report` finding (`subtype=mcp-connection`) for every session start. The banner + finding masked the underlying bug as a transient connection issue — operators (and the cook session) assumed the MCP server was genuinely down, not that the probe itself was broken.

## Root cause

The old `spawnAndCall` wrote `initialize` like this:

```js
child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  // ... size guard ...
  if (!initialized) {
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", ... }) + "\n");
    initialized = true;
    setTimeout(() => { /* tools/call */ }, 100);
  }
  // ... parse response ...
});
```

The problem: on a freshly spawned child, the *first* stdout data is the JSON-RPC response to `initialize`. The data handler is what calls `stdin.write` for `initialize`, but `initialize` has to be sent *before* the response can arrive. The handler never fires for the first chunk because `initialize` was never written. Deadlock.

The MCP server itself is fine. A manual probe that waits for the `"MCP server started"` line on stderr before writing `initialize` completes the handshake successfully (49 of 49 tools registered, `loop_describe` summary returned).

## Why the existing tests didn't catch it

The hook had two test files before this fix:

- `.factory/hooks/__tests__/loop-surface-inject.test.cjs` — unit tests of `formatBlock` and the read-tool probes. No real spawn.
- `.factory/hooks/__tests__/loop-surface-inject-mcp-failure.test.cjs` — Phase 4 of plan 260605 added 3 tests for the error-reporting branch. Uses a `spawnImpl` that throws (mocked) or returns a valid summary (mocked). **Never exercised the real `spawnAndCall` body.**

The mock-spawn path skipped the buggy `if (!initialized)` block entirely (because the mock returned a summary before the stdout handler was even attached). The bug was only visible in real spawns, which the tests didn't do. Plan 260605's "test coverage is good enough" assumption was wrong.

## Fix

Two changes in `.factory/hooks/loop-surface-inject.cjs#spawnAndCall`:

1. **Send `initialize` and `tools/call` shortly after spawn**, not inside the stdout data handler. New `sendInitAndCall` helper with `initSent`/`callSent` guards (renamed from `initialized` for clarity; semantics unchanged) and `try/catch` on `stdin.write` that rejects with `stdin_write_failed_at_initialize` or `stdin_write_failed_at_tools_call` on EPIPE. Triggered by `setTimeout(sendInitAndCall, 200)` right after `child = spawn(...)`. The 200ms delay gives the server time to register its stdin `data` listener.

2. **Removed the `if (!initialized) { ... }` block** from inside the `child.stdout.on("data")` handler. The handler now only parses incoming JSON-RPC responses (no more dual responsibility of "send then parse"). This makes the code path linear and obvious.

Plus a new test file: `.factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs` — 1 test, real spawn of the actual `tools/learning-loop-mcp/server.js`, races the probe against a 9-second wall clock. The 9s (not 10s) is intentional: leaves 1s margin before the hook's own 10s timeout, so a slow-but-not-deadlocked probe still gets a real test result.

## Verification

Empirically 2026-06-06:

- **Before fix:** hook output = failure banner with `reason=timeout`. The `loop-surface-inject.cjs:222` `if (!initialized)` block is the line that was supposed to write `initialize`; the line never executed.
- **After fix:** hook output = success block (49 tools, 8 record types, 6 active findings, 0 warnings). The handshake completes in ~250ms (200ms setTimeout + ~50ms for initialize roundtrip + 100ms before tools/call).

The 5 SP0-SP3 tools (`meta_state_log_change`, `meta_state_derive_status`, `meta_state_check_grounding`, `meta_state_refresh_fingerprint`, `meta_state_query_drift`) are now reachable via the canonical `mcp__learning_loop_mcp__*` surface in real sessions. This closes the Phase 4 gap empirically: the previous plan shipped the error-reporting branch and the banner, but the banner was triggered by the bug, not by a genuine connection failure. Now the banner only fires when there's a real connection failure.

## Meta-state changes

The commit added 2 new entries to `meta-state.jsonl` and updated 2 existing ones:

| Action | Entry | Type |
|--------|-------|------|
| Added | `meta-260606T0155Z-loop-surface-inject-spawnandcall-chicken-egg` | finding (resolved) |
| Added | `meta-260606T0200Z-loop-surface-inject-spawnandcall-chicken-egg-fix` | change-log (active) |
| Resolved | `meta-260605T1356Z-loop-describe-cold-tier-superseded-lineage-missing` | finding |
| Resolved | `meta-260605T1356Z-sp0-sp3-tools-require-live-mcp-server-connection` | finding |

The resolved finding `meta-260606T0155Z-...` has `resolved_by: "fix:loop-surface-inject-spawnandcall-chicken-egg"` (not `plan:...` like the other resolutions) because it was a hot ad-hoc fix between Phase 0 and Phase 4 of plan 260605, not a phase output.

## Blast radius

Verified by `grep -r spawnAndCall .factory/`: `spawnAndCall` is only called inside `loop-surface-inject.cjs` (the SessionStart hook). The fix is scoped to:

- `.factory/hooks/loop-surface-inject.cjs` — the function body (60 lines changed in the commit)
- `.factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs` — new test
- `meta-state.jsonl` — audit log entries

No other code path depends on the old `if (!initialized)` block. The 3 Phase 4 tests in `loop-surface-inject-mcp-failure.test.cjs` still pass (they mock `spawnImpl`; the mock path is unchanged).

## Follow-up captured (not in scope)

- **Generic "wait for stderr sentinel" pattern** for any future hook that needs to spawn an MCP server. The `setTimeout(..., 200)` is a magic number; a future helper could wait for a specific stderr line ("MCP server started" in this case) instead. Out of scope for this fix — the 200ms timeout is empirically sufficient on the current server startup profile.
- **Mock spawn in `loop-surface-inject-mcp-failure.test.cjs`** still uses `spawnImpl` injection rather than spawning the real server. A future test could swap one of the 3 mock-spawn tests for a real-spawn variant to cover the error-reporting branch end-to-end too.
- **Why no SessionStart test in `pnpm test` glob** — the test runner glob is `'tools/**/*.test.js' '.claude/coordination/__tests__/*.test.cjs' '.factory/hooks/__tests__/*.test.cjs'`. The new `.factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs` is picked up by the third glob. The test is `await`able in a normal `pnpm test` run.

## References

- Commit: `c374d99 fix(hooks): resolve spawnAndCall chicken-and-egg deadlock in session-start hook`
- Finding entry (resolved by this fix): `meta-260606T0155Z-loop-surface-inject-spawnandcall-chicken-egg` in `meta-state.jsonl:22`
- Change-log entry (this journal backs): `meta-260606T0200Z-loop-surface-inject-spawnandcall-chicken-egg-fix` in `meta-state.jsonl:23`
- Plan context: `plans/260605-superseded-status-and-discoverability/phase-4-mcp-connection-discoverability.md` (Phase 4 shipped the error-reporting branch; this fix removes the underlying cause of the banner firing)
- Plan cook journal: `docs/journals/260606-superseded-status-and-discoverability-cook.md` (records the "before/after" empirical observations)
- Code: `.factory/hooks/loop-surface-inject.cjs#spawnAndCall` (lines 200-260 after the fix)
- Test: `.factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs`
