---
phase: 5
title: 'E2E coverage: cascade-close 2 stale parents from meta-260610T2301Z in 1 step'
status: completed
priority: P1
effort: 1h
dependencies:
  - 4
---

# Phase 5: E2E coverage — cascade-close 2 stale parents from meta-260610T2301Z in 1 step

## Overview

The functional fix the operator asked for is the cascade retarget in Phase 1. Phase 5 is the E2E coverage that proves it works for the exact scenario the operator surfaced: `meta-260610T2301Z-cold-session-test-1-l2-probe-flakiness-...` has `reopens: ["meta-260608T1522Z-...", "meta-260608T1618Z-..."]` — 2 stale parents that must close in 1 call. The existing `__tests__/meta-state-reopen-e2e-cold-session.test.cjs` has the right structure but is `test.skip`'d and uses `status: "expired"` fixtures with the 2-step migrate path. Rewrite it to use **synthetic fixture ids** (e.g., `meta-e2e-cascade-parent-001` and `meta-e2e-cascade-parent-002`) to avoid the live-registry collision (red-team finding: the 2 live fixture ids exist in `meta-state.jsonl` at lines 62-63, and the pre-flight guard at lines 32-34 throws on collision). The unit test in Phase 1's `__tests__/meta-state-resolve-cascade-stale.test.js` covers the live ids directly.

## Requirements

