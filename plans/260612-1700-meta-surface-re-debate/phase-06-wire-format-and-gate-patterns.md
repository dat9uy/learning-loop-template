---
phase: 6
title: "Wire-Format-and-Gate-Patterns"
status: pending
priority: P2
effort: "3h"
dependencies: [4]
---

# Phase 6: Wire-Format-and-Gate-Patterns

## Overview

Add the `side-effect-import` regex pattern for `runtime_state_record` to `core/patterns.json` (red-team Finding 7), and add wire-format regression tests for the 16 `meta_state_*` tools (red-team Finding 8). This phase is the "mechanical guards" phase — both changes are deterministic, no architectural decisions.

## Requirements

- Functional:
  - `core/patterns.json` has a new `side-effect-import` pattern entry that matches `runtime_state_record` invocations
  - The bash-gate intercepts bash scripts that call `runtime_state_record` (via the new pattern) and returns `decision: 'block'` if no preflight marker exists
  - 16 new wire-format regression tests cover the new optional fields (`affected_system`, `code_ref`, `ledger_ref`) on the 16 `meta_state_*` tools
- Non-functional:
  - The bash-gate behavior is unchanged for all other patterns
  - The wire-format coercion helpers (`coerceParamsToSchema` + `installWireFormatCoercion`) handle the new fields correctly
  - All 16 tests pass

## Architecture

**The new `side-effect-import` pattern.** Currently, `core/patterns.json` has:
```json
{
  "side-effect-import": "import\\s+vnstock_data\\b"
}
```

Phase 6 extends this to:
```json
{
  "side-effect-import": "import\\s+vnstock_data\\b|.*runtime_state_record\\s*\\("
}
```

The new alternation matches `runtime_state_record(` (with optional whitespace) anywhere in a bash command. When the bash-gate's `splitSegments` finds this pattern, it returns `decision: 'block'` if no preflight marker exists (consistent with the existing `vendor-api` and `docker` pattern handling).

**The 16 wire-format tests.** The existing test files `__tests__/wire-format-top-level-coercion.test.js` and `__tests__/wire-format-coercion-fix.test.js` cover the coercion helpers in `tool-registry.js`. Phase 6 adds one test per `meta_state_*` tool, verifying that the new optional fields (`affected_system`, `code_ref`, `ledger_ref`) survive the wire-format coercion (JSON-string-to-typed-value) round-trip.

## Related Code Files

- Modify: `tools/learning-loop-mcp/core/patterns.json` (add `side-effect-import` alternation)
- Create: `__tests__/bash-gate-runtime-state-record.test.js` (gate behavior tests)
- Create: `__tests__/wire-format-meta-state-optional-fields.test.js` (16 tests, one per tool)

## Implementation Steps

1. **Read `core/patterns.json` and `core/gate-logic.js#evaluateWritePath` in full.** Confirm the existing pattern handling and the new pattern's effect.
2. **Read `__tests__/wire-format-top-level-coercion.test.js` and `__tests__/wire-format-coercion-fix.test.js` to understand the test pattern.**
3. **Update `core/patterns.json`.** Add the `runtime_state_record(` alternation to `side-effect-import`. Verify the regex compiles.
4. **Add `__tests__/bash-gate-runtime-state-record.test.js`.** Test cases: (a) `runtime_state_record(...)` with preflight marker → `decision: 'ok'`; (b) without preflight → `decision: 'block'`; (c) `node script-that-calls-runtime_state_record.js` → blocked; (d) `runtime_state_read(...)` → not blocked (different tool).
5. **Add `__tests__/wire-format-meta-state-optional-fields.test.js`.** 16 tests, one per `meta_state_*` tool. Each test: pass JSON-string `affected_system: '"vnstock"'` through `coerceParamsToSchema`, verify the tool receives the typed enum value.
6. **Run `pnpm test`.** Verify all tests pass.

## Success Criteria

- [ ] `core/patterns.json` has the updated `side-effect-import` pattern.
- [ ] The bash-gate returns `decision: 'block'` for `runtime_state_record` invocations without preflight.
- [ ] The bash-gate returns `decision: 'ok'` for `runtime_state_record` invocations with preflight.
- [ ] The bash-gate returns `decision: 'ok'` for `runtime_state_read` invocations.
- [ ] 16 wire-format tests cover the 3 new optional fields on all 16 `meta_state_*` tools.
- [ ] `pnpm test` passes 1013+ tests (997 + 16).

## Risk Assessment

- **Medium: the new `side-effect-import` regex matches false positives (e.g., a comment containing `runtime_state_record(`).** Mitigation: the regex is anchored by `\\s*\\(` (function-call pattern), reducing false positives. The test cases include a positive (`node script.js`) and a negative (`runtime_state_read` not matched).
- **Medium: the 16 wire-format tests are repetitive (one per tool).** Mitigation: a helper function `testOptionalFields(toolName, expectedFields)` reduces boilerplate. The test file has 16 test names but ~50 lines of setup.
- **Low: changing `side-effect-import` may break the existing test `__tests__/bash-gate-side-effect-import.test.js` if it exists.** Mitigation: sub-step 6.1 enumerates existing tests; the new pattern is additive (uses `|`, not replacement).
