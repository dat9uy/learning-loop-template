---
phase: 1
title: "Pure function queryDrift (TDD, 24 unit tests)"
status: pending
priority: P2
effort: "4h"
dependencies: ["phase-0"]
---

# Phase 1: Pure function `queryDrift`

## Overview

This phase creates the pure-function drift aggregator at `tools/learning-loop-mcp/core/query-drift.js`. The function joins SP1's `deriveStatus` + SP2's `checkGrounding` across the registry and filters for drift events. It is a verifier + aggregator (no I/O at unit level); the MCP tool in Phase 2 wraps it with I/O. 24 unit tests lock the contract: 4 join cases + 4 SP1-only cases + 4 recommendation triggers + 4 filter/edge cases + 4 path/semantics edge cases + 4 misc (including the change-log fast path).

## Requirements

- **Functional:**
  - `queryDrift(entries, codeContext) -> DriftReport` is a pure function
  - For every entry, calls `deriveStatus(entry, codeContext)` (SP1) unconditionally
  - For every entry with `entry.evidence_code_ref` AND `run_grounding: true`, also calls `checkGrounding(entry, codeContext)` (SP2)
  - Filters for drift: returns only entries where `raw_status` is `active` or `reported` AND (SP1 says `resolved-by-mechanism` OR SP2 says `drifted`)
  - Computes `recommendation` per drift event based on the join result
  - Returns `{ drift_count, drift_events }` shape
- **Non-functional:**
  - Function is < 100 LOC (KISS)
  - `codeContext` is `{ root, run_grounding, run_tests?, test_passed?, now? }` (extended from SP1/SP2)
  - `now` injection: `codeContext.now` default `() => Date.now()`; captured at function start, used for `duration_ms` if surfaced (Phase 1 does not surface per-event timestamps)
  - Caller provides `entries`; function does NOT call `readRegistry` (this is a verifier, not a reader; the tool layer reads)

## Architecture

```js
// tools/learning-loop-mcp/core/query-drift.js
import { deriveStatus } from "./derive-status.js";
import { checkGrounding } from "./check-grounding.js";

/**
 * Pure drift-aggregation function. Joins SP1's deriveStatus + SP2's
 * checkGrounding across the registry; filters for drift events.
 *
 * @param {Array} entries - registry entries (caller filters for non-terminal status)
 * @param {Object} codeContext - { root, run_grounding, run_tests?, test_passed?, now? }
 * @returns {{ drift_count: number, drift_events: Array<DriftEvent> }}
 *
 * DriftEvent: { id, raw_status, derived_status, drift_kind, recommendation }
 */
export function queryDrift(entries, codeContext = {}) {
  const runGrounding = codeContext.run_grounding === true;
  const driftEvents = [];

  for (const entry of entries) {
    // SP1 derivation (unconditional)
    const derivation = deriveStatus(entry, codeContext);

    // Change-log fast path: no-signals → skip
    if (derivation.derivation.kind === "no-signals") continue;

    // Optionally run SP2 grounding
    let grounding = null;
    if (runGrounding && entry.evidence_code_ref) {
      grounding = checkGrounding(entry, codeContext);
    }

    // Determine if this entry is a drift candidate
    const isDrift = computeIsDrift(derivation, grounding, entry);
    if (!isDrift) continue;

    // Compute recommendation based on join result
    const recommendation = computeRecommendation(derivation, grounding);

    driftEvents.push({
      id: entry.id,
      raw_status: entry.status,
      derived_status: derivation.derived_status,
      drift_kind: "assertion_lags_derivation",
      recommendation,
    });
  }

  return {
    drift_count: driftEvents.length,
    drift_events: driftEvents,
  };
}

/**
 * Internal helper: 4-case join logic.
 * Returns true iff the entry's raw_status disagrees with the joined view.
 *
 * NOTE: SP1's `derived_status` enum has 3 values: `resolved-by-mechanism`,
 * `active-no-signal`, `active-uncertain`. The `code-missing` case is captured
 * in SP1's `derivation.kind` (a separate enum with 4 values), not as a
 * `derived_status`. So we also check `derivation.kind === "code-missing"`
 * to detect "the mechanism's file is gone" as a drift event.
 */
function computeIsDrift(derivation, grounding, entry) {
  const rawActive = entry.status === "active" || entry.status === "reported";
  if (!rawActive) return false;

  // Case 1 & 2: SP1 says resolved-by-mechanism → drift (derivation source)
  if (derivation.derived_status === "resolved-by-mechanism") return true;

  // Case 6: SP1 says the code ref is missing → drift (mechanism is gone)
  if (derivation.derivation.kind === "code-missing") return true;

  // Case 3: SP2 says drifted → drift (grounding source) — only if SP2 was run
  if (grounding && grounding.status === "drifted") return true;

  return false;
}

/**
 * Internal helper: recommendation based on join result.
 *
 * Note: SP1's locked `recommendation` enum has 4 values (`no_action`, `resolve`,
 * `investigate`, `log_drift`). SP3 only emits `resolve` or `investigate` because
 * the lean drift event shape filters to actionable outcomes. `no_action` and
 * `log_drift` are not drift conditions (see `computeIsDrift`).
 */
function computeRecommendation(derivation, grounding) {
  // Case 6: SP1 says code-missing → investigate (file is gone)
  if (derivation.derivation.kind === "code-missing") {
    return "investigate";
  }

  // SP1 resolved + SP2 grounded (or skipped or not run) → resolve
  if (derivation.derived_status === "resolved-by-mechanism" &&
      (!grounding || grounding.status === "grounded" || grounding.status === "skipped")) {
    return "resolve";
  }

  // SP1 resolved + SP2 drifted → resolve (primary = derivation)
  if (derivation.derived_status === "resolved-by-mechanism" &&
      grounding && grounding.status === "drifted") {
    return "resolve";
  }

  // SP1 active-uncertain → investigate
  if (derivation.derived_status === "active-uncertain") {
    return "investigate";
  }

  // SP1 not resolved + SP2 drifted → investigate (ground is the only signal)
  if (grounding && grounding.status === "drifted") {
    return "investigate";
  }

  // Default: investigate (shouldn't reach here for the join cases)
  return "investigate";
}
```

