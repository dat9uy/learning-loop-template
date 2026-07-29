---
phase: 3
title: "Rewire Inbound Gate to Age Predicate"
status: completed
priority: P1
effort: "1.5h"
dependencies: [2]
---

# Phase 3: Rewire Inbound Gate to Age Predicate

## Overview

Switch the inbound gate's staleness scan from `gate-logic.js#findStaleObservations` (local `STALENESS_THRESHOLD_MS`) to `observation-staleness.js#findObservationsStaleByAge` (shared `OBSERVATION_STALENESS_WINDOW_MS`). The F1-bootstrap half: the inbound gate decides whether to write the operator-message marker. After Phase 2's dedup, the scan is now **per-surface-latest (precise)** instead of per-row (conservative) — a deliberate, more-correct behavior change (a restarted surface with a fresh latest row is no longer flagged stale by an older sibling row). Then delete the now-unused `findStaleObservations` + `STALENESS_THRESHOLD_MS` from `gate-logic.js`.

## Requirements

- Functional: `evaluate-inbound-gate.js` imports `findObservationsStaleByAge` from `./observation-staleness.js` instead of `findStaleObservations` from `./gate-logic.js`.
- Functional: `loadStaleActiveObservations` (evaluate-inbound-gate.js:168-176) calls the new selector with `Date.now()`; the active-status + paused-surface filters upstream of the call are unchanged.
- Functional: `gate-logic.js` no longer exports `findStaleObservations`; the local `STALENESS_THRESHOLD_MS` is removed.
- Functional: **stale-on-null preserved** — the new `isObservationStaleByAge` returns stale on missing/NaN `updated_at` (Phase 1), matching the original `findStaleObservations` (gate-logic.js:1032,1034). F1 defensiveness on malformed state is retained.
- Non-functional: F1 invariant preserved — marker written only when the selector returns non-empty. The marker-write symbols live in `hooks/universal/inbound-gate.js:72,81,146-147` (gated on `decision.decision === "warn"` at line 145), NOT in the evaluator (red-team m1).

## Architecture

```
core/evaluate-inbound-gate.js
  - import { findProjectRoot, findStaleObservations } from "./gate-logic.js"   ← was
  + import { findProjectRoot } from "./gate-logic.js"
  + import { findObservationsStaleByAge } from "./observation-staleness.js"
  ...
  loadStaleActiveObservations(resolvedRoot):
    const stale = findObservationsStaleByAge(active, Date.now())   ← was findStaleObservations(active, Date.now())
    return stale.length === 0 ? null : stale

core/gate-logic.js
  - const STALENESS_THRESHOLD_MS = 30 * 60 * 1000;
  - export function findStaleObservations(observations, now) { ... }   ← delete both + section header (1021-1022)
```

`findProjectRoot` import from `gate-logic.js` retained (used at evaluate-inbound-gate.js:135). Only the staleness symbol moves.

### Behavior change (documented, accepted)

With Phase 2's dedup, a surface that has an older active row (T1) and a newer active row (T2, e.g. a restart) now projects **one** observation with `updated_at = T2` (for canonical-id rows — the writer-enforced norm). The inbound gate flags it stale only if `now - T2 > WINDOW` — the surface is genuinely stale. Pre-plan it would flag stale via the T1 row even though T2 was fresh. This is the precise-vs-conservative shift the user approved. F1's structural invariant (marker only on a non-empty stale set) is unchanged. **Scope caveat (re-red-team M1):** legacy/distinct-id budget-state rows are NOT collapsed by `collapseLatestById` and stay per-row (conservative) — accepted edge case; the canonical-id contract makes this the exception, not the rule.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/evaluate-inbound-gate.js` (import swap + one call site)
- Modify: `tools/learning-loop-mastra/core/gate-logic.js` (delete `STALENESS_THRESHOLD_MS` + `findStaleObservations`)
- Verify: `hooks/universal/inbound-gate.js` (marker-write gating — unchanged, but confirm F1 wiring)
- Verify: any test importing `findStaleObservations` from `gate-logic.js` (grep before delete)

## Implementation Steps (TDD — regression baseline first)

### TDD: pin the inbound-gate behavior

1. `grep -rn findStaleObservations tools/learning-loop-mastra/__tests__`. No test imports it (red-team m2 confirmed only a comment in `runtime-state-no-delete-to-clear-gate.test.js:35` references `STALENESS_THRESHOLD_MS`). So the symbol delete is import-safe; update the dangling comment to point at `OBSERVATION_STALENESS_WINDOW_MS` / `observation-staleness.js`.
2. Capture F1 invariants as tests (in `__tests__/core/evaluate-inbound-gate.test.js`, add if absent):
   - fresh latest-obs (< 30 min) → no marker
   - stale latest-obs (> 30 min) → marker written
   - no observations → no marker
   - **missing `updated_at` on an active obs → marker written** (stale-on-null, F1 defensiveness)
   - **multi-row surface (post-Phase-2): older stale row + newer fresh row, same surface → NOT flagged** (precise behavior — the changed case; pin it as the new spec)

### Implementation

3. In `evaluate-inbound-gate.js`: swap the import + the call site (`findObservationsStaleByAge(active, Date.now())`).
4. Run inbound-gate tests → green (F1 invariants hold; new precise-case test green).
5. In `gate-logic.js`: delete `STALENESS_THRESHOLD_MS` (line 1024) + `findStaleObservations` (1023-1037) + the section header (1021-1022).
6. Run the full staleness test suite → green for the inbound path. Bash-gate staleness fixtures still pending Phase 4 (expected).

### Verification

7. `grep -rn "findStaleObservations\|STALENESS_THRESHOLD_MS" tools/learning-loop-mastra/core` → zero hits.
8. F1 behavior tests green (incl. stale-on-null + the precise multi-row case).
9. `pnpm test` focused on inbound-gate + inbound-state inbound-path tests.

## Success Criteria

- [x] `evaluate-inbound-gate.js` uses `findObservationsStaleByAge` from `observation-staleness.js`
- [x] `gate-logic.js` has no `STALENESS_THRESHOLD_MS` / `findStaleObservations`; dangling comment updated
- [x] F1 invariants hold (fresh→no marker, stale→marker, no obs→no marker, **missing updated_at→marker**)
- [x] Precise multi-row case pinned (older-stale + newer-fresh same surface → not flagged)
- [x] Inbound-path tests green; no broken `findStaleObservations` imports

## Risk Assessment

**Low–moderate.** The selector swap is same-semantics on single-row surfaces; the behavior change is the precise multi-row case (accepted). The F1 invariant is structural (marker write gated on `decision === "warn"` in the hook, which fires only on a non-empty stale set), so it cannot regress from a same-or-more-precise selector. The stale-on-null preservation (Phase 1) is what keeps F1's defensiveness on malformed state intact — the red-team S2 fix. Risk is a missed `findStaleObservations` import; the grep before delete (Step 1) is the guard.
