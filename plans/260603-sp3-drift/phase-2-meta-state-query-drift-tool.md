---
phase: 2
title: "meta_state_query_drift Tool (TDD, 24 tool tests)"
status: pending
priority: P2
effort: "4h"
dependencies: ["phase-1"]
---

# Phase 2: `meta_state_query_drift` Tool

## Overview

This phase creates the MCP tool at `tools/learning-loop-mcp/tools/meta-state-query-drift-tool.js`. The tool wraps the pure function `queryDrift` from Phase 1 with I/O (registry read, gate log write) and exposes it as a callable MCP tool. 24 tool tests lock the contract: default mode behavior, filter behavior, empty/boundary registries, input validation, output shape, gate log integration.

## Requirements

- **Functional:**
  - Tool name: `meta_state_query_drift`
  - Input shape: `{ filter?: { status?: 'active' | 'reported' }, run_grounding?: boolean (default `false`) }`
  - Output shape: `{ drift_count: number, drift_events: Array<{ id, raw_status, derived_status, drift_kind, recommendation }> }`
  - Reads from the registry via `readRegistry(root)` + `filterEntries()`
  - Calls `queryDrift(entries, codeContext)` with the constructed `codeContext`
  - Appends a gate log line: `{ event: "meta_state_query_drift", filter, run_grounding, drift_count }`
  - Role: agent-callable (no operator-only check; mirrors `meta_state_derive_status`)
- **Non-functional:**
  - Tool file is < 80 LOC (KISS)
  - `codeContext` includes `run_grounding: <input value>` (so the pure function knows whether to invoke SP2)
  - `codeContext.run_tests: false` (SP3 never runs tests; SP1/SP2 can opt-in)
  - `codeContext.test_passed: null`
  - `codeContext.now: () => Date.now()` (default)

## Architecture

```js
// tools/learning-loop-mcp/tools/meta-state-query-drift-tool.js
import { readRegistry, filterEntries } from "#mcp/core/meta-state.js";
import { queryDrift } from "#mcp/core/query-drift.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { appendGateLog } from "#lib/gate-logging.js";

export const metaStateQueryDriftTool = {
  name: "meta_state_query_drift",
  description: "Aggregate drift events across the meta-state registry. Joins SP1's deriveStatus + SP2's checkGrounding. Read-only: the agent decides what to do with the result.",
  inputSchema: {
    type: "object",
    properties: {
      filter: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "reported"] },
        },
        additionalProperties: false,
      },
      run_grounding: { type: "boolean", default: false },
    },
    additionalProperties: false,
  },
  handler: async ({ filter, run_grounding = false }) => {
    // Mirror SP1/SP2's error-handling pattern: resolveRoot may throw
    // (missing env var, broken symlink). Return a structured error instead
    // of crashing the tool.
    let root;
    try {
      root = resolveRoot();
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "context_load_failed",
          reason: err.message,
        }) }],
      };
    }

    const registry = readRegistry(root);
    const nonTerminal = filterEntries(registry, { status: filter?.status });

    const codeContext = {
      root,
      run_grounding,
      run_tests: false,
      test_passed: null,
      now: () => Date.now(),
    };

    const result = queryDrift(nonTerminal, codeContext);

    appendGateLog({
      event: "meta_state_query_drift",
      filter,
      run_grounding,
      drift_count: result.drift_count,
    });

    return result;
  },
};
```

## Related Code Files

### Create
- `tools/learning-loop-mcp/tools/meta-state-query-drift-tool.js` (NEW, ~60 LOC)
- `tools/learning-loop-mcp/__tests__/meta-state-query-drift-tool.test.js` (NEW, ~300 LOC, 24 tool tests)

### Modify
- None

### Read
- `tools/learning-loop-mcp/tools/meta-state-derive-status-tool.js` (SP1 sibling — pattern reference)
- `tools/learning-loop-mcp/tools/meta-state-check-grounding-tool.js` (SP2 sibling — pattern reference)
- `tools/learning-loop-mcp/core/meta-state.js` (`readRegistry`, `filterEntries` exports)
- `tools/learning-loop-mcp/lib/resolve-root.js` (`resolveRoot` export)
- `tools/learning-loop-mcp/lib/gate-logging.js` (`appendGateLog` export)
- `tools/learning-loop-mcp/core/query-drift.js` (Phase 1 output, imported by this tool)
- `tools/learning-loop-mcp/__tests__/meta-state-derive-status-tool.test.js` (test pattern reference)
- `tools/learning-loop-mcp/__tests__/meta-state-check-grounding-tool.test.js` (test pattern reference)

### Delete
- None

## Implementation Steps

1. **TDD Step 1 (RED):** Write `__tests__/meta-state-query-drift-tool.test.js` with 24 tool tests covering:
   - T-25 to T-28: Default mode (`run_grounding: false`): tool returns derivation-only drift; gate log entry created; no SP2 invocation
   - T-29 to T-32: Filter behavior: each `filter.status` value, no filter, invalid filter (zod rejection)
   - T-33 to T-36: Empty / boundary registries: empty registry, single entry, all-terminal entries, large registry
   - T-37 to T-40: Input validation: missing `run_grounding` (default false), invalid types, extra fields (`additionalProperties: false`), null filter
   - T-41 to T-44: Output shape: all 5 fields per event, `drift_count` matches `drift_events.length`, `drift_kind` always `"assertion_lags_derivation"`, no nested `derivation`/`grounding` objects
   - T-45 to T-48: Gate log integration: every tool call appends a gate log entry, log entry shape matches the spec, log includes filter and run_grounding