- Functional:
  - `tools/learning-loop-mcp/__tests__/meta-state-reopen-e2e-cold-session.test.cjs` is rewritten:
    - Remove `test.skip` and `META_STATE_E2E` gate (or keep the gate but flip the test to run when the env var is set; the operator's intent is to have it run for real, so remove the gate entirely).
    - The 2 fixture parents (`meta-260608T1522Z-...` and `meta-260608T1618Z-...`) are written with `status: "stale"`, not `"expired"`. Remove the `expires_at` field (not applicable to `stale`; stale has `last_verified_at`).
    - Step 3 (migrate each expired fixture to stale) is deleted.
    - Step 5 (cascade-resolve the first fixture) is changed: a single `meta_state_resolve({id: parent, cascade_from: [newId]})` call returns `{resolved: true, status: "resolved"}` directly, not the 2-step `{migrated_via_cascade: true, status: "stale"}` shape.
    - Step 6 (second resolve to close) is deleted — the cascade is now 1-step.
    - Add a second cascade assertion for the other fixture (`meta-260608T1618Z-...`) to prove the cascade works for both reopens in 1 step each.
  - The test is moved out of `test.skip` and `META_STATE_E2E` gating. The E2E guard (`META_STATE_E2E=1` env var) is removed; the test runs unconditionally in `pnpm test`.
  - The 2 fixture parents use **synthetic ids** (e.g., `meta-e2e-cascade-parent-001` and `meta-e2e-cascade-parent-002`). Do NOT use the live ids (`meta-260608T1522Z-...` or `meta-260608T1618Z-...`) — they collide with the live registry and the pre-flight guard throws.
  - The live-registry pre-flight guard at lines 32-37 is removed. The temp `GATE_ROOT` is already hermetic; the guard was a leftover from the 2-step migrate path.
- Non-functional:
  - `pnpm test` passes, including the new E2E test.
  - The test takes <5s to run (uses temp GATE_ROOT, no live registry writes).
  - The test is idempotent: re-running produces the same result (each run uses a fresh `tempRoot`).
  - The test is the canonical regression guard for the cascade retarget. If a future change reverts the cascade to a 2-step path or re-introduces `expired`, this test fails.

## Architecture

### Test structure

The test exercises the operator's exact scenario:

1. **Setup**: create 2 `stale` parents (`meta-260608T1522Z-...`, `meta-260608T1618Z-...`) in a temp registry.
2. **Validate**: lint a description referencing both parents; expect `orphans: [<both ids>]` (because neither has been reopens'd yet).
3. **Report new finding**: a new finding with `reopens: [<both ids>]` is reported. The new finding is the equivalent of `meta-260610T2301Z-cold-session-test-1-l2-probe-flakiness-...` (which, in the live registry, has exactly these 2 reopens).
4. **Relationships**: assert `meta_state_relationships({id: parent1, direction: "inbound"}).inbound.reopened_by` includes the new finding's id.
5. **Cascade-close parent 1**: `meta_state_resolve({id: parent1, cascade_from: [newId]})` returns `{resolved: true, status: "resolved"}` in 1 call. The registry entry for parent1 is updated to `status: "resolved", resolved_at: <iso>, resolved_by: "operator"`.
6. **Cascade-close parent 2**: same shape as step 5, with parent2.
7. **Verify final state**: both parents are `status: "resolved"`, the new finding is `status: "active"`, the consult-gate was consulted (no rule blocked).

### Why the E2E is the canonical regression guard

The unit tests in Phase 1 (`meta-state-resolve-cascade-stale.test.js`) prove the cascade retarget works for synthetic ids. The E2E in this phase proves it works for the exact ids the operator cares about (the 2 reopens from `meta-260610T2301Z`). If a future refactor breaks the cascade for stale parents, the unit test catches it (synthetic id), and the E2E catches it (real id, real reopens shape). Defense in depth.

### Why we drop the `META_STATE_E2E` gate

The gate was added because the test was originally E2E-against-the-live-registry, which has TOCTOU concerns (the test could write to the live registry if `process.env.GATE_ROOT` resolution went wrong). The new test uses a `tempRoot` via `process.env.GATE_ROOT = tempRoot` and `rmSync` in `finally`, so it is hermetic. The gate is unnecessary; remove it.

(If keeping the gate is preferred for CI signal: flip `test.skip` to `test()`, keep the `META_STATE_E2E !== "1"` early-return, and document that CI sets `META_STATE_E2E=1`. The plan accepts either; the success criterion is "the test runs in `pnpm test` and passes".)

## Related Code Files

### Modify
- `tools/learning-loop-mcp/__tests__/meta-state-reopen-e2e-cold-session.test.cjs` — full rewrite (see Architecture)

### Delete
- (none)

## Implementation Steps

1. **Read `tools/learning-loop-mcp/__tests__/meta-state-reopen-e2e-cold-session.test.cjs`** end-to-end to confirm the current structure (it was read during the inventory phase; the structure is `test.skip` at line 9, 2 expired fixtures written, 4 steps: validate, report, migrate, cascade-resolve+close).
2. **Rewrite the test** to the new structure:
   - Remove `test.skip` and the `META_STATE_E2E !== "1"` early-return.
   - Change fixture `status: "expired"` to `status: "stale"`. Remove `expires_at`. Add `last_verified_at: <past iso>` (stale entries have this field per the schema).
   - Change fixture `created_at: new Date(now - 48 * 60 * 60 * 1000).toISOString()` to `created_at: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString()` (a stale finding is past its 7-day staleness window, so 8 days old is plausibly stale).
   - Delete the migrate step (line 73 in the current file).
   - Change step 5 (cascade-resolve the first fixture): assert `{resolved: true, status: "resolved"}` directly. Delete the now-unnecessary step 6 (the second resolve to close).
   - Add a step 6 (the second cascade-close) for the second parent (`meta-260608T1618Z-...`) with the same shape as step 5. This proves the cascade works for both reopens in 1 step each.
   - Add a final step (step 7) that asserts both parents are `status: "resolved"` in the registry.
3. **Run the test**: `node --test tools/learning-loop-mcp/__tests__/meta-state-reopen-e2e-cold-session.test.cjs`. The test should pass in <5s.
4. **Run the full test suite**: `pnpm test`. All tests pass.
5. **Verify the operator's scenario explicitly**: with the test passing, the operator can now run the actual cascade on the live registry. The E2E proves the cascade works on the synthetic fixtures; the live cascade is `meta_state_resolve({id: "meta-260608T1522Z-...", cascade_from: ["meta-260610T2301Z-..."]})` and `meta_state_resolve({id: "meta-260608T1618Z-...", cascade_from: ["meta-260610T2301Z-..."]})` — both should return `{resolved: true, status: "resolved"}` in 1 call.
6. **Log a `meta_state_log_change` entry** for the test rewrite, with `change_target: "tools/learning-loop-mcp/__tests__/meta-state-reopen-e2e-cold-session.test.cjs"`, `change_dimension: "mechanical"`, and a `reason` documenting the 1-step cascade path.
7. **Commit** with message: `test(meta-state): e2e cascade-close 2 stale parents in 1 step (phase 5)`.

## Success Criteria

- [ ] `node --test tools/learning-loop-mcp/__tests__/meta-state-reopen-e2e-cold-session.test.cjs` passes.
- [ ] `pnpm test` passes.
- [ ] The test asserts (explicitly) that 2 stale parents are cascade-closed in 1 step each by a single `meta_state_resolve` call.
- [ ] The test uses the exact fixture ids `meta-260608T1522Z-test-1-cold-session-hangs-in-mcp-gapped-env` and `meta-260608T1618Z-corrected-diagnosis-for-meta-260608t1522z-test-1-cold-sessio` (the same reopens set as `meta-260610T2301Z-cold-session-test-1-l2-probe-flakiness-...` in the live registry).
- [ ] `ck plan status /home/datguy/codingProjects/learning-loop-template/plans/260611-1000-remove-expired-status/plan.md` shows Phase 5 as `completed` and overall progress 5/5 (100%).

## Risk Assessment

- **Risk**: the E2E test, if it ever runs against the live registry by accident, could mutate real data.
- **Mitigation**: the test uses `process.env.GATE_ROOT = tempRoot` and `rmSync(tempRoot, { recursive: true, force: true })` in `finally`. The temp root is in `os.tmpdir()`, not the project. Verify with `grep -n 'GATE_ROOT' tools/learning-loop-mcp/__tests__/meta-state-reopen-e2e-cold-session.test.cjs` that the env var is set and unset cleanly.
- **Risk**: the test's fixture ids (`meta-260608T1522Z-...` and `meta-260608T1618Z-...`) collide with the live registry's ids. If the temp GATE_ROOT resolution fails for any reason, the test could overwrite the live entries.
- **Mitigation**: the test pre-flights `liveEntries.some((e) => e.id === fid)` and throws if the live registry contains the fixture id. This is the existing guard (line 33-36 of the current file). Verify the guard is preserved in the rewrite.
- **Risk**: the new E2E is the only test that exercises the 2-reopens case. If a future change breaks the multi-reopens shape, no other test catches it.
- **Mitigation**: add a unit test in `meta-state-resolve-cascade-stale.test.js` (Phase 1's test file) that asserts the cascade works for a parent with 2 reopens. This is a small addition; fold it into the Phase 1 test file rather than creating a new test file.

## Post-Plan Action

After Phase 5 commits, the operator can run the actual cascade on the live registry:

```bash
# Cascade-close meta-260608T1522Z via meta-260610T2301Z
mcp call meta_state_resolve '{"id": "meta-260608T1522Z-test-1-cold-session-hangs-in-mcp-gapped-env", "cascade_from": ["meta-260610T2301Z-cold-session-test-1-l2-probe-flakiness-confirmed-during-meta"], "resolution": "Closed via 1-step cascade: reopens'd by meta-260610T2301Z which shipped the test 1 L2 probe flakiness fix (plan 260611-1556Z)"}'

# Cascade-close meta-260608T1618Z via meta-260610T2301Z
mcp call meta_state_resolve '{"id": "meta-260608T1618Z-corrected-diagnosis-for-meta-260608t1522z-test-1-cold-sessio", "cascade_from": ["meta-260610T2301Z-cold-session-test-1-l2-probe-flakiness-confirmed-during-meta"], "resolution": "Closed via 1-step cascade: reopens'd by meta-260610T2301Z which shipped the corrected-diagnosis fix (plan 260611-1556Z)"}'
```

Each call returns `{resolved: true, status: "resolved"}` in 1 step. The 2 stale parents are closed; `meta-260610T2301Z` remains `status: "resolved"` (it was already resolved before this plan).
