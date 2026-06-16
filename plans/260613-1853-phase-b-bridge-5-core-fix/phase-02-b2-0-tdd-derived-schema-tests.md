---
phase: 2
title: "B2-0 TDD Derived Schema Tests"
status: completed
priority: P1
effort: "45min"
dependencies: ["phase-01-b1-sp3-stability-check"]
---

# Phase 2: B2-0 TDD Derived Schema Tests

## Overview

Write the failing tests first. 3 new stdio regression tests in `__tests__/meta-state-patch-derived-schema.test.js` lock the contract: top-level array fields round-trip flat. Tests 1-2 send WRAPPED `{item: [...]}` input that the current passthrough accepts but the new derived union will reject — these are the true RED tests. Test 3 sends flat input to verify the post-fix contract.

The `wire-format-patch-recursion.test.js` modifications (Tests 1, 3, 1.5) are handled entirely in Phase 5 — NOT in this phase. This avoids duplicate ownership between Phase 2 and Phase 5.

## Requirements

- Functional: 3 new tests cover the wire-format scenarios
- Functional: tests use the same `withMcpServer` helper pattern as `wire-format-patch-recursion.test.js` (precedent plan 260611-2230)
- Non-functional: tests run via `pnpm test`; use only built-in Node modules (no new deps)

## Architecture

The new test file spawns the MCP server as a child process, sends JSON-RPC `tools/call` requests with `meta_state_patch` invocations on a `loop-design` entry (the only kind with top-level array fields: `proposed_design_for`, `addresses`), and reads the temporary registry back to assert the stored values are flat. This matches the architectural boundary where the bug lives: between JSON-RPC transport and Zod validation.

## Related Code Files

- **Create:** `tools/learning-loop-mcp/__tests__/meta-state-patch-derived-schema.test.js` (~120 lines; 3 stdio regression tests)
- **Read (for patterns):** `tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js` (`withMcpServer` helper)
- **Read (for schemas):** `tools/learning-loop-mcp/core/meta-state.js#metaStateLoopDesignSchema` (target kind for the 3 new tests)

## Implementation Steps

1. **Create** `tools/learning-loop-mcp/__tests__/meta-state-patch-derived-schema.test.js`:
   - Copy/adapt the `withMcpServer` helper from `wire-format-patch-recursion.test.js` (90 lines of copy-acceptable duplication per the precedent plan's decision).
   - The helper spawns `tools/learning-loop-mcp/server.js` with `GATE_ROOT` pointing to a temp directory; copies `schemas/*.schema.json` into the temp root; provides `call(id, name, args)` and exposes `tempRoot`.

2. **Write Test 1 — wrapped `proposed_design_for: {item: [...]}` is REJECTED (RED test)**:
   - Create a loop-design entry via `meta_state_propose_design` with `proposed_design_for: ["rule-A", "rule-B"]`.
   - Call `meta_state_patch` with `patch: { proposed_design_for: { item: ["rule-C", "rule-D", "rule-E"] } }` (WRAPPED input).
   - Assert `result.patched === false` or a validation error (the current passthrough ACCEPTS this and stores the wrapped object; the new derived union will REJECT it).
   - This test is RED: it asserts rejection, but the current passthrough accepts the wrapped input.

3. **Write Test 2 — wrapped `addresses: {item: [...]}` is REJECTED (RED test)**:
   - Create a loop-design entry with `addresses: ["finding-A"]`.
   - Call `meta_state_patch` with `patch: { addresses: { item: ["finding-B", "finding-C"] } }` (WRAPPED input).
   - Assert rejection (same as Test 1).

4. **Write Test 3 — flat `proposed_design_for: string[]` round-trips flat (post-fix contract)**:
   - Create a loop-design entry via `meta_state_propose_design` with `proposed_design_for: ["rule-A", "rule-B"]`.
   - Call `meta_state_patch` with `patch: { proposed_design_for: ["rule-C", "rule-D", "rule-E"] }` (FLAT input).
   - Assert `result.patched === true`.
   - Read registry; assert `entry.proposed_design_for` is `["rule-C", "rule-D", "rule-E"]` (flat array, no `{item: [...]}` wrap).
   - This test is a regression guard — it passes both before and after the fix (flat inputs work with both schemas).

5. **Do NOT modify** `__tests__/wire-format-patch-recursion.test.js` or `__tests__/wire-format-top-level-coercion.test.js` in this phase. Those modifications are handled in Phase 5 commit 3 (single owner, no duplicate changes).

6. Run `pnpm test` and confirm:
   - Tests 1-2 FAIL (RED) — they assert rejection, but the current passthrough accepts wrapped input
   - Test 3 PASSES (regression guard) — flat inputs work with both schemas
   - No unrelated tests break (862 baseline; 0 change)

## Success Criteria

- [x] New test file created with 3 tests
- [x] Tests 1-2 FAIL before Phase 3 (B2-1) implementation lands (RED)
- [x] Test 3 PASSES (regression guard)
- [x] No modifications to `wire-format-patch-recursion.test.js` or `wire-format-top-level-coercion.test.js` (deferred to Phase 5)
- [x] No new dependencies introduced
- [x] Existing test suite still passes (only Tests 1-2 are red; 0 unrelated tests break)

## Risk Assessment

- **Risk: Helper duplication** — copying `withMcpServer` creates ~90 lines of duplication. **Mitigation:** accept the duplication; extracting a shared test helper is out of scope and would require updating existing tests.
- **Risk: Tests 1-2 assert rejection but the passthrough accepts** — the tests are RED because they assert `patched === false` or a validation error, but the passthrough stores the wrapped value. **Mitigation:** this is the correct TDD RED behavior — the tests lock the contract that wrapped input SHOULD be rejected.
- **Risk: SP3 mid-implementation schema change invalidates the contract** — if `metaStateLoopDesignSchema` changes shape between Phase 2 and Phase 3, the test must be updated. **Mitigation:** the test reads the schema at runtime, not at write time, so a divergence fails the test, not silently passes. Re-run after schema edits.

## TDD Discipline

This phase is RED. Tests 1-2 must fail before Phase 3 starts. Test 3 is a regression guard (passes both before and after). If Tests 1-2 pass by accident (e.g., the passthrough somehow rejects wrapped input), update the tests to assert the structural fix directly (e.g., assert that `metaStateEntrySchema` exposes 4 per-kind branches with strict-typed `proposed_design_for: z.array(z.string()).min(1)` on `metaStateLoopDesignSchema`, and that the patch tool's `schema.patch` is `z.union([...PATCH_KINDS.map(buildPatchSchemaFor)])` not `z.object({}).passthrough()`).