2. **TDD Step 2 (GREEN):** Write `tools/meta-state-query-drift-tool.js`. Import from `core/meta-state.js`, `core/query-drift.js`, `lib/resolve-root.js`, `lib/gate-logging.js`. Run the test suite — all 24 tool tests should pass.
3. **TDD Step 3 (REFACTOR):** Ensure the tool file is < 80 LOC. Add header comment cross-referencing SP1/SP2. No behavioral changes.
4. **Run `pnpm test`**: confirm 557 + 24 (Phase 1) + 24 (Phase 2) = 605 pass, 0 fail.

## Test Plan

| # | Test | What it covers |
|---|---|---|
| T-25 | Default: `run_grounding: false` → tool returns derivation-only drift | Default mode |
| T-26 | Default: `run_grounding: false` → gate log entry created | Gate log integration |
| T-27 | Default: `run_grounding: false` → SP2 not invoked (mock check) | No SP2 call |
| T-28 | Default: no filter → all non-terminal entries scanned | No filter default |
| T-29 | Filter: `filter.status: "active"` → only active entries scanned | Filter active |
| T-30 | Filter: `filter.status: "reported"` → only reported entries scanned | Filter reported |
| T-31 | Filter: no filter → both active and reported | No filter |
| T-32 | Filter: invalid `filter.status` value → empty result (zod rejects in the tool, not the function) | Invalid filter |
| T-33 | Empty: empty registry → `{ drift_count: 0, drift_events: [] }` | Boundary |
| T-34 | Empty: single entry with no drift | Boundary |
| T-35 | Empty: all-terminal entries → empty result (filterEntries returns []) | Boundary |
| T-36 | Empty: large registry (100+ entries, mixed) | Performance smoke test |
| T-37 | Input: missing `run_grounding` → defaults to `false` | Default value |
| T-38 | Input: `run_grounding: true` → passed through to `codeContext` | Opt-in |
| T-39 | Input: invalid `run_grounding` type (string) → zod rejects | Type validation |
| T-40 | Input: extra field (`foo: "bar"`) → zod rejects (`additionalProperties: false`) | Additional properties |
| T-41 | Output: 5 fields per event (`id`, `raw_status`, `derived_status`, `drift_kind`, `recommendation`) | Field shape |
| T-42 | Output: `drift_count` matches `drift_events.length` | Consistency |
| T-43 | Output: `drift_kind` always `"assertion_lags_derivation"` | Enum lock |
| T-44 | Output: no nested `derivation` or `grounding` objects (lean shape) | Lean shape |
| T-45 | Gate log: every tool call appends 1 entry | Volume |
| T-46 | Gate log: entry shape `{ event, filter, run_grounding, drift_count }` | Shape |
| T-47 | Gate log: entry includes the actual filter value (or undefined for no filter) | Filter preserved |
| T-48 | Gate log: entry includes `run_grounding` boolean | Opt-in preserved |

## Success Criteria

- [x] `tools/meta-state-query-drift-tool.js` exists, exports `metaStateQueryDriftTool`, is < 80 LOC
- [x] `__tests__/meta-state-query-drift-tool.test.js` exists, has 24 it blocks, all pass
- [x] `pnpm test` shows 557 + 24 + 24 = 605 pass, 0 fail
- [x] `pnpm validate:records` passes
- [x] `pnpm validate:plan-loop` passes
- [x] The tool is agent-callable (no operator-only check)
- [x] Default `run_grounding: false` works
- [x] Opt-in `run_grounding: true` passes through to the pure function
- [x] Gate log integration works
- [x] Output shape is lean (no nested SP1/SP2 objects)
- [x] No regressions in the 581-test baseline (from Phase 1)

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| The `filterEntries` call may not filter correctly for null/undefined filter | Low | T-31 covers the no-filter case; T-35 covers the all-terminal case. `filterEntries` is a locked export from `core/meta-state.js` (verified by existing tests). |
| The gate log entry is too verbose for high-volume SP3 queries | Low | Drift surfacing is a "log" event by design; the volume is bounded by the number of drift queries, not drift events. T-45 verifies the volume. |
| The `resolveRoot` call may fail in test environments (no project root) | Low | Use the same `mkdtempSync` + `process.env.GATE_ROOT` pattern as SP1/SP2 tests. The test environment mocks the root. |
| The MCP tool schema is rejected by the SDK (hand-written zod) | Low | The schema is a raw shape (plain object), matching the pattern from SP1/SP2 tools. The SDK accepts raw shapes. |
| `readRegistry` returns a different shape than the test fixtures | Low | Use the same test fixture pattern as SP1/SP2 (temp-dir + env-var GATE_ROOT). |
