---
phase: 1
title: "Red (TDD tests first)"
status: pending
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Red (TDD tests first)

## Overview

Write 4 new failing tests in `tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js`. Tests cover: (1) combined-patch with array + scalars via stdio transport round-trips a flat array (patches a **loop-design**, not a finding), (2) deeper nesting `{item:{item:[...]}}` unwraps correctly via `coerceParamsToSchema` unit test, (3) `meta_state_propose_design` with `proposed_design_for` + scalars via stdio transport round-trips a flat array, (4) pre-validation that `meta_state_propose_design` with **empty arrays** (`proposed_design_for: []` + `addresses: []`) round-trips a flat empty array (gates Bridge 5 deferral mechanism per red-team amendment 3). All tests MUST be red (failing) at the end of this phase.

**File extension is `.test.js`** (NOT `.cjs`); `.cjs` files like `cold-session-discoverability.test.cjs` are excluded from `pnpm test`'s glob. The new file MUST be picked up by `pnpm test` to satisfy the success criteria "3 new tests pass" — verified via `cat package.json | grep test` showing glob `*.test.js` only.

## Requirements

- Functional:
  - Test 1 must reproduce the documented symptom: combined-patch with array + scalars stored as `{item: {item: [a, b, c]}}` (current bug) before the fix, then assert flat array `[a, b, c]` after the fix
  - Test 2 must be a pure unit test on `coerceParamsToSchema` (no stdio spawn); verifies the helper unwraps the `{item: {item: [a, b, c]}}` chain
  - Test 3 must reproduce the same bug class in `meta_state_propose_design` (top-level `proposed_design_for` array + scalars)
  - Test 1.5 must verify the empty-array edge case for `propose_design`: `proposed_design_for: []` and `addresses: []` round-trip as flat empty arrays (pre-validation; if it fails, Bridge 5 deferral falls back to `log_change`)
- Non-functional:
  - All 4 tests use stdio transport where applicable (mirror `wire-format-coercion-fix.test.js` pattern, which uses in-process calls; the new tests use stdio because the bug reproduces only via stdio)
  - All 4 tests assert against `gate.log` for the `item_wrap_unwrapped` audit log line (post-fix visibility; assertion is best-effort — drop if `gate.log` location is not stable in test env)

## Architecture

**Test file location:** `tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js`

**Test 1: combined-patch stdio transport (patches a loop-design, not a finding)**

```
Setup:
  - Spawn MCP server via stdio (mirror cold-session test pattern)
  - Call meta_state_report to write a **loop-design** entry (warm-up; ensure registry is initialized)
    - Use a loop-design because findings don't have `addresses` in their schema
    - Loop-design schema (core/meta-state.js#metaStateLoopDesignSchema): addresses: z.array(z.string()).default([])
  - Capture loop-design id and a clean working state

Call:
  meta_state_patch({
    id: <captured-loop-design-id>,
    entry_kind: "loop-design",
    patch: {
      severity_hint: "low",  // scalar
      addresses: ["finding-A", "finding-B", "finding-C"],  // array
    },
    _expected_version: <current-version>,
  })

Assert:
  - Registry re-read shows: addresses: ["finding-A", "finding-B", "finding-C"] (flat array)
  - Registry re-read shows: NO {item: ...} wrapper
  - gate.log contains: action="item_wrap_unwrapped", field="addresses", depth=2
```

**Test 2: coerceParamsToSchema unit test**

```
Setup:
  - Import { coerceParamsToSchema } from "../tool-registry.js" (or the appropriate module path)
  - Mock schema: { addresses: { _def: { typeName: "ZodArray" } } } (matches wire-format-coercion-fix.test.js pattern)

Call:
  coerceParamsToSchema({ addresses: { item: { item: ["x", "y"] } } }, schema)

Assert:
  - result.addresses deep-equals ["x", "y"] (flat array)
  - helper unwrapped depth=2
  - (No identity check; assert on value shape per red-team medium #11 — identity is brittle)
```

**Test 3: meta_state_propose_design stdio transport**

```
Setup:
  - Spawn MCP server via stdio
  - Capture registry path and a clean working state

Call:
  meta_state_propose_design({
    title: "test-loop-design-recursion",
    description: "Test for wire-format recursion bug",
    affected_system: "mcp-tools",
    proposed_design_for: ["finding-A", "finding-B"],
    addresses: ["finding-C", "finding-D"],
  })

Assert:
  - Registry re-read shows the new loop-design entry
  - proposed_design_for: ["finding-A", "finding-B"] (flat array, NO {item: ...} wrap)
  - addresses: ["finding-C", "finding-D"] (flat array, NO {item: ...} wrap)
  - gate.log contains: action="item_wrap_unwrapped" with the appropriate fields
```

**Test 1.5: pre-validation for empty arrays (gates Bridge 5 deferral mechanism)**

```
Setup:
  - Spawn MCP server via stdio

Call:
  meta_state_propose_design({
    title: "bridge-5-pre-validation",
    description: "Pre-validation for empty-array shape; gates the Bridge 5 deferral filing mechanism",
    affected_system: "mcp-tools",
    proposed_design_for: [],  // empty array
    addresses: [],  // empty array
  })

Assert:
  - Registry shows the new loop-design entry
  - proposed_design_for: [] (flat empty array, NOT {item: []} wrap)
  - addresses: [] (flat empty array, NOT {item: []} wrap)

If this test FAILS at Phase 2 (after the fix ships):
  - The hot fix is incomplete for empty arrays
  - File a new finding (subtype: wire-format-empty-array-edge-case)
  - Step 2 of Phase 3 falls back to meta_state_log_change (no array shape) instead of propose_design
  - Surface the gap; defer Bridge 5 to a follow-up plan
```

