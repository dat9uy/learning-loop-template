---
phase: 2
title: "B2-0 TDD Derived Schema Tests"
status: pending
priority: P1
effort: "45min"
dependencies: ["phase-01-b1-sp3-stability-check"]
---

# Phase 2: B2-0 TDD Derived Schema Tests

## Overview

Write the failing tests first. 4 new stdio regression tests in `__tests__/meta-state-patch-derived-schema.test.js` lock the contract: top-level array fields round-trip flat. 2 existing wire-format tests in `__tests__/wire-format-top-level-coercion.test.js` and `__tests__/wire-format-patch-recursion.test.js` get updated to assert flat arrays (their current `{item: [...]}` assertions are symptoms of the bug). All 6 tests should fail at the end of this phase with the current passthrough `z.object({}).passthrough()` schema.

## Requirements

- Functional: 4 new tests cover the 4 wire-format scenarios documented in the brainstorm
- Functional: 2 existing tests updated to assert the post-fix contract
- Non-functional: tests run via `pnpm test`; use only built-in Node modules (no new deps)
- Non-functional: tests use the same `withMcpServer` helper pattern as `wire-format-patch-recursion.test.js` (precedent plan 260611-2230)

## Architecture

The new test file spawns the MCP server as a child process, sends JSON-RPC `tools/call` requests with `meta_state_patch` invocations on a `loop-design` entry (the only kind with top-level array fields: `proposed_design_for`, `addresses`), and reads the temporary registry back to assert the stored values are flat. This matches the architectural boundary where the bug lives: between JSON-RPC transport and Zod validation.

## Related Code Files

- **Create:** `tools/learning-loop-mcp/__tests__/meta-state-patch-derived-schema.test.js` (~150 lines; 4 stdio regression tests)
- **Modify:** `tools/learning-loop-mcp/__tests__/wire-format-top-level-coercion.test.js` (~10 lines: change `{item: [...]}` assertions in Test 1 and Test 2 to flat)
- **Modify:** `tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js` (~12 lines: change `{item: {...}}` patch object test in Test 1 + `{item: [...]}` assertions in Tests 1, 3, 1.5 to flat)
- **Read (for patterns):** `tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js` (`withMcpServer` helper)
- **Read (for schemas):** `tools/learning-loop-mcp/core/meta-state.js#metaStateLoopDesignSchema` (target kind for the 4 new tests)

## Implementation Steps

