---
phase: 3
title: "phase-3-test-strengthening"
status: pending
effort: "30min"
---

# Phase 3: Test Strengthening (Plan 1a review Minors 2 + 5)

## Overview

Tighten the mutex race test to deterministically exercise the race (timestamp-stamped monotonic ordering or back-to-back identical `change_target` IDs). Add 3 inverse-map coverage tests: 1 finding referenced by 2 change-logs, empty `consolidates: ""`, and duplicate ids in a single `consolidates` CSV.

## Context Links

- `plans/reports/code-reviewer-260617-1338-phase-c-plan-1a-atomic-fix-review-report.md` [Minor 2] + [Minor 5]
- `tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js:54-90` (target; non-deterministic race test)
- `tools/learning-loop-mcp/core/loop-introspect.test.js` (target; coverage gap)
- `tools/learning-loop-mcp/core/loop-introspect.js:309-317` (the inverse map under test)

## Requirements

- **Functional:** The mutex race test fails when the mutex is removed (proves the race is exercised). The 3 new inverse-map tests pass with the existing dedup bug intact (Phase 4 will fix the dedup).
- **Non-functional:** No new dependencies; pure test additions.

## Architecture

**Mutex race test (deterministic):** Option (a) — stamp each entry with a write-order timestamp and assert monotonic increase. Option (b) — add back-to-back identical `change_target` IDs and assert per-server ordering. Choose (a) for clarity; the test is server-agnostic.

```js
// New assertion in connect-mcp-server-mutex.test.js
const entries = await Promise.all(
  Array.from({ length: 20 }, () => server.callTool("meta_state_log_change", { ... }))
);
const timestamps = entries.map(e => e.timestamp);
// Assert: timestamps are monotonic (FIFO order preserved)
assert.ok(
  timestamps.every((t, i) => i === 0 || t >= timestamps[i - 1]),
  "Entries must be written in FIFO order"
);
```

**Inverse map coverage tests:** Add 3 tests to `loop-introspect.test.js`:

1. **1 finding referenced by 2 change-logs:** Two change-log entries with `consolidates: "f-1"`; the inverse map for both change-logs contains `f-1`.
2. **Empty `consolidates: ""`:** A change-log with empty string `consolidates`; the inverse map is `Map { change-log-id => [] }`.
3. **Duplicate ids in CSV:** A change-log with `consolidates: "f-1, f-1, f-1"`; the inverse map (after Phase 4's dedup fix) is `Map { change-log-id => ["f-1"] }`.

## Related Code Files

- **Modify:** `tools/learning-loop-mastra/__tests__/connect-mcp-server-mutex.test.js:54-90` (add timestamp assertion)
- **Modify:** `tools/learning-loop-mcp/core/loop-introspect.test.js` (add 3 inverse-map tests)

## Implementation Steps

1. **RED (mutex race test):** Add a timestamp assertion to `connect-mcp-server-mutex.test.js` that fails on the current non-deterministic test (the test may pass with or without the mutex). Verify the new assertion fails.
2. **GREEN (mutex race test):** The test should pass with the mutex in place (Phase 2 already shipped it). If it fails, debug the timestamp source.
3. **RED (inverse-map tests):** Add 3 tests to `loop-introspect.test.js`. The 3rd test (duplicate ids) will fail because of the dedup bug in Phase 4. Verify the 1st and 2nd tests pass; the 3rd fails.
4. **Verify:** Run `loop-introspect.test.js` — 1st and 2nd new tests pass; 3rd fails (expected; Phase 4 fixes it).
5. **Verify:** `pnpm test` runs GREEN with 0 regressions (the 3rd test's failure is expected and resolved in Phase 4).

## Success Criteria

- [ ] `connect-mcp-server-mutex.test.js` has a timestamp assertion that fails when the mutex is removed (validated by temporarily commenting out the mutex and re-running).
- [ ] `loop-introspect.test.js` has 3 new tests: 1 finding → 2 change-logs; empty `consolidates`; duplicate ids.
- [ ] Tests 1 + 2 of the new inverse-map tests pass; test 3 fails (deferred to Phase 4).
- [ ] All other test namespaces pass; 0 regressions.

## Risk Assessment

- **Risk:** The mutex timestamp source may not be reliable (e.g., server clock skew). **Mitigation:** Use the test client's local timestamp (before/after `callTool`) and assert ordering of call completion, not the server-side timestamp.
- **Risk:** The 3 new inverse-map tests are RED before Phase 4 lands. **Mitigation:** Phase 3 is committed before Phase 4 in the same PR; the failing test 3 is a known-pending state that the PR author expects to be GREEN by Phase 4. CI may flag this — document in the PR description that test 3 is intentionally RED until Phase 4. Alternative: defer the duplicate-ids test to Phase 4 (cleaner, but loses the "test demonstrates the bug" narrative).
- **Risk:** Adding to `loop-introspect.test.js` could conflict with existing test naming or setup. **Mitigation:** Read the full file before adding tests; use `describe` blocks for grouping.

## TDD Note

This phase is strict RED → GREEN for the mutex race test (timestamp assertion fails on non-deterministic timing). The 3 inverse-map tests are partial RED → GREEN: tests 1 + 2 pass on the current code; test 3 (duplicate ids) is intentionally RED and resolved in Phase 4.

## Next Steps

- Phase 4 (inverse map dedup) resolves the duplicate-ids test from Phase 3.
