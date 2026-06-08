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

Write 12 failing tests that lock the contract for `meta_state_patch` (7 tests) and `coerceParamsToSchema` (5 tests) BEFORE any implementation. All 12 must fail at the end of this phase. No production code is written in this phase. The tests are the spec; the implementation in Phase 2 just makes them pass.

## Requirements

### Functional
- 7 tests in `__tests__/meta-state-patch-tool.test.js` cover the patch tool's full surface: happy path, CAS mismatch, not found, change-log immutable, branch mismatch, full lifecycle (create→patch→resolve), validation_failed.
- 5 tests in `__tests__/wire-format-coercion-fix.test.js` cover the generic wire-format helper: array coercion, boolean coercion, number coercion (including empty-string rejection), no-op identity, real-schema regression.
- All tests use isolated temp registries (no interference with the live `meta-state.jsonl`).
- All tests must fail (Red) at the end of this phase — proving the spec is captured and the implementation doesn't yet exist.

### Non-functional
- Tests follow the existing `node --test` pattern used by 70+ tests in `__tests__/`.
- Test file naming: `meta-state-patch-tool.test.js` and `wire-format-coercion-fix.test.js` (matches existing convention).
- Tests do NOT mock `core/meta-state.js` — they exercise the real primitive via the new tool wrapper, ensuring the integration is real.

## Architecture

The 12 tests form a contract spec for the implementation. The split is intentional:
- **Patch tool tests** (7) exercise the new MCP tool's behavior end-to-end (via `readRegistry`/`updateEntry`/etc).
- **Wire-format tests** (5) exercise the `coerceParamsToSchema` helper in isolation (pure function, no I/O).

This split lets Phase 2 implement the two pieces independently and validate them independently.

```
Phase 1 deliverables:
├── tools/learning-loop-mcp/__tests__/meta-state-patch-tool.test.js
│   ├── test 1: happy path (patch a finding's evidence_journal)         [F14 — version note]
│   ├── test 2: CAS mismatch returns version_mismatch
│   ├── test 3: not found returns not_found
│   ├── test 4: change-log immutable returns change_log_immutable       [F2 — enum extended]
│   ├── test 5: branch mismatch returns branch_mismatch
│   ├── test 6: full lifecycle (create → patch → resolve, no escape hatch)
│   └── test 7: validation_failed branch                                [F8 — was untested]
└── tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js
    ├── test 1: top-level array re-hydrated from string
    ├── test 2: top-level boolean re-hydrated from string
    ├── test 3: top-level number re-hydrated from string                [F6 — empty-string case]
    ├── test 4: no-op returns original `args` reference (identity)       [F1 — required for green]
    └── test 5: real-schema regression (imports metaStateProposeDesignTool.schema)  [F7]
```

## Related Code Files

- **Create:**
  - `tools/learning-loop-mcp/__tests__/meta-state-patch-tool.test.js` (~150 lines)
  - `tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js` (~80 lines)
- **Modify:** None
- **Delete:** None

## Implementation Steps

### Step 1.1: Test infrastructure setup (10m)

Create both test files with the standard test framework imports and a shared `setupTempRegistry()` helper that:
- Uses `mkdtempSync(path.join(tmpdir(), "patch-test-"))` to create an isolated registry dir
- Returns `{ root, cleanup }` where `cleanup()` removes the dir
- Patches the test's `resolveRoot()` (or sets the env var that resolves to the temp dir)

Reference: `tools/learning-loop-mcp/__tests__/meta-state.test.js` for the existing pattern.

### Step 1.2: Write 7 patch tool tests (75m)

Use the structure from `__tests__/meta-state-propose-design-tool.test.js` as a template. Each test:
- Setup: write a baseline entry via the canonical tool (e.g., `meta_state_report` for findings, `meta_state_log_change` for change-logs)
- Action: call `metaStatePatchTool.handler({...})` with the test inputs
- Assert: assert the return shape, the registry state, and the audit log entry

**Test 1 — Happy path note (F14):** `_expected_version: 0` works for a freshly created finding because the finding/rule/loop-design schemas in `core/meta-state.js` do NOT have a `version` field; `updateEntry` reads `entry.version ?? 0` (line 279) and defaults to 0. Only `metaStateChangeEntrySchema` (line 106) carries a `version` field. The test passes by structural default-to-0, not because a version was bumped. See F14 in the Red Team Review section of `plan.md` for the architectural debt.

