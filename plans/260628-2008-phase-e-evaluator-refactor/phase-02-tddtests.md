---
phase: 2
title: "Evaluators-Implementation"
status: pending
effort: "0.5 day"
---

# Phase 2: Evaluators (Green — Implement to Pass)

## Overview

Create 3 pure evaluator files in `core/`. Each imports primitives from `core/gate-logic.js` only — no I/O, no `@mastra/*` imports, no `entry/` coupling. The locked signatures from Phase 1's test imports are filled in here.

## Requirements

- **Functional:** 3 evaluators cover the 7-rule write-gate cascade, bash-gate constraint + path detection, and inbound-gate state-change + staleness check.
- **Non-functional:** pure functions (zero I/O at module level — `node:fs` reads only inside existing primitives); zero `@mastra/*` imports (FCIS invariant); ≤200 lines each (consistency with sibling files).

## Architecture

Each evaluator is a thin composer of primitives from `gate-logic.js`:

```
evaluateWriteGate({ filePath, root })
  → uses: globMatch, readPreflightMarker, inferSurface, loadPromotedRules, applyPromotedRules

evaluateBashGate({ command, root })
  → uses: matchConstraintPattern, checkObservationExists, makeGateDecision, checkObservationStaleness,
          PATH_WRITE_PATTERNS (local), loadPromotedRules, applyPromotedRules

evaluateInboundGate({ prompt, root })
  → uses: readRuntimeObservations (via file-readers), STATE_CHANGE_PATTERNS (local), findStaleObservations
```