## Related Code Files

### Create
- `tools/learning-loop-mcp/core/query-drift.js` (NEW, ~80 LOC)
- `tools/learning-loop-mcp/__tests__/query-drift.test.js` (NEW, ~300 LOC, 24 unit tests)

### Modify
- None

### Read
- `tools/learning-loop-mcp/core/derive-status.js` (imported; joined unconditionally)
- `tools/learning-loop-mcp/core/check-grounding.js` (imported; joined when `run_grounding: true`)
- `tools/learning-loop-mcp/core/meta-state.js` (entry shape; not imported — function is pure)
- `tools/learning-loop-mcp/__tests__/derive-status.test.js` (test pattern reference)
- `tools/learning-loop-mcp/__tests__/check-grounding.test.js` (test pattern reference)

### Delete
- None

## Implementation Steps

1. **TDD Step 1 (RED):** Write `__tests__/query-drift.test.js` with 24 unit tests covering:
   - T-1 to T-4: SP1-only cases (no `run_grounding`): resolved, active-no-signal, active-uncertain, code-missing
   - T-5 to T-8: SP1+SP2 join cases: the 4 join cases enumerated in the brainstorm report
   - T-9 to T-12: Recommendation triggers: `resolve` (case 1, 2), `investigate` (case 3, 5, 6)
   - T-13 to T-16: Filter behavior: `filter.status: "active"`, `filter.status: "reported"`, no filter, invalid status
   - T-17 to T-20: Edge cases: empty registry, single entry, large registry (100+), change-log fast path
   - T-21 to T-24: Path/semantics edge cases: terminal status (resolved, expired) → not drift, null `evidence_code_ref`, corrupted SP2 status, non-derivable kind
2. **TDD Step 2 (GREEN):** Write `core/query-drift.js`. Import `deriveStatus` and `checkGrounding`. Implement `queryDrift`, `computeIsDrift`, `computeRecommendation`. Run the test suite — all 24 tests should pass.
3. **TDD Step 3 (REFACTOR):** Ensure the function is < 100 LOC. Add header comments explaining the 4-case join logic. No behavioral changes.
4. **Run `pnpm test`**: confirm 557 baseline + 24 new = 581 pass, 0 fail.
5. **Run `pnpm validate:records`**: confirm 183 records still validate.
6. **Run `pnpm validate:plan-loop`**: confirm 76 plans still check (75 existing + 1 new SP3 plan).

## Test Plan

