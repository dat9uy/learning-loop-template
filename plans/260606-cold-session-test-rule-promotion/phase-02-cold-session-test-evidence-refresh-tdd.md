---
phase: 2
title: "Cold-session test evidence refresh (TDD)"
status: completed
priority: P2
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Cold-session test evidence refresh (TDD)

## Overview

Update the cold-session test (`cold-session-discoverability.test.cjs#droid exec exposes mcp__learning_loop_mcp__* tools`) to keep its persisted evidence current: delete the finding on gap-close so the gate's "no finding" check is satisfied. The test becomes a state machine: (gap open, no finding → log) | (gap open, finding exists → idempotent no-op) | (gap closed, finding exists → delete) | (gap closed, no finding → silent pass). TDD: 1 new test, written red-first.

## Requirements

### Functional
- The cold-session test, on every run, evaluates the live gap state via `droid exec --list-tools`.
- State machine (4 branches):
  1. **Gap open + no finding** → log a new finding with `subtype=mcp-client-loading` AND `session_id=test-cold-session-mcp-client-loading` (current behavior).
  2. **Gap open + finding exists** → idempotent no-op (log breadcrumb; current behavior).
  3. **Gap closed + finding exists** → DELETE the persisted finding (NEW behavior).
  4. **Gap closed + no finding** → silent pass (current behavior).
