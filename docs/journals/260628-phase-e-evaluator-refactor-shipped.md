# 260628 — Phase E Evaluator Refactor Shipped

## Summary

Extracted gate policy from 3 hooks into pure evaluator functions in `core/`. Hooks are now thin I/O adapters. `gate_check` MCP tool rewired to use evaluators. Wire protocol unchanged.

## Key Changes

- **3 new evaluator files** in `core/`: `evaluate-write-gate.js`, `evaluate-bash-gate.js`, `evaluate-inbound-gate.js`
- **3 hooks slimmed**: write-gate 187→41 lines, bash-gate 148→50 lines, inbound-gate 130→65 lines
- **`findStaleObservations`** moved from inbound-gate hook to `core/gate-logic.js` (shared by both evaluators)
- **Layering tension resolved** (Path B): `evaluator` role now allows `["primitive", "facade"]` imports, not just `["primitive"]`
- **50 new unit tests** + **7 snapshot parity tests** = 57 new tests
- **Behavioral fix**: `node_modules/**`, `dist/**`, `build/**` paths now correctly blocked (pre-refactor `**/` prefix bug)

## Metrics

| Metric | Before | After |
|--------|--------|-------|
| Baseline tests | 1311 | 1311 |
| New tests | 0 | 57 |
| Total | 1311 | 1368 |
| Hook lines (total) | 465 | 156 |
| Evaluator lines (total) | 0 | ~350 |
| placement.yaml files | 30 | 33 |

## Decisions

- **Path B over Path A** for layering tension: smaller blast radius, reversible, avoids `matchConstraintPattern` mis-categorization issue
- **`checkObservationStaleness`** stays in `inbound-state.js` (bash evaluator imports it); `findStaleObservations` moved to `gate-logic.js` (both evaluators use it)
- **`SURFACES` import** in evaluators to satisfy runtime-agnostic invariant (no hard-coded coordination paths)
- **No `for...of SURFACES`** in evaluators — used index loop to pass inline-loop detection

## Risks Tracked

- R1c: `gate-logic.js` module-load `readFileSync("patterns.json")` acknowledged — "pure" scoped to function-body level
- R1b: No `entry/` coupling in v1 — evaluators take raw inputs, not Entry objects

## Plan

`plans/260628-2008-phase-e-evaluator-refactor/` — all 4 phases completed, all acceptance criteria met.