`evaluatePreflight({ filePath, root })` is the named seam for the product/** preflight check, locked by the convergence addendum. It returns either `{ decision: "ok" }` or `{ decision: "block", reason, surface?, preflight_checklist? }`.

## Related Code Files

### Create

- `tools/learning-loop-mastra/core/evaluate-write-gate.js` (~120-150 lines)
- `tools/learning-loop-mastra/core/evaluate-bash-gate.js` (~100-120 lines)
- `tools/learning-loop-mastra/core/evaluate-inbound-gate.js` (~80-100 lines)

## Implementation Steps

1. **Step 0 — Resolve the layering tension** (see plan-level R1). Decision: Path B (per red-team verdict — see plan.md). Deliverables:
   - **(a)** Edit `__tests__/phase-e-foundation/placement-manifest.test.js:101` from `evaluator: ["primitive"]` to `evaluator: ["primitive", "facade"]`.
   - **(b)** Add an **inline ADR-style comment** above line 101 in the same test file (per red-team B1): `// Refined 2026-06-28 per plans/260628-2008-phase-e-evaluator-refactor: evaluators compose primitives + facade functions for state-reading (gate-logic.js, inbound-state.js). Closed-taxonomy rule (placement.md §4) governs ROLE addition; this is an import-allow-list refinement for an existing role. Revisit if evaluator count > 5 OR an evaluator imports > 2 facade files.`
   - **(c)** Update the `evaluator` row in `docs/placement.md` role taxonomy table to mention BOTH `gate-logic.js` AND `inbound-state.js` (per red-team H1): "evaluator | No | primitive + facade | Phase 3 evaluators (3 files) compose primitives from gate-logic.js and facade functions from inbound-state.js for state-reading."
   - **(d)** Run `grep -rn 'from.*gate-logic\|from.*inbound-state' tools/learning-loop-mastra/__tests__/` to verify no existing test mocks the symbols (relevant for future Path A reversibility).

2. **Step 1 — Create `evaluate-write-gate.js`.** Move the 7-rule cascade from `hooks/legacy/write-gate.js:43-184` into a function (pure at function-body level; transitive I/O at module load via `gate-logic.js`'s `patterns.json` read is acknowledged per plan R1c). Imports from `core/gate-logic.js` (allowed under Path B's loosened invariant). The `toRelative` helper + `globMatch` calls stay; the `console.log`/`process.exit` lines move to the hook adapter. **Preserve the `meta-state.jsonl` audit-gap rationale** as JSDoc above the rule (per red-team H3 — see `write-gate.js:83-91` for the source rationale citing `debugger-260626-1535-phase-e-plan-7-audit-gap-mechanism-investigation.md`). Top-level JSDoc: "Write-gate evaluator. Composes primitives from `core/gate-logic.js`. Returns decision object for hook adapter or MCP tool."

3. **Step 2 — Create `evaluate-bash-gate.js`.** Move the constraint + path + promoted-rules chain from `hooks/legacy/bash-gate.js:55-145`. `PATH_WRITE_PATTERNS` is exported at module level (was lines 35-47 in the hook). Top-level JSDoc: "Bash-gate evaluator. Combines constraint-pattern, path-write, and promoted-rules checks."

4. **Step 3 — Create `evaluate-inbound-gate.js`.** Move the `detectStateChange` + `readActiveObservations` + `buildContextMessage` chain from `hooks/legacy/inbound-gate.js:40-127`. `STATE_CHANGE_PATTERNS` is exported at module level. **Note:** `findStaleObservations` is moved to `core/gate-logic.js` (per red-team M3 — small primitive, used by both inbound and bash evaluators) before this step; the evaluator imports it from there. Top-level JSDoc: "Inbound-gate evaluator. Returns decision object including `warn` (vs `ok`) for state-change + stale-observation combinations."

5. **Step 4 — Verify FCIS invariant.** Run `pnpm test --filter=fcis-invariant` — must pass (zero `@mastra/*` in any new file).

6. **Step 5 — Verify layering invariant.** Run `pnpm test --filter=placement-manifest` — must pass after Step 0's resolution. The 3 new `evaluate-*.js` files importing `gate-logic.js` and `inbound-state.js` (both facade) are now allowed.

7. **Step 6 — Verify green.** Run the 3 new test files from Phase 1. All ~30 tests must pass.

8. **Step 7 — Verify baseline.** Run `pnpm test` (full suite). All 1308 baseline tests still pass.

9. **Step 8 — Namespaced runner check.** Verify the new `.test.js` siblings are discovered by `tools/scripts/run-pnpm-test-namespaced.mjs` (Phase E Dead-Code Sweep validation flagged this risk; R-CRIT-1). If not, follow the existing fallback path (add to `package.json#scripts.test`).

## Success Criteria

- [ ] 3 evaluator files exist with the locked signatures matching Phase 1's test imports.
- [ ] All ~30 Phase-1 tests pass.
- [ ] All 1308 baseline tests pass (no regression).
- [ ] FCIS invariant passes (zero `@mastra/*` in new files).
- [ ] No `node:fs` or `node:path` reads at module top level (pure functions; reads only via `gate-logic.js` primitives).
- [ ] `evaluatePreflight` named seam is exported from `evaluate-write-gate.js`.
- [ ] `PATH_WRITE_PATTERNS` and `STATE_CHANGE_PATTERNS` exported from their respective files.

## Risk Assessment

- **R2.1 — Module-level side effects from `gate-logic.js` imports.** `gate-logic.js` imports `surfaces.js`, `meta-state.js`, `check-grounding.js`, `gate-override.js`. None of these do I/O at module load (they export functions only). Verified by reading imports — no `readFileSync` at top level. If a future change adds module-level I/O, all evaluators inherit it. Mitigation: add a `// fallow-ignore` complexity marker if `gate-logic.js` grows past 1000 LoC.
- **R2.2 — `evaluateInboundGate` needs to read observations but evaluator is "pure".** Tension: `readRuntimeObservations` does `node:fs` I/O. **Decision:** treat "pure" as "no I/O at module level; I/O inside composed primitives is OK." This matches the convergence addendum's intent ("each evaluator is independently testable without spawning a subprocess") — observability I/O is internal to the primitive, not the evaluator's surface. If a future evaluator is needed in a true no-I/O context (e.g., a workflow step), the primitive can be replaced with an injected reader.
- **R2.3 — Stale observation check duplicates `inbound-state.js` logic.** `findStaleObservations` (currently in `hooks/legacy/inbound-gate.js:50-57`) is a small function. Red-team M3 noted `evaluateBashGate` (line 84-95 of current bash-gate.js) also needs staleness logic for `constraintMatch + stale observations`. **Updated decision:** move to `core/gate-logic.js` (role: primitive) before Step 3; both evaluators import from there. ~5-min refactor; eliminates future drift.
- **R2.4 — `evaluateBashGate` decision combination logic is non-trivial** (lines 122-132 of the hook). The "constraint beats path beats nothing" precedence is not obvious. **Decision:** extract to a `combineDecisions(constraint, path)` helper inside `evaluate-bash-gate.js` with a one-line JSDoc per branch.

## Decisions Locked in This Phase

| Question | Choice | Why |
|---|---|---|
| Module-level I/O policy | I/O OK inside composed primitives (gate-logic.js, file-readers.js); no I/O at evaluator module level | Matches convergence addendum's "testable without subprocess" goal |
| `findStaleObservations` location | **Move to `core/gate-logic.js`** (role: primitive) | Updated per red-team M3 — both inbound + bash evaluators need it; KISS-share |
| Decision combination helper | Extract `combineDecisions()` inside `evaluate-bash-gate.js` | R2.4 — readability over premature abstraction |
| `evaluatePreflight` export | Yes, named seam (convergence addendum locked) | Future-proofs the preflight relaxation question |
| Entry factory coupling | None in v1 — evaluators take raw `{ filePath, root }` inputs | R1 from plan-level risks; rewire through `createRule()` is a future plan |