1. **Create** `tools/learning-loop-mcp/__tests__/meta-state-patch-derived-schema.test.js`:
   - Copy/adapt the `withMcpServer` helper from `wire-format-patch-recursion.test.js` (90 lines of copy-acceptable duplication per the precedent plan's decision).
   - The helper spawns `tools/learning-loop-mcp/server.js` with `GATE_ROOT` pointing to a temp directory; copies `schemas/*.schema.json` into the temp root; provides `call(id, name, args)` and exposes `tempRoot`.

2. **Write Test 1 — `proposed_design_for: string[]` round-trips flat**:
   - Create a loop-design entry via `meta_state_propose_design` with `proposed_design_for: ["rule-A", "rule-B"]`.
   - Call `meta_state_patch` with `patch: { proposed_design_for: ["rule-C", "rule-D", "rule-E"] }`.
   - Assert `result.patched === true`.
   - Read registry; assert `entry.proposed_design_for` is `["rule-C", "rule-D", "rule-E"]` (flat array, no `{item: [...]}` wrap).

3. **Write Test 2 — `addresses: string[]` round-trips flat**:
   - Create a loop-design entry with `addresses: ["finding-A"]`.
   - Call `meta_state_patch` with `patch: { addresses: ["finding-B", "finding-C"] }`.
   - Assert success and stored `addresses` is `["finding-B", "finding-C"]` (flat).

4. **Write Test 3 — stdio client passes array as JSON string, gets flat array back**:
   - This is the stdio-specific edge case where a client stringifies the array before sending.
   - Create a loop-design; call `meta_state_patch` with `patch: { addresses: JSON.stringify(["x", "y"]) }` (the outer `coerceParamsToSchema` should parse the string back to an array via the existing `coerceValue` ZodArray branch).
   - Assert stored `addresses` is `["x", "y"]` (flat).

5. **Write Test 4 — stdio client passes object, gets object back**:
   - Object fields (e.g., `applies_to`, `change_diff`) must also round-trip cleanly.
   - Create a change-log entry with `applies_to: { tools: ["tool-A"] }`.
   - Call `meta_state_patch` with `patch: { applies_to: { tools: ["tool-B", "tool-C"], surfaces: ["mcp-tools"] } }`.
   - Assert stored `applies_to` is `{ tools: ["tool-B", "tool-C"], surfaces: ["mcp-tools"] }` (deep equal).

6. **Update** `__tests__/wire-format-top-level-coercion.test.js`:
   - Test 1 (line 144-145): change assertion from `assert.deepEqual(entry.proposed_design_for, ["rule-A", "rule-B"])` (already correct) — verify it passes post-fix; the upstream call still uses `{item: [...]}`, but the outer coercion unwraps it. **No change needed here** since the call shape is the wire-format quirk and the assertion is the post-coercion flat.
   - Test 2 (line 169-170): same — assertion already expects flat; no change.

7. **Update** `__tests__/wire-format-patch-recursion.test.js`:
   - Test 1 (line 149-167): currently calls `patch: { item: { addresses: [...], description: "..." } }` and asserts the stored `addresses` is flat. The wire-format wrap on the `patch` object itself is the BUG symptom. **Change the test** to call `patch: { addresses: [...], description: "..." }` (no `{item: ...}` envelope) and assert the stored `addresses` is flat. This locks the post-fix contract: the patch tool accepts flat objects directly.
   - Test 3 (line 188-202): currently calls `propose_design` with `{item: ["rule-A"]}` and asserts flat. **Change to call with `["rule-A"]`** (flat) and assert flat — locks the contract that flat is the supported shape.
   - Test 1.5 (line 206-221): same — change `{item: []}` to `[]`.

8. Run `pnpm test` and confirm the 4 new tests FAIL with errors indicating the patch tool's passthrough schema is the blocker:
   - Test 1 should fail at `result.patched === true` with the registry storing `{item: ["rule-C", ...]}` instead of the flat array.
   - Test 2 same.
   - Test 3 same — the string-parsed array would still hit the same wrap.
   - Test 4 should fail at `deepEqual` with the registry storing the object wrapped somehow.
9. Confirm the 2 updated wire-format tests now PASS (since they assert the post-fix contract; the underlying `meta_state_propose_design` and `meta_state_patch` calls succeed via the existing `coerceParamsToSchema` outer coercion, which handles `{item: [...]}` for tools that have proper schemas).

## Success Criteria

- [ ] New test file created with 4 tests
- [ ] 4 new tests FAIL before Phase 3 (B2-1) implementation lands
- [ ] 2 existing wire-format tests updated and PASS (because they assert the post-fix contract, not the wire-format wrap)
- [ ] No new dependencies introduced
- [ ] Existing test suite still passes (only the 4 new tests are red; 0 unrelated tests break)

## Risk Assessment

- **Risk: Helper duplication** — copying `withMcpServer` creates ~90 lines of duplication. **Mitigation:** accept the duplication; extracting a shared test helper is out of scope and would require updating existing tests.
- **Risk: Test 3 string-to-array parsing depends on outer `coerceParamsToSchema`** — the new test asserts the round-trip works. The outer coercion (the `coerceValue` ZodArray branch + `unwrapItemWrap`) is preserved throughout this plan (per red-team reversal — it's tool-side coercion used by 14+ tools, NOT reader-side tolerance). Test 3 passes both before and after the fix; the fix is the structural change to the patch tool's schema, not the coercion. **Mitigation:** Test 3 is intentionally written to exercise the outer coercion (it sends a string, expects the outer coercion to parse it). It continues to pass because the outer coercion is preserved.
- **Risk: Test 4 object round-trip is independent of the array fix** — it tests that object fields work, which they already do. **Mitigation:** Test 4 is a regression guard, not a red test; it should pass before AND after the fix. Phase 2 leaves it passing; Phase 3 doesn't touch it.
- **Risk: SP3 mid-implementation schema change invalidates the contract** — if `metaStateLoopDesignSchema` changes shape between Phase 2 and Phase 3, the test must be updated. **Mitigation:** the test reads the schema at runtime, not at write time, so a divergence fails the test, not silently passes. Re-run after schema edits.

## TDD Discipline

This phase is RED. The 4 new tests must fail before Phase 3 starts. If a test passes by accident (e.g., the wire-format coercion accidentally produces flat for the right reason), update the test to assert the structural fix directly (e.g., assert that `metaStateEntrySchema` exposes 4 per-kind branches with strict-typed `proposed_design_for: z.array(z.string()).min(1)` on `metaStateLoopDesignSchema`, and that the patch tool's `schema.patch` is `z.union([...PATCH_KINDS.map(buildPatchSchemaFor)])` not `z.object({}).passthrough()`).