**Test 1 — Happy path:**
```js
// Setup: write a finding, capture version: 0
const id = await writeFinding({ description: "Test finding", ... });
// Action: patch evidence_journal with CAS
const result = await metaStatePatchTool.handler({
  id, entry_kind: "finding",
  patch: { evidence_journal: "docs/journals/test.md" },
  _expected_version: 0,
});
// Assert: returns { patched: true, version: 1 }
assert.equal(result.patched, true);
assert.equal(result.version, 1);
const updated = readRegistry(root).find(e => e.id === id);
assert.equal(updated.evidence_journal, "docs/journals/test.md");
assert.equal(updated.version, 1);
```

**Test 2 — CAS mismatch:**
```js
// Same setup as Test 1, but _expected_version: 99
// Assert: returns { patched: false, reason: "version_mismatch", current_version: 0 }
```

**Test 3 — Not found:**
```js
// Action: patch nonexistent id
// Assert: returns { patched: false, reason: "not_found", id: "nonexistent" }
```

**Test 4 — Change-log immutable (F2):**

> **Red-team finding F2:** The original test was unreachable — the patch tool's `entry_kind` enum (`z.enum(["finding", "rule", "loop-design"])`) rejected `"change-log"` at the Zod layer, so the handler's immutability branch was dead code. **Fix:** Phase 2 must extend the enum to include `"change-log"` so the handler's `if (entry.entry_kind === "change-log")` check is reachable. The schema's `.describe()` should still note "change-log is immutable (handler-level check)" so the invariant is documented.

```js
// Setup: write a change-log via meta_state_log_change
// Action: patch the change-log with entry_kind: "change-log"
// (the enum allows this; the handler enforces immutability)
// Assert: returns { patched: false, reason: "change_log_immutable" }
```

**Test 5 — Branch mismatch:**
```js
// Setup: write a finding
// Action: patch with entry_kind: "loop-design"
// Assert: returns { patched: false, reason: "branch_mismatch", expected: "loop-design", actual: "finding" }
```

**Test 6 — Full lifecycle (the integration test):**
```js
// 1. Write a finding via meta_state_report
// 2. Patch code_fingerprint via meta_state_patch (the use case from CRUD finding)
// 3. Resolve via meta_state_resolve
// Assert: all 3 succeed; no direct I/O used; final state is status: "resolved"
```

**Test 7 — `validation_failed` branch (F8 — was untested):**
```js
// Setup: write a finding
// Action: call patch with a patch object that fails metaStateEntryPatchSchema
// (e.g., patch: "not an object" — but Zod will reject before handler runs,
// so we need a value that passes Zod passthrough() but fails the per-branch
// revalidation that F4's deny-list will introduce in Phase 2.
// Phase 1 may set the placeholder; Phase 2's deny-list implementation
// will make this test reach the validation_failed branch.)
// Assert: returns { patched: false, reason: "validation_failed", id }
```

### Step 1.3: Write 5 wire-format tests (30m)

The wire-format tests exercise the helper function directly (pure function, no MCP layer). Test the helper via `tool-registry.js#coerceParamsToSchema` import. The helper will be implemented in Phase 2; for now, the tests must import a function that doesn't exist → they fail (Red).

> **Red-team finding F1:** Test 4 (no-op identity) requires `assert.equal(result, args)` — strict reference equality. The implementation MUST return the original `args` reference when no coercion happened, not a `{ ...args }` copy. Phase 2.1 must track `didCoerce` and `return didCoerce ? coerced : args;`. Otherwise Test 4 will never pass.

> **Red-team finding F7:** Tests 1-4 below use hand-rolled mock schemas (`{ _def: { typeName: "ZodArray" } }`) which match the helper's private API expectations. A future Zod 4.4.3 patch that renames `_def.typeName` → `_def.type` will silently fail-open in production while the synthetic tests still pass. **Test 5 below closes this gap** by importing the real `metaStateProposeDesignTool.schema` and asserting coercion on a real `addresses: z.array(z.string())` field.

**Test 1 — Array from string:**
```js
import { coerceParamsToSchema } from "#mcp/tool-registry.js";
const schema = { shape: { addresses: { _def: { typeName: "ZodArray" } } } };
const result = coerceParamsToSchema({ addresses: '["x", "y"]' }, schema);
assert.deepEqual(result, { addresses: ["x", "y"] });
```

