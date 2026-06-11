---
phase: 1
title: "Red (TDD tests first)"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Red (TDD tests first)

## Overview

Add stdio regression tests that reproduce the exact wire-format coercion failures documented in `meta-260610T1458Z`. All four tests should fail before the implementation in Phase 2. The tests reuse the `withMcpServer` helper pattern from `wire-format-patch-recursion.test.js` but live in a dedicated file for top-level field coercion.

## Requirements

- Functional: stdio transport must be the test path, not a direct `coerceParamsToSchema` unit test.
- Functional: cover both array unwrapping (`{item: [...]}`) and boolean string coercion (`"true"`/`"false"`).
- Functional: cover the empty-array edge case.
- Non-functional: tests must run with `pnpm test` and use only built-in Node modules (no new dependencies).

## Architecture

The new test file spawns the MCP server as a child process, sends JSON-RPC `tools/call` requests with wire-corrupted payloads, and reads the temporary registry back to assert the stored values are flat and correctly typed. This matches the architectural boundary where the bug lives: between JSON-RPC transport and Zod validation.

## Related Code Files

- **Create:** `tools/learning-loop-mcp/__tests__/wire-format-top-level-coercion.test.js`
- **Read (for patterns):** `tools/learning-loop-mcp/__tests__/wire-format-patch-recursion.test.js`
- **Read (for schemas):** `tools/learning-loop-mcp/tools/meta-state-propose-design-tool.js`, `tools/learning-loop-mcp/tools/meta-state-report-tool.js`

## Implementation Steps

1. Create `tools/learning-loop-mcp/__tests__/wire-format-top-level-coercion.test.js`.
2. Copy/adapt the `withMcpServer` helper from `wire-format-patch-recursion.test.js`:
   - Spawn `tools/learning-loop-mcp/server.js` with `GATE_ROOT` pointing to a temp directory.
   - Copy `schemas/*.schema.json` into the temp root.
   - Provide `call(id, name, args)` and expose `tempRoot`.
3. Write **Test 1 — `meta_state_propose_design` array unwrap via stdio**:
   - Call `meta_state_propose_design` with `proposed_design_for: {item: ["rule-A", "rule-B"]}` and `addresses: {item: ["finding-C"]}`.
   - Assert `result.proposed === true`.
   - Read registry; assert entry `proposed_design_for` is `["rule-A", "rule-B"]` and `addresses` is `["finding-C"]`.
4. Write **Test 2 — `meta_state_propose_design` empty array unwrap via stdio**:
   - Call with `proposed_design_for: {item: []}` and `addresses: {item: []}`.
   - Assert success and stored arrays are `[]`.
5. Write **Test 3 — `meta_state_report` `"true"` coercion via stdio**:
   - Call `meta_state_report` with required fields plus `mechanism_check: "true"`.
   - Assert `result.reported === true`.
   - Read registry; assert `entry.mechanism_check === true` (boolean).
6. Write **Test 4 — `meta_state_report` `"false"` coercion via stdio**:
   - Same as Test 3 with `mechanism_check: "false"`; assert stored boolean `false`.
7. Write **Test 5 — `tools/list` schema preservation**:
   - After initialize, call `tools/list` and find `meta_state_propose_design`.
   - Assert the JSON schema still defines `proposed_design_for` and `addresses` as array types.
8. Run `pnpm test` and confirm the 4 new tests fail with errors containing the expected Zod messages:
   - `proposed_design_for`: message includes "expected array, received object"
   - `mechanism_check`: message includes "expected boolean, received string"

## Success Criteria

- [x] New test file created with 5 tests.
- [x] Tests 1-4 fail before Phase 2 with errors containing the Zod messages from the finding.
- [x] Test 5 passes before Phase 2 (schema is currently preserved).
- [x] No new dependencies introduced.
- [x] Existing test suite still passes at Phase 1 (only the new tests are red).

## Risk Assessment

- **Helper duplication risk:** copying `withMcpServer` creates ~90 lines of duplication. **Mitigation:** accept the duplication; extracting a shared test helper is out of scope and would require updating existing tests.
- **Flaky timing risk:** stdio server startup timing. **Mitigation:** reuse the 300ms startup delay from the precedent test.
- **Schema copy risk:** if `schemas/` changes, the copy step may miss new files. **Mitigation:** copy all `*.schema.json` files, same as precedent.