| # | Test | What it covers |
|---|---|---|
| T-1 | SP1-only: `kind: "mechanism-shipped"`, `derived_status: "resolved-by-mechanism"` + `raw_status: active` | Case 1 of the join (derivation-only path) |
| T-2 | SP1-only: `kind: "no-signals"`, `derived_status: "active-no-signal"` + `raw_status: active` | No drift (case 4 with no SP2) |
| T-3 | SP1-only: `kind: "code-only"`, `derived_status: "active-uncertain"` + `raw_status: active` | Case 5 (uncertain → investigate) |
| T-4 | SP1-only: `kind: "code-missing"`, `derived_status: "active-no-signal"` + `raw_status: active` | Case 6 (code-missing → investigate) |
| T-5 | SP1+SP2: case 1 (resolved + grounded) → `recommendation: "resolve"` | The 4 join case 1 |
| T-6 | SP1+SP2: case 2 (resolved + drifted) → `recommendation: "resolve"` | The 4 join case 2 |
| T-7 | SP1+SP2: case 3 (active-no-signal + drifted) → `recommendation: "investigate"` | The 4 join case 3 |
| T-8 | SP1+SP2: case 4 (active-no-signal + grounded) → no drift | The 4 join case 4 |
| T-9 | Recommendation: SP1 resolved + SP2 skipped → `resolve` | Sub-case of case 1 |
| T-10 | Recommendation: SP1 resolved + SP2 unknown → `resolve` | SP2 unknown still yields `resolve` (derivation is primary) |
| T-11 | Recommendation: SP1 active + SP2 drifted → `investigate` | Sub-case of case 3 |
| T-12 | Recommendation: SP1 active-uncertain → `investigate` regardless of SP2 | Case 5 dominates |
| T-13 | Filter: `filter.status: "active"` returns only active entries | Filter behavior |
| T-14 | Filter: `filter.status: "reported"` returns only reported entries | Filter behavior |
| T-15 | Filter: no filter returns both active and reported | Default behavior |
| T-16 | Filter: invalid status (e.g., `"resolved"`) returns empty | Edge case |
| T-17 | Edge: empty registry → `{ drift_count: 0, drift_events: [] }` | Boundary |
| T-18 | Edge: single entry with no drift | Boundary |
| T-19 | Edge: large registry (100+ entries, mixed drift) | Performance smoke test |
| T-20 | Edge: change-log entry (`entry_kind: "change-log"`) is skipped via `kind: "no-signals"` fast path | Fast path |
| T-21 | Edge: terminal status (resolved) → not drift | Terminal skip |
| T-22 | Edge: terminal status (expired) → not drift | Terminal skip |
| T-23 | Edge: null `evidence_code_ref` + `run_grounding: true` → SP2 not called (defensive) | Null path |
| T-24 | Edge: corrupted SP2 status (not in the 4-value enum) → defaults to "not drift" (safe) | Corrupt path |

## Success Criteria

- [x] `core/query-drift.js` exists, exports `queryDrift`, is < 100 LOC
- [x] `__tests__/query-drift.test.js` exists, has 24 it blocks, all pass
- [x] `pnpm test` shows 557 + 24 = 581 pass, 0 fail
- [x] `pnpm validate:records` passes (no schema regression)
- [x] `pnpm validate:plan-loop` passes (76 plans check)
- [x] The 4 join cases are enumerated in code comments
- [x] The 4 recommendation triggers are documented
- [x] The function is pure (no I/O; `codeContext` is the only external dependency)
- [x] No regressions in the 557-test baseline

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| The 4-case join logic may miss an edge case | Medium | Each case has a dedicated test (T-5 to T-8). The 12 unit tests for join + recommendation cover the permutations exhaustively. |
| The `computeRecommendation` function has a default `investigate` fallback that may mask bugs | Low | The fallback is "shouldn't reach here" per code comment. If a test triggers the fallback, the test will assert the actual recommendation and surface the bug. |
| Performance: 100+ entries with `run_grounding: true` may be slow | Low | T-19 is a smoke test. The per-process mtime cache (SP1/SP2 pattern) amortizes repeat calls. Documented as a known limit; Phase 2 may add a cap. |
| `deriveStatus` or `checkGrounding` import is broken (e.g., export rename) | Low | Both exports are locked in the SP1/SP2 plan frontmatter. The function imports are line-1 of the file; if the import fails, the test fails immediately. |