**Test 2 — Boolean from string:**
```js
const schema = { shape: { mechanism_check: { _def: { typeName: "ZodBoolean" } } } };
const result = coerceParamsToSchema({ mechanism_check: "true" }, schema);
assert.deepEqual(result, { mechanism_check: true });
```

**Test 3 — Number from string (F6 — also asserts empty-string rejection):**
```js
const schema = { shape: { _expected_version: { _def: { typeName: "ZodNumber" } } } };
// Valid number string coerces
assert.deepEqual(
  coerceParamsToSchema({ _expected_version: "3" }, schema),
  { _expected_version: 3 }
);
// Empty string does NOT coerce to 0 (Number("") === 0 was a silent-corruption bug)
assert.deepEqual(
  coerceParamsToSchema({ _expected_version: "" }, schema),
  { _expected_version: "" }  // unchanged
);
```

**Test 4 — No-op for correct types (F1 — identity preserved):**
```js
const schema = { shape: { addresses: { _def: { typeName: "ZodArray" } } } };
const args = { addresses: ["x"] };
const result = coerceParamsToSchema(args, schema);
// Identity preserved (Phase 2.1 must return original `args` when no coercion happened)
assert.equal(result, args);
```

**Test 5 — Real-schema regression (F7):**
```js
import { metaStateProposeDesignTool } from "#mcp/tools/meta-state-propose-design-tool.js";
// Use the actual tool schema, not a hand-rolled mock. Closes the
// "synthetic tests pass while production fails open" gap.
const realSchema = metaStateProposeDesignTool.schema;
// addresses is z.array(z.string()).default([]) — wire format may arrive as JSON string
const result = coerceParamsToSchema({ addresses: '["x", "y"]' }, realSchema);
assert.deepEqual(result.addresses, ["x", "y"]);
```

### Step 1.4: Verify all 12 tests fail (10m)

Run `node --test 'tools/learning-loop-mcp/__tests__/meta-state-patch-tool.test.js' 'tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js'` and confirm:
- 7 patch tool tests fail (module not found: meta-state-patch-tool.js)
- 5 wire-format tests fail (coerceParamsToSchema is not exported from tool-registry.js)

If any test passes accidentally, the test is wrong — revise the test, not the implementation.

## Success Criteria

- [ ] `tools/learning-loop-mcp/__tests__/meta-state-patch-tool.test.js` exists with 7 failing tests
- [ ] `tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js` exists with 5 failing tests
- [ ] All 12 tests fail at the end of this phase (Red state)
- [ ] No production code written in this phase (test-only diff)
- [ ] Test infrastructure uses isolated temp registries (no live registry interference)
- [ ] Tests use real `core/meta-state.js` primitives (no mocks)

## Risk Assessment

### Risk: Test setup may inadvertently import the live registry

If the test's `resolveRoot()` returns the project root, the tests could pollute the live `meta-state.jsonl`. **Mitigation:** mirror the pattern from `meta-state.test.js` exactly: create temp dir, set `process.env.META_STATE_ROOT` or use a configurable `resolveRoot(root)`. If `resolveRoot()` doesn't accept a parameter, this is a known issue from prior plans — use the workaround (write the temp registry and read it back via direct `readRegistry(tempRoot)`).

### Risk: Tests may be flaky if they depend on real MCP server timing

Not applicable here — tests are direct tool-handler invocations, no MCP server round-trip.

### Risk: The 7 patch tool tests may have shared state if temp dir cleanup fails

**Mitigation:** use `try { ... } finally { cleanup() }` pattern; cleanup is idempotent.

## Test Order (recommended TDD rhythm)

1. Test 1 (happy path) — confirms the basic flow works
2. Test 3 (not found) — confirms error handling at the boundary
3. Test 4 (change-log immutable) — confirms the immutability rule (requires Phase 2 enum extension — see F2)
4. Test 5 (branch mismatch) — confirms branch validation
5. Test 2 (CAS mismatch) — confirms the CAS mechanism
6. Test 6 (full lifecycle) — integration test, written last to confirm all 5 above compose
7. Test 7 (validation_failed) — confirms deny-list / revalidation rejects identity-field mutations
8. Wire-format tests 1-5 — written after the patch tool tests, since they exercise an unrelated helper