- The deletion uses `core/meta-state.js` to remove the entry (atomic; respects the per-root write queue).
- The deletion is idempotent: if the finding is already gone (race with another process), no error.
- The test still passes when the gap is open (logs a finding, which is the success path of the surface contract; the test's job is to surface the gap, not to verify it).
- The test still passes when the gap is closed (no finding; test is silent).

### Non-functional
- The deletion is atomic with the registry's per-root write queue. No read-modify-write race.
- The test continues to use the stable session_id (`test-cold-session-mcp-client-loading`) as the idempotency key. No change to the session_id scheme.
- The test's isolation contract (snapshot-based, not git-status-based) is preserved. The deletion is part of the test's normal execution; the test is still self-contained.
- The test still uses the project's `meta-state.jsonl` (not `GATE_ROOT` isolation), because the finding is the surface. Phase 2 reinforces this contract.

## Architecture

```
                    ┌──────────────────────────────────┐
                    │  droid exec --list-tools probe   │
                    └────────────────┬─────────────────┘
                                     │
                                     ▼
                    ┌──────────────────────────────────┐
                    │  hasMcpTools =                  │
                    │   out.includes("mcp__learn...") │
                    └────────────────┬─────────────────┘
                                     │
              ┌──────────────────────┴──────────────────────┐
              ▼                                             ▼
    ┌────────────────────┐                       ┌──────────────────────┐
    │ gap open           │                       │ gap closed           │
    │ (no MCP tools)     │                       │ (MCP tools listed)   │
    └────────┬───────────┘                       └────────┬─────────────┘
             │                                            │
             ▼                                            ▼
    ┌────────────────────┐                       ┌──────────────────────┐
    │ existing finding?  │                       │ existing finding?    │
    └────┬─────────┬─────┘                       └────┬──────────┬──────┘
         │         │                                  │          │
       yes         no                                yes        no
         │         │                                  │          │
         ▼         ▼                                  ▼          ▼
   ┌─────────┐ ┌────────┐                       ┌────────┐ ┌────────┐
   │ no-op   │ │ log    │                       │ DELETE │ │ silent │
   │ (idemp) │ │ finding│                       │ finding│ │ pass   │
   └─────────┘ └────────┘                       └────────┘ └────────┘
```

The 4 branches are the test's state machine. The only NEW behavior is the deletion branch (gap closed + finding exists). All other branches preserve current behavior.

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` — add the deletion branch and the new test for it.
- **Read-only:** `tools/learning-loop-mcp/core/meta-state.js` — the test uses `readRegistry`, `writeEntry` (existing); a new `deleteEntry` export may be needed (or the test reads-modifies-writes the registry directly via the same queue).

## Implementation Steps (TDD: red → green → refactor)

### Step 1: RED — write the new test (failing)

Add a 4th test to `cold-session-discoverability.test.cjs` (after the existing 3 tests). The test sets up a pre-existing finding, simulates a gap-closed probe, and asserts the finding is removed.

**Test: cold-session test deletes persisted finding on gap-close**
```js
test("cold-session test deletes persisted finding on gap-close (mocks the probe)", async () => {
  // Use GATE_ROOT isolation for the registry; the test should not pollute
  // the real project's meta-state.jsonl. This test simulates the deletion
  // branch without spawning droid exec (which is environment-dependent).
  const tempRoot = mkdtempSync(join(tmpdir(), "cold-session-delete-"));
  process.env.GATE_ROOT = tempRoot;

  // Pre-populate the registry with a finding that the test would otherwise log.
  const core = await import(pathToFileURL(join(projectRoot, "tools/learning-loop-mcp/core/meta-state.js")).href);
  const existingId = core.generateId("mcp-client-loading-missing");
  await core.writeEntry(tempRoot, {
    id: existingId,
    entry_kind: "finding",
    category: "mcp-tool-missing",
    severity: "warning",
    affected_system: "mcp-tools",
    subtype: "mcp-client-loading",
    description: "Pre-existing finding (test setup).",
    evidence_code_ref: "tools/learning-loop-mcp/server.js",
    session_id: "test-cold-session-mcp-client-loading",
    status: "active",
    auto_resolve: null,
    created_at: new Date().toISOString(),
    expires_at: null,
    acked_at: new Date().toISOString(),
    resolved_at: null,
    resolved_by: null,
    version: 0,
  });

  // Verify the finding exists before the test runs.
  const before = core.readRegistry(tempRoot);
  assert.ok(before.find((e) => e.id === existingId), "pre-test: finding should exist");

  // Simulate the deletion branch of the cold-session test: when the gap
  // closes, the test deletes the persisted finding. This is the part of
  // the test logic that does the deletion (extracted into a helper for
  // testability).
  const { deleteStaleClientLoadingFinding } = await import(pathToFileURL(join(projectRoot, "tools/learning-loop-mcp/__tests__/cold-session-discoverability-helpers.js")).href).catch(() => ({}));
  // If the helper is not yet extracted, call the logic inline:
  await deleteOrExpireFinding(tempRoot, existingId);

  // Verify the finding is removed.
  const after = core.readRegistry(tempRoot);
  assert.strictEqual(
    after.find((e) => e.id === existingId),
    undefined,
    "post-test: finding should be deleted",
  );

  // Cleanup
  delete process.env.GATE_ROOT;
});
```

Run the test file: `cd tools/learning-loop-mcp && node --test __tests__/cold-session-discoverability.test.cjs`. The new test FAILS (the `deleteOrExpireFinding` helper does not exist yet, and the inline logic is a placeholder). The other 3 tests still pass.

### Step 2: GREEN — implement the deletion helper and wire it into the test

**Option A: Add a `deleteEntry` function to `core/meta-state.js`** (reusable across the codebase):
```js
/**
 * Atomically delete an entry by id from the JSONL registry.
 * Returns true if deleted, false if not found.
 */
export function deleteEntry(root, id) {
  return enqueue(root, () => {
    const path = getRegistryPath(root);
    const entries = readRegistry(root);
    const filtered = entries.filter((e) => e.id !== id);
    if (filtered.length === entries.length) return false; // not found
    const tmpPath = path + ".tmp";
    writeFileSync(tmpPath, filtered.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
    renameSync(tmpPath, path);
    return true;
  });
}
```

**Option B: Use the existing `updateEntry` to mark the finding as expired (status=expired, resolved_at=now).** This is a soft delete; the finding is preserved in the registry with a terminal status. The compaction (terminal entries older than 7 days) eventually removes it. The gate's `checkResolutionEvidence` already filters on `status in [active, reported]`, so an expired finding is not blocking.

**Recommendation: Option B (soft delete via `updateEntry`).** Rationale:
- The registry is an audit log; deleting entries loses history. Soft-delete preserves the audit trail.
- The 7-day compaction already handles terminal entries. The "expired" status is the canonical soft-delete for findings (24h TTL on `reported`, but we can also explicitly mark `active` findings as `expired`).
- The gate's check is read-only; the test is responsible for the soft-delete.

Soft-delete implementation:
```js
// In the cold-session test, when gap is closed + finding exists:
await core.updateEntry(root, finding.id, {
  status: "expired",
  resolved_at: new Date().toISOString(),
  resolved_by: "auto-cold-session-test",
  _expected_version: finding.version ?? 0,
});
```

Update the test's deletion branch to use this pattern. The test now marks the finding as `expired` (soft-delete); the gate's `checkResolutionEvidence` no longer sees it as blocking.

Run the test file again: the new test PASSES. The other 3 tests still pass.

### Step 3: REFACTOR — clean up

- Extract the "find and soft-delete the stale finding" logic into a small helper function (in the test file, or as a separate utility in `__tests__/cold-session-discoverability-helpers.js` if it grows).
- Ensure the test's idempotency guard handles the case where the finding was already soft-deleted (race with another process): if `updateEntry` returns `"version_mismatch"` or `null`, the test treats it as a no-op (the finding is already gone, which is the desired end state).
- Run the full cold-session test file to confirm no regressions in the existing 3 tests.

## Success Criteria

- [ ] `cold-session-discoverability.test.cjs` has a 4th test that asserts the deletion branch
- [ ] The deletion branch uses `core/meta-state.js#updateEntry` (soft-delete via `status=expired`) — NOT a hard delete
- [ ] The test's state machine has all 4 branches correctly implemented:
  - Gap open + no finding → log
  - Gap open + finding exists → idempotent no-op
  - Gap closed + finding exists → soft-delete
  - Gap closed + no finding → silent pass
- [ ] Existing 3 cold-session tests still pass (no regression)
- [ ] Test isolation: the new test uses `GATE_ROOT` for its own registry; the existing 3 tests continue to write to the real project's `meta-state.jsonl` (their established contract)
- [ ] `git status --porcelain` after the test run shows only the expected mutations (the test's own writes + soft-deletes)

## Risk Assessment

- **Risk 1:** The soft-delete (status=expired) could be reversed by a future process that re-acks the finding. Mitigation: the test's idempotency guard keys on session_id; if a future process re-creates the finding, the test will see it as a "gap open + finding exists" branch and be idempotent.
- **Risk 2:** The soft-delete uses `updateEntry` with `_expected_version`. If the entry was modified between the `readRegistry` and `updateEntry` calls, the CAS check fails. Mitigation: the test logs a breadcrumb and treats the CAS failure as a no-op (the finding's state may have changed in a way that satisfies the gate's check anyway).
- **Risk 3:** The deletion is a write to the real project's `meta-state.jsonl` (the existing 3 tests do this for the "log finding" branch). The new deletion is a different kind of write. Mitigation: the test's snapshot-based isolation (from the prior turn's update) is preserved; the test's git-status check still catches unintended leaks.
- **Risk 4:** The 4-branch state machine is more complex than the current 2-branch behavior. Future readers may be confused. Mitigation: the state machine diagram is in this phase's Architecture section; the test code mirrors the diagram with named branches.

## TDD Tests Added (this phase)

| Test File | Test | Asserts |
|-----------|------|---------|
| `__tests__/cold-session-discoverability.test.cjs` (extend) | cold-session test soft-deletes persisted finding on gap-close | pre-populated finding + simulated gap-close + assert removal |

**Total: 1 new test.** TDD discipline: test is written FIRST (red), the deletion helper is added (green), the state machine is documented in the code (refactor).
