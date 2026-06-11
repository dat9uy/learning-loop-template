---
phase: 3
title: "Rewrite 16 test files to stale-only"
status: pending
priority: P2
effort: "3h"
dependencies: [2]
---

# Phase 3: Rewrite 16 test files to stale-only

## Overview

After Phase 1's schema enum change drops `"expired"`, every test fixture that writes `status: "expired"` fails Zod validation at parse time. Rewrite the 16 affected test files to use `status: "stale"` (the modern equivalent), drop the `include_expired` parameter (renamed/deprecated in Phase 1; removed here), drop the migrate-tool test (deleted in Phase 2), and restructure the cascade tests to assert the 1-step path.

## Requirements

- Functional:
  - Every `status: "expired"` fixture across the 16 test files is changed to `status: "stale"`.
  - Every `include_expired: true` / `include_expired: false` call site is changed to either drop the parameter (the new default behavior already includes stale) or, where the test was asserting the default, simply remove the param.
  - Every test-local `TERMINAL_STATUSES` literal (e.g., `new Set(["auto-resolved", "expired", "resolved", "superseded"])`) drops `"expired"`.
  - The `meta-state-resolve-cascade.test.js` cascade tests are restructured:
    - "cascade_from on non-expired parent falls through to normal resolution" (line 374) is renamed to "cascade_from on stale parent closes in 1 step" and re-asserts `{resolved: true, status: "resolved"}` for a `stale` parent.
    - "meta_state_resolve with no cascade_from and expired status still returns already_terminal" (line 426) is deleted (no `expired` status to test).
    - "cascade_from on non-expired parent falls through" is the canonical positive case for stale.
  - The `meta-state-relationship-validate-tool.test.js` tests are renamed: "warns when description references an expired id" becomes "warns when description references a stale id"; the L5 comment "stale (not just expired) also flagged as orphan" becomes "stale flagged as orphan".
  - The `meta-state-schema.test.js` assertion `statusLifecycle.includes("expired")` (line 43) is removed; the assertion `relationshipScript.includes("migrate_expired_to_stale")` (line 61) is removed.
  - The `loop-describe-warm-tier.test.js` `pending_expired_migration` test (lines 84-111) is deleted.
  - The `meta-state-archive-tool.test.js` `include_expired: true` (lines 146, 180) drops the param.
  - The `meta-state-list-compact.test.js` (lines 97, 145, 147, 159, 174, 203) and `meta-state-list-entry-kind.test.js` (line 105) and `meta-state-integration.test.js` (lines 71-72) and `loop-describe.test.js` (line 325) all drop the `include_expired` param.
  - The `gate-resolution-evidence.test.js` "returns satisfied when finding is expired (terminal status)" (lines 115, 128) is renamed to "returns satisfied when finding is stale (non-terminal)" — but wait, `stale` is non-terminal, so the consult-gate test scenario flips. The test should be rewritten to assert that a `stale` finding does NOT satisfy the consult-gate (because the gate requires a terminal status, and stale is not terminal). Actually the existing rule pattern is `resolution-evidence-required` and the consult-gate logic in `checkResolutionEvidence` is about session_id-keyed MCP client loading findings; revisit the test's intent during implementation.
  - The `query-drift.test.js` T-22 "Terminal status (expired) is filtered out before drift check" (lines 341-345) is renamed to "Terminal status (superseded) is filtered out before drift check" and uses `status: "superseded"` (the closest remaining "definitely not drift" case).
  - The `meta-state-report-tool-extension.test.js` description "reopens a previously expired finding" (line 131) is rewritten to "reopens a previously stale finding".
  - The `meta-state-reopen-e2e-cold-session.test.cjs` (the `test.skip` at line 9) — this test is left in its `test.skip` form for now; Phase 5 un-skips it and runs it for real.
  - The `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs` fixture that writes `status: "expired"` (line 268) is changed to `status: "stale"` (the test is a stub simulating a past-TTL MCP connection finding; the test logic is unchanged).