## Related Code Files

- **Create:**
  - `tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js` (~200 lines, 4 tests; `.test.js` extension is required for `pnpm test` to pick it up)
- **Read for pattern reference:**
  - `tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js` (precedent test file; the new tests mirror this pattern but use stdio transport for tests 1, 3, and 1.5)
  - `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` (precedent for stdio transport pattern; spawn MCP server via stdio, capture stdout/stderr, assert against tool list; excluded from `pnpm test` glob — for stdio pattern reference only)
  - `tools/learning-loop-mcp/__tests__/meta-state-patch-tool.test.js` (precedent for meta_state_patch handler test pattern; uses in-process call, NOT stdio)
- **UNCHANGED (do NOT touch in this phase):**
  - `tools/learning-loop-mcp/tool-registry.js` (no implementation yet; tests must be red)
  - `tools/learning-loop-mcp/tools/meta-state-patch-tool.js`
  - `tools/learning-loop-mcp/core/gate-logic.js`

## Implementation Steps

1. Read `tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js` to confirm the existing test pattern (assertion structure, Zod schema usage, no-op identity check).
2. Read `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` to confirm the stdio transport pattern (spawn MCP server, capture stdout/stderr, run probe command).
3. Read `tools/learning-loop-mcp/tools/meta-state-patch-tool.js#handler` to confirm the return shape (`{ content: [{ type: "text", text: JSON.stringify(...) }] }`).
4. Create `tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js` with 4 tests as described in Architecture (Tests 1, 2, 3, 1.5).
5. Run `pnpm test` from the project root. Confirm 4 new tests fail with the expected symptoms:
   - Test 1 fails: registry shows `addresses: { item: { item: [...] } }` (or the test's specific assertion failure)
   - Test 2 fails: `coerceParamsToSchema` returns `args` unchanged (value-shape assertion fails)
   - Test 3 fails: registry shows `proposed_design_for: { item: { item: [...] } }` (or the test's specific assertion failure)
   - Test 1.5 fails: registry shows `proposed_design_for: { item: [] }` and `addresses: { item: [] }` (empty-array edge case)
6. Confirm NO existing tests regress (898 existing tests still pass; the new file adds 4 to the suite).
7. Commit the test file: `git add tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js && git commit -m "test(meta): add wire-format-patch-recursion regression tests (red)"`.

## Success Criteria

- [ ] `tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js` exists with 4 tests (file MUST be `.test.js`, not `.cjs` — verified via `cat package.json | grep test`)
- [ ] Test 1 (combined-patch stdio, loop-design) fails with the documented symptom: `addresses: { item: { item: [...] } }` stored in registry
- [ ] Test 2 (coerceParamsToSchema unit) fails: value-shape assertion fails because no unwrap happens
- [ ] Test 3 (propose_design stdio) fails: `proposed_design_for: { item: { item: [...] } }` stored in registry
- [ ] Test 1.5 (pre-validation, empty arrays) fails: `proposed_design_for: { item: [] }` stored in registry
- [ ] All 898 existing tests still pass (no regressions)
- [ ] `pnpm test` shows the 4 new tests in its output (confirms the `.test.js` extension is picked up by the glob)
- [ ] Git commit records the test file
- [ ] No production code modified (only test file added)

## Risk Assessment

### Risk: stdio transport pattern is fragile in test environment

The cold-session test (`cold-session-discoverability.test.cjs`) may not be a perfect template for asserting registry state via stdio. The cold-session test only checks tool list availability; it does not read the registry file post-mutation.

**Mitigation:** if stdio transport is too fragile, fall back to in-process call for tests 1, 3, and 1.5. The bug reproduces in-process too (the wire-format coercion happens in the MCP server's tool handler, which is exercised by both stdio and in-process calls). Document the in-process fallback in the test file's header comment.

### Risk: Test 2 (coerceParamsToSchema unit) requires the helper to be exported

Currently `coerceParamsToSchema` is exported from `tool-registry.js`. Verify with: `grep "export" tools/learning-loop-mcp/tool-registry.js`.

**Mitigation:** if the export is missing, the test file should use the in-process call via the tool handler (mirror `meta-state-patch-tool.test.js` pattern). This is a fallback, not a blocker.

### Risk: gate.log location varies by test runner

The `gate.log` file is written by `appendGateLog`. The test runner may use a temp directory; gate.log may not be at the expected path.

**Mitigation:** if `gate.log` location is not stable, drop the `gate.log` assertion and rely on the registry round-trip assertion only. The `item_wrap_unwrapped` log line is for production visibility, not for test verification.

### Risk (NEW per red-team amendment 7): Test 1 patches a loop-design, not a finding

The original plan's Test 1 patched a finding with `addresses`, but findings don't have `addresses` in their schema (it's on `metaStateLoopDesignSchema`). Patching a finding would skip the field in `coerceParamsToSchema` (line 58: `if (!fieldSchema) continue;`) and the bug wouldn't reproduce.

**Mitigation:** Test 1 now patches a **loop-design** entry (which has `addresses: z.array(z.string()).default([])` in its schema). The setup uses `meta_state_report` to create a loop-design, then `meta_state_patch` to update it with `addresses` + `severity_hint` scalars. Verified: `core/meta-state.js` line 169 has `addresses` in the loop-design schema, not the finding schema.
