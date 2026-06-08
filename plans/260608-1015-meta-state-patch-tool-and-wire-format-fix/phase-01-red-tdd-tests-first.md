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

Write 10 failing tests that lock the contract for `meta_state_patch` (6 tests) and `coerceParamsToSchema` (4 tests) BEFORE any implementation. All 10 must fail at the end of this phase. No production code is written in this phase. The tests are the spec; the implementation in Phase 2 just makes them pass.

## Requirements

### Functional
- 6 tests in `__tests__/meta-state-patch-tool.test.js` cover the patch tool's full surface: happy path, CAS mismatch, not found, change-log immutable, branch mismatch, full lifecycle (create→patch→resolve).
- 4 tests in `__tests__/wire-format-coercion-fix.test.js` cover the generic wire-format helper: array coercion, boolean coercion, number coercion, no-op for already-correctly-typed args.
- All tests use isolated temp registries (no interference with the live `meta-state.jsonl`).
- All tests must fail (Red) at the end of this phase — proving the spec is captured and the implementation doesn't yet exist.

### Non-functional
- Tests follow the existing `node --test` pattern used by 70+ tests in `__tests__/`.
- Test file naming: `meta-state-patch-tool.test.js` and `wire-format-coercion-fix.test.js` (matches existing convention).
- Tests do NOT mock `core/meta-state.js` — they exercise the real primitive via the new tool wrapper, ensuring the integration is real.

## Architecture

The 10 tests form a contract spec for the implementation. The split is intentional:
- **Patch tool tests** exercise the new MCP tool's behavior end-to-end (via `readRegistry`/`updateEntry`/etc).
- **Wire-format tests** exercise the `coerceParamsToSchema` helper in isolation (pure function, no I/O).

This split lets Phase 2 implement the two pieces independently and validate them independently.

```
Phase 1 deliverables:
├── tools/learning-loop-mcp/__tests__/meta-state-patch-tool.test.js
│   ├── test 1: happy path (patch a finding's evidence_journal)
│   ├── test 2: CAS mismatch returns version_mismatch
│   ├── test 3: not found returns not_found
│   ├── test 4: change-log immutable returns change_log_immutable
│   ├── test 5: branch mismatch returns branch_mismatch
│   └── test 6: full lifecycle (create → patch → resolve, no escape hatch)
└── tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js
    ├── test 1: top-level array re-hydrated from string
    ├── test 2: top-level boolean re-hydrated from string
    ├── test 3: top-level number re-hydrated from string
    └── test 4: no-op when args are already correctly typed
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

### Step 1.2: Write 6 patch tool tests (60m)

Use the structure from `__tests__/meta-state-propose-design-tool.test.js` as a template. Each test:
- Setup: write a baseline entry via the canonical tool (e.g., `meta_state_report` for findings, `meta_state_log_change` for change-logs)
- Action: call `metaStatePatchTool.handler({...})` with the test inputs
- Assert: assert the return shape, the registry state, and the audit log entry

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

**Test 4 — Change-log immutable:**
```js
// Setup: write a change-log via meta_state_log_change
// Action: patch the change-log
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

### Step 1.3: Write 4 wire-format tests (30m)

The wire-format tests exercise the helper function directly (pure function, no MCP layer). Test the helper via `tool-registry.js#coerceParamsToSchema` import. The helper will be implemented in Phase 2; for now, the tests must import a function that doesn't exist → they fail (Red).

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

**Test 3 — Number from string:**
```js
const schema = { shape: { _expected_version: { _def: { typeName: "ZodNumber" } } } };
const result = coerceParamsToSchema({ _expected_version: "3" }, schema);
assert.deepEqual(result, { _expected_version: 3 });
```

**Test 4 — No-op for correct types:**
```js
const schema = { shape: { addresses: { _def: { typeName: "ZodArray" } } } };
const args = { addresses: ["x"] };
const result = coerceParamsToSchema(args, schema);
assert.equal(result, args);  // identity preserved (no coercion happened)
```

### Step 1.4: Verify all 10 tests fail (10m)

Run `node --test 'tools/learning-loop-mcp/__tests__/meta-state-patch-tool.test.js' 'tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js'` and confirm:
- 6 patch tool tests fail (module not found: meta-state-patch-tool.js)
- 4 wire-format tests fail (coerceParamsToSchema is not exported from tool-registry.js)

If any test passes accidentally, the test is wrong — revise the test, not the implementation.

## Success Criteria

- [ ] `tools/learning-loop-mcp/__tests__/meta-state-patch-tool.test.js` exists with 6 failing tests
- [ ] `tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js` exists with 4 failing tests
- [ ] All 10 tests fail at the end of this phase (Red state)
- [ ] No production code written in this phase (test-only diff)
- [ ] Test infrastructure uses isolated temp registries (no live registry interference)
- [ ] Tests use real `core/meta-state.js` primitives (no mocks)

## Risk Assessment

### Risk: Test setup may inadvertently import the live registry

If the test's `resolveRoot()` returns the project root, the tests could pollute the live `meta-state.jsonl`. **Mitigation:** mirror the pattern from `meta-state.test.js` exactly: create temp dir, set `process.env.META_STATE_ROOT` or use a configurable `resolveRoot(root)`. If `resolveRoot()` doesn't accept a parameter, this is a known issue from prior plans — use the workaround (write the temp registry and read it back via direct `readRegistry(tempRoot)`).

### Risk: Tests may be flaky if they depend on real MCP server timing

Not applicable here — tests are direct tool-handler invocations, no MCP server round-trip.

### Risk: The 6 patch tool tests may have shared state if temp dir cleanup fails

**Mitigation:** use `try { ... } finally { cleanup() }` pattern; cleanup is idempotent.

## Test Order (recommended TDD rhythm)

1. Test 1 (happy path) — confirms the basic flow works
2. Test 3 (not found) — confirms error handling at the boundary
3. Test 4 (change-log immutable) — confirms the immutability rule
4. Test 5 (branch mismatch) — confirms branch validation
5. Test 2 (CAS mismatch) — confirms the CAS mechanism
6. Test 6 (full lifecycle) — integration test, written last to confirm all 5 above compose
7. Wire-format tests 1-4 — written after the patch tool tests, since they exercise an unrelated helper
