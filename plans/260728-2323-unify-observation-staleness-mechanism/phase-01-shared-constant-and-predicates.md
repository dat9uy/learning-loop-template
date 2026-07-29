---
phase: 1
title: "Shared Constant + Unified Predicates"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Shared Constant + Unified Predicates

## Overview

Land the unified primitive layer first, before touching any caller. Adds one shared constant in `core/constants.js` and a new pure module `core/observation-staleness.js` exporting the reference-time model and the two mode-predicates. Nothing rewires to it yet — purely additive, codebase stays green. **Both predicates are stale-on-null**, matching the originals (`findStaleObservations` gate-logic.js:1032,1034; meta branch inbound-state.js:120-126) — this is the red-team S2/M2 fix.

## Requirements

- Functional: `core/observation-staleness.js` exports `observationReferenceTimeMs(obs)`, `isObservationStaleByAge(obs, now)`, `findObservationsStaleByAge(observations, now)`, `isObservationStaleByMarker(obs, markerTs)`.
- Functional: `core/constants.js` exports `OBSERVATION_STALENESS_WINDOW_MS` (30 min, env-overridable via `META_STATE_OBSERVATION_STALENESS_WINDOW_MS`), distinct from `STALENESS_WINDOW_MS` (7-day findings window).
- Functional: **stale-on-null** — both predicates return `true` when `obs.updated_at` is missing or unparseable (preserves the original defensive semantics; keeps the two gates consistent on the boundary case).
- Non-functional: the module is **pure** — no `fs`, no `Date.now()` in predicates (callers inject `now`/`markerTs`).
- Non-functional: runtime-agnostic by construction; passes `check_runtime_agnostic`.

## Architecture

```
core/constants.js
  + OBSERVATION_STALENESS_WINDOW_MS = Number(process.env.META_STATE_OBSERVATION_STALENESS_WINDOW_MS) || 30*60*1000
    (beside STALENESS_WINDOW_MS — separate concept: observation vs finding staleness)

core/observation-staleness.js   ← NEW
  import { OBSERVATION_STALENESS_WINDOW_MS } from "./constants.js"

  observationReferenceTimeMs(obs)
    → const t = new Date(obs.updated_at).getTime(); Number.isFinite(t) ? t : null
      (null for missing / unparseable updated_at)

  isObservationStaleByAge(obs, now)
    → const ref = observationReferenceTimeMs(obs);
      if (ref === null) return true;                    ← stale-on-null (matches gate-logic.js:1032)
      return (now - ref) > OBSERVATION_STALENESS_WINDOW_MS;

  findObservationsStaleByAge(observations, now)
    → observations.filter(o => o.status === "active" && isObservationStaleByAge(o, now))
      (status guard mirrors the inbound gate's active filter; preserves order)

  isObservationStaleByMarker(obs, markerTs)
    → const ref = observationReferenceTimeMs(obs);
      if (ref === null) return true;                    ← stale-on-null (matches inbound-state.js:120-126)
      return markerTs > ref;                             ← strict > (matches inbound-state.js:128)
```

The marker predicate uses strict `>` (matches `checkObservationStaleness` line 128); the age predicate uses `>` (matches `findStaleObservations` line 1035). Equality on the boundary is "not stale" in both — preserved. Both return stale on null ref — preserved from originals.

## Related Code Files

- Create: `tools/learning-loop-mastra/core/observation-staleness.js`
- Create: `tools/learning-loop-mastra/__tests__/core/observation-staleness.test.js`
- Modify: `tools/learning-loop-mastra/core/constants.js` (add one export)

## Implementation Steps (TDD — tests first)

### TDD: write tests first

1. Create `__tests__/core/observation-staleness.test.js`. Pin the env var (`META_STATE_OBSERVATION_STALENESS_WINDOW_MS`) via `beforeAll`/`afterAll`. Assert:
   - `observationReferenceTimeMs({updated_at: "2026-07-28T00:00:00Z"})` → numeric ms; `null` for `{}`, `{updated_at: "not-a-date"}`, `{updated_at: undefined}`.
   - `isObservationStaleByAge`: obs 31 min old → stale; obs 29 min old → not stale; obs exactly 30 min old → not stale (`>` boundary); **missing/NaN `updated_at` → stale** (stale-on-null, matching gate-logic.js:1032).
   - `findObservationsStaleByAge`: active-stale + active-fresh + `status:"stopped"` (excluded) + missing-updated_at (stale, included as active) → returns stale active rows in order.
   - `isObservationStaleByMarker`: marker 1ms after `updated_at` → stale; 1ms before → not; equal → not stale (`>`); **missing/NaN `updated_at` → stale** (stale-on-null, matching inbound-state.js:120-126).
   - Env override: `META_STATE_OBSERVATION_STALENESS_WINDOW_MS=1000` → 2s old stale, 0.5s not (proves constant wired, not hardcoded).
2. Run the new tests — expect failure (module doesn't exist yet).

### Implementation

3. Add `OBSERVATION_STALENESS_WINDOW_MS` to `core/constants.js` with a doc comment noting it is the **observation** staleness window (inbound/bash gates), distinct from `STALENESS_WINDOW_MS` (7-day, findings/meta-state). Follow the env-var `META_STATE_*` prefix convention (constants.js:8-9).
4. Create `core/observation-staleness.js` with the 4 exports above. Pure: no `fs`, no `Date.now()`.
5. Re-run Phase 1 tests → green.

### Verification

6. Run `check_runtime_agnostic` on `core/observation-staleness.js` → passes (no surface logic, no fs).
7. Run existing staleness tests (`inbound-state-runtime-state.test.js`, `evaluate-bash-gate-runtime-state.test.js`) → still green (additive; no caller rewired).
8. `pnpm test` focused on `__tests__/core/observation-staleness.test.js`.

## Success Criteria

- [x] `core/observation-staleness.js` exists, pure, exports the 4 primitives
- [x] `OBSERVATION_STALENESS_WINDOW_MS` in `core/constants.js`, env-overridable, distinct from `STALENESS_WINDOW_MS`
- [x] Both predicates **stale-on-null** (matching originals) — tests pin this
- [x] Phase 1 tests green, including env-override + `>` boundary + stale-on-null cases
- [x] `check_runtime_agnostic` passes on the new module
- [x] No caller rewired yet (additive-only); existing tests unchanged and green

## Risk Assessment

**Low.** Pure additive module + one constant. No behavior change — nothing imports it yet. The one subtlety is stale-on-null: the earlier draft inverted this (false-on-null), which the red-team caught as a behavior change + cross-gate split (S2/M2). The TDD tests now explicitly pin stale-on-null to match the originals; getting this wrong would flip the inbound gate's defensiveness on malformed state, so the tests are the gate.