- Non-functional:
  - `pnpm test` passes after this phase (modulo the E2E test in `meta-state-reopen-e2e-cold-session.test.cjs`, which is gated on `META_STATE_E2E=1` and remains `test.skip`'d until Phase 5).
  - `grep -rn 'status: "expired"\|"expired"\|include_expired\|expired-migrate' tools/learning-loop-mcp/ scripts/ AGENTS.md .factory/ docs/meta-state-lifecycle.md` returns 0 matches in active code and tests.
  - The 16 test files are rewritten, not deleted (except the migrate-tool test, which is already deleted in Phase 2; and the `loop-describe-warm-tier.test.js` `pending_expired_migration` test, which is one test in a multi-test file).

## Architecture

### File list (19+ test files, updated by red-team review)

The affected test files (each has 1+ references to `expired` that need updating):

1. `tools/learning-loop-mcp/__tests__/meta-state-migrate-expired-to-stale-tool.test.js` — **DELETED in Phase 2**
2. `tools/learning-loop-mcp/__tests__/meta-state-stale-flag.test.js` — line 214 fixture update
3. `tools/learning-loop-mcp/__tests__/meta-state-reopen-e2e-cold-session.test.cjs` — **rewrite in Phase 3** (red-team finding: Phase 2 deletes the migrate tool, so the E2E's import of it fails to load at module-init time if not cleaned up here). Lines 9 (import), 36, 46, 73 (call sites) all need updates. The un-skip happens in Phase 5.
4. `tools/learning-loop-mcp/__tests__/meta-state-resolve-cascade.test.js` — heavy churn (lines 23, 33, 80, 88, 110, 119, 128, 170-186, 227-238, 297-308, 368, 374, 426, 429, 437, 454); restructure for 1-step
5. `tools/learning-loop-mcp/__tests__/meta-state-relationships.test.js` — lines 55-83 fixture update
6. `tools/learning-loop-mcp/__tests__/meta-state-relationship-validate-tool.test.js` — lines 23, 45, **46** (red-team finding: line 46 missed), 58, 101 fixture + test name + comment
7. `tools/learning-loop-mcp/__tests__/meta-state-list-compact.test.js` — lines 97, 145, 147, 159, 174, 203 param + literal
8. `tools/learning-loop-mcp/__tests__/meta-state-list-entry-kind.test.js` — line 105 param
9. `tools/learning-loop-mcp/__tests__/meta-state-integration.test.js` — lines 71-72 param
10. `tools/learning-loop-mcp/__tests__/meta-state-schema.test.js` — lines 43, 61 assertions
11. `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js` — lines 84-111 (the `pending_expired_migration` test) **DELETED** (this is one test in a multi-test file; keep the file, delete the test block)
12. `tools/learning-loop-mcp/__tests__/gate-resolution-evidence.test.js` — lines 115, 128 fixture + test rename. **Red-team caveat**: verify the test's actual assertion; the test's "flip intent" framing in the original plan is wrong. `checkResolutionEvidence` filters on `active || reported`, so a `stale` fixture changes the assertion shape, not just the label. The test may pass unchanged — verify before editing.
13. `tools/learning-loop-mcp/__tests__/query-drift.test.js` — lines 341-345 fixture + test rename
14. `tools/learning-loop-mcp/__tests__/loop-describe.test.js` — line 325 param
15. `tools/learning-loop-mcp/__tests__/meta-state-archive-tool.test.js` — lines 146, 180 param
16. `tools/learning-loop-mcp/__tests__/meta-state-report-tool-extension.test.js` — line 131 description text
17. `tools/learning-loop-mcp/core/__tests__/meta-state-g8-supersede.test.js` — line 74 fixture (red-team finding: missed in original plan)
18. `tools/learning-loop-mcp/core/meta-state.test.js` — line 124 literal (red-team finding: missed in original plan)
19. `tools/learning-loop-mcp/__tests__/g8-subcommand-class-entry.test.js` — line 29 comment (red-team finding: missed in original plan; historical comment about `expired` to `superseded` transition; can be left as audit trail or updated)
20. `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs` — line 268 fixture (separate test suite, runs in preflight-gate context). **Red-team caveat**: this fixture is a soft-delete that needs a terminal status, not `stale`. Verify the surrounding test assertion before changing the fixture — if a `stale` fixture breaks the assertion, keep the existing fixture (this is the preflight-marker test, conceptually different from the meta-state status enum).

(The list is 20 because #1 was already deleted in Phase 2; #3, #6, #17, #18, #19, #20 are the red-team additions / caveats; #11 has one test deleted, not the whole file.)

### Cascade test restructure

The current `meta-state-resolve-cascade.test.js` has these `expired`-themed tests:

- "cascade_from with valid child + expired parent" (line 22) — asserts `{migrated_via_cascade: true, status: "stale"}` after step 1, then `{resolved: true, status: "resolved"}` after step 2. The 2-step shape.
- "cascade_from with unresolved child returns cascade_child_unresolved" (line 167) — iterates `["reported", "expired", "stale", "superseded"]` and asserts the cascade rejects each. The `expired` case is now impossible; drop it from the loop. The `stale` case should still be rejected (a stale child cannot close its parent).
- "cascade_from on non-expired parent falls through to normal resolution" (line 374) — asserts `{resolved: true, status: "resolved"}` for an `active` parent. This is the existing 1-step case; rename to "cascade_from on active parent closes in 1 step" and add a sibling test "cascade_from on stale parent closes in 1 step" that asserts the same shape for a `stale` parent.
- "meta_state_resolve with no cascade_from and expired status still returns already_terminal" (line 426) — asserts `expired` is terminal. Delete; the new test for `stale` not being terminal is implicit in the cascade test (the cascade reaches the normal resolve path because stale is not in `TERMINAL_STATUSES`).

The new test "cascade_from on stale parent closes in 1 step" is the exact reverse of the current 2-step test: it asserts `{resolved: true, status: "resolved"}` from a single `meta_state_resolve({id: staleParent, cascade_from: [childId]})` call, with no intermediate `metaStateMigrateExpiredToStaleTool.handler` call.

**New test for the `reported`-parent guard (Phase 1's new defensive check)**: "cascade_from on reported parent returns cascade_parent_is_reported". The test writes a `reported` parent (with TTL pressure) and a child whose `reopens` contains the parent. The cascade must return `{resolved: false, reason: "cascade_parent_is_reported", id, hint: <text>}`. This test guards the new behavioral change introduced by Phase 1's retarget.

## Related Code Files

### Modify (16 test files)
See the file list in the Architecture section.

### Delete
- (none in this phase — Phase 2 already deleted the migrate-tool test)

## Implementation Steps

1. **Run `pnpm test`** to capture the current test pass/fail baseline (many tests will fail because of the Phase 1 schema change; that's expected).
2. **For each of the 16 test files**: read the file, identify every `expired` reference, and rewrite. Use the Architecture section's per-file notes as a checklist.
3. **Special handling for `meta-state-resolve-cascade.test.js`**: this file is heavy churn. Read it end-to-end first; then rewrite the 4 cascade tests to drop `expired` and add the new "stale parent closes in 1 step" test. The new test should mirror the existing "active parent" test (line 374) but with `status: "stale"` and `created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()` (to be plausibly stale).
4. **For `loop-describe-warm-tier.test.js`**: delete only the `pending_expired_migration` test block (lines 84-111). Keep the file and the other tests.
5. **Run `pnpm test`** to confirm the test suite passes. If any tests fail, fix them per the Architecture notes.
6. **Run the regression-prevention grep**: `grep -rn '"expired"\|status:.*expired\|include_expired\|expired-migrate' tools/learning-loop-mcp/__tests__/ tools/learning-loop-mcp/core/ tools/learning-loop-mcp/tools/ .claude/coordination/__tests__/`. Expected: 0 matches. If matches exist, fix.
7. **Commit** with message: `test(meta-state): rewrite 16 test files to stale-only fixtures (phase 3)`.

## Success Criteria

- [ ] `pnpm test` passes (all tests except `meta-state-reopen-e2e-cold-session.test.cjs`, which is `test.skip`'d until Phase 5).
- [ ] `grep -rn '"expired"\|include_expired' tools/learning-loop-mcp/__tests__/ tools/learning-loop-mcp/tools/ tools/learning-loop-mcp/core/ tools/learning-loop-mcp/__tests__/ 2>/dev/null` returns 0 matches.
- [ ] `grep -rn 'status: "expired"\|status: "expired",' tools/learning-loop-mcp/__tests__/ 2>/dev/null` returns 0 matches.
- [ ] `pnpm test:cold-session` (the discoverability test) still passes (the cold-session test was updated in earlier plans to assert agent behavior, not registry contents, so it should be unaffected by this phase's changes).

## Risk Assessment

- **Risk**: the cascade test restructure could miss a path. The current 2-step test asserts both step 1 (`migrated_via_cascade: true, status: "stale"`) and step 2 (`resolved: true, status: "resolved"`); the new 1-step test only asserts the final state.
- **Mitigation**: the new test asserts the registry entry's final state (`status: "resolved", resolved_at: <iso>, resolved_by: "operator"`), which is the same end-state as the 2-step test's step 2. If the cascade path is correctly retargeted, both shapes converge to the same registry state.
- **Risk**: removing `include_expired` from `meta_state_list` (Phase 1 deprecated it; Phase 3 removes it) might break a test that explicitly asserts the parameter is deprecated.
- **Mitigation**: the deprecation warning is a soft signal, not a test assertion; no test asserts the warning is present. Removing the parameter is safe.
- **Risk**: the `gate-resolution-evidence.test.js` rename flips the test's intent (the original asserts `expired` satisfies the consult-gate; the rewrite should assert `stale` does NOT satisfy, since stale is non-terminal).
- **Mitigation**: read the test's full context during implementation; the consult-gate's `checkResolutionEvidence` logic in `core/gate-logic.js` may need a corresponding tweak (consult the implementation before assuming the test just renames). If a code change is needed, scope it as a Phase 3 sub-step, not a new phase.
