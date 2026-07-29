---
phase: 4
title: "Rewrite Bash-Gate Staleness + Notify-Artifact"
status: pending
priority: P1
effort: "2.5h"
dependencies: [2]
---

# Phase 4: Rewrite Bash-Gate Staleness + Notify-Artifact

## Overview

Rewrite `checkObservationStaleness` internals onto the unified primitives — `observationReferenceTimeMs` + `isObservationStaleByMarker` — and drop the meta/non-meta branch, the `getSidecar` lazy cache, the `readRuntimeStateRows` re-read, and the `reduce(latest)`. **Safe only because Phase 2 made `obs.updated_at` the authoritative per-surface-latest timestamp** — the sidecar reduce is now a true no-op. The public contract (`{stale, reason, observation_id}` / `{stale:false}`) is preserved for the cases that remain; the bash-gate staleness tests are rewritten to the new model (they hand-crafted observations + sidecars; the new model takes `updated_at` directly). Also re-key `isMarkerFresh` on the shared constant, and drop the dead `checkObservationStaleness` import in `notify-artifact-tool.js`.

## Requirements

- Functional: `checkObservationStaleness` uses `observationReferenceTimeMs` + `isObservationStaleByMarker`; drops `META_AFFECTED_SYSTEMS`, the meta/non-meta `if/else`, `getSidecar`, the sidecar re-read, and `reduce(latest)`.
- Functional: `isMarkerFresh` (inbound-state.js:24-30) keyed on `OBSERVATION_STALENESS_WINDOW_MS`; local `MARKER_TTL_MS` removed.
- Functional: the `obs.status !== "active"` guard and the `isSurfacePaused` try/catch skip are preserved verbatim.
- Functional: reason strings preserved for the cases that survive ("no updated_at" / "updated at X, marker at Y"). The "No runtime-state entry" reason is dropped — unreachable post-Phase-2 (an observation reaching `checkObservationStaleness` always has `updated_at` from the projection; a surface with no sidecar row produces no observation).
- Functional: `notify-artifact-tool.js` imports only `readLastOperatorMessage`.
- Non-functional: `evaluate-bash-gate.js` unchanged (contract preserved); `readLastOperatorMessage`/marker I/O/session scoping unchanged.

## Architecture

```
core/inbound-state.js
  - const MARKER_TTL_MS = 30 * 60 * 1000;
  - const META_AFFECTED_SYSTEMS = new Set(["meta", undefined, null]);
  + import { OBSERVATION_STALENESS_WINDOW_MS } from "./constants.js";
  + import { observationReferenceTimeMs, isObservationStaleByMarker } from "./observation-staleness.js";

  isMarkerFresh(marker)
    if Date.now() - markerTime > OBSERVATION_STALENESS_WINDOW_MS return null   ← was MARKER_TTL_MS

  checkObservationStaleness(observations, root):
    marker = readLastOperatorMessage(root); if (!marker) return { stale:false }
    markerTime = new Date(marker.timestamp).getTime(); if NaN → { stale:false }
    for obs of observations:
      if obs.status !== "active": continue
      if isSurfacePaused(root, obs.affected_system): continue        ← preserved (try/catch degrade)
      if isObservationStaleByMarker(obs, markerTime):               ← stale-on-null inside; markerTime > ref
        ref = observationReferenceTimeMs(obs)
        reason = ref === null
          ? `Observation "${obs.id||obs.constraint}" has no updated_at...`       ← "no updated_at" reason
          : `Observation "${obs.id||obs.constraint}" updated at ${obs.updated_at}, but operator sent state-change at ${marker.timestamp}...`
        return { stale:true, reason, observation_id: obs.id||obs.constraint }
    return { stale: false }

tools/handlers/notify-artifact-tool.js
  - import { readLastOperatorMessage, checkObservationStaleness } from "../../core/inbound-state.js"
  + import { readLastOperatorMessage } from "../../core/inbound-state.js"
```

### Why the sidecar reduce is now a no-op (the red-team S1 fix)

Pre-Phase-2, `readRuntimeObservations` emitted one observation per RAW active row, so the bash gate re-read the sidecar + `reduce(latest)` to find the newest per surface. Post-Phase-2, the projection emits one observation per surface = the latest `max_by(version)` row, with `updated_at = that row's timestamp`. So `observationReferenceTimeMs(obs)` IS the latest active-row timestamp — the reduce re-derives what's already on `obs`. Dropping it is now safe and correct.

### Why "No runtime-state entry" is dropped (red-team M1)

That branch (inbound-state.js:152-158) fired when the sidecar had no row for `obs.affected_system`. But `readRuntimeObservations` only emits observations FROM existing sidecar rows — so an observation whose surface has no sidecar row cannot reach `checkObservationStaleness` via the gate's real input. The tests that exercised it (inbound-state-runtime-state.test.js:93-113) hand-crafted observations with no `updated_at` and asserted "No runtime-state entry" — under the new model those observations hit stale-on-null with a "no updated_at" reason. Phase 4 rewrites those fixtures (Step 2), not weakens them.

### Legacy distinct-id rows stay per-row (re-red-team M2)

`collapseLatestById` dedups by `id`; legacy budget-state rows with **distinct ids** (pre-canonical-id-enforcement, or hand-crafted) are NOT collapsed → `readRuntimeObservations` emits one obs per id → `checkObservationStaleness` returns stale on the first stale obs (per-row). The writer now rejects non-canonical budget-state ids (`canonical_id_required`), so this is a legacy edge case. Keep one pin in the rewritten tests: distinct-id budget-state rows for one surface → multiple observations → per-row staleness (the conservative path survives for non-canonical rows). This documents the accepted edge rather than leaving it untested.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/inbound-state.js` (rewrite `checkObservationStaleness`, re-key `isMarkerFresh`, remove `MARKER_TTL_MS` + `META_AFFECTED_SYSTEMS`)
- Modify: `tools/learning-loop-mastra/tools/handlers/notify-artifact-tool.js` (drop dead import)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/inbound-state-runtime-state.test.js` (rewrite fixtures to the new model)
- Verify: `tools/learning-loop-mastra/core/evaluate-bash-gate.js` (unchanged)

## Implementation Steps (TDD — rewrite fixtures to the new model)

### TDD: rewrite the oracle to the new model

1. Enumerate every fixture in `inbound-state-runtime-state.test.js`. For each, decide its new expected output under the unified model:
   - meta + non-meta obs with a marker fresher than `updated_at` → stale (same as before, reason "updated at X, marker at Y").
   - obs with `updated_at` newer than marker → `{stale:false}` (same).
   - **missing `updated_at`** → stale, reason "no updated_at" (was: meta→"no updated_at"; non-meta→"No runtime-state entry"). Unify to "no updated_at".
   - **"no sidecar entries / no sidecar file"** (lines 93-113) → these fixtures hand an obs with no `updated_at`; new model → stale, reason "no updated_at" (drop the sidecar-existence reason). Rewrite the assertion.
   - **"multiple sidecar rows uses latest"** (line 115-127) → rewrite: the projection now supplies the latest `updated_at` directly, so the test becomes "obs with `updated_at = latest` and marker older → `{stale:false}`". Drop the sidecar setup; assert on `updated_at`.
   - paused surface → skip (same).
2. Update the fixtures + assertions per the table above. Run → they fail until the rewrite lands (the contract still returns the old shape).

### Implementation

3. In `inbound-state.js`: import `OBSERVATION_STALENESS_WINDOW_MS` + the two predicates; remove `MARKER_TTL_MS` + `META_AFFECTED_SYSTEMS`; re-key `isMarkerFresh`.
4. Rewrite `checkObservationStaleness` to the single-loop form above. Keep `readLastOperatorMessage`, the `status !== "active"` guard, and the `isSurfacePaused` try/catch skip. Preserve the surviving reason strings verbatim.
5. In `notify-artifact-tool.js`: drop `checkObservationStaleness` from the import.
6. Run the rewritten parity tests → green.

### Verification

7. `evaluate-bash-gate-runtime-state.test.js` → green (bash-gate behavior via preserved contract).
8. `runtime-state-no-delete-to-clear-gate.test.js` → green.
9. Cross-gate consistency test: age-stale latest-obs (inbound writes marker) → marker fresher than obs → bash gate escalates; age-fresh latest-obs → no marker → bash gate `{stale:false}`. The two gates agree on the shared constant + refTime. (Add to `__tests__/core/observation-staleness.test.js` or a gate integration file if absent.)
10. `pnpm test` focused on `inbound-state`, `evaluate-bash-gate`, `runtime-state`, `notify-artifact` test files.

## Success Criteria

- [ ] `checkObservationStaleByMarker` form; no `META_AFFECTED_SYSTEMS` / `getSidecar` / sidecar re-read / `reduce(latest)`
- [ ] `MARKER_TTL_MS` removed; `isMarkerFresh` keyed on `OBSERVATION_STALENESS_WINDOW_MS`
- [ ] Paused-surface skip preserved; surviving reason strings preserved
- [ ] "No runtime-state entry" branch dropped (unreachable post-Phase-2); fixtures rewritten, not deleted
- [ ] `notify-artifact-tool.js` imports only `readLastOperatorMessage`
- [ ] `evaluate-bash-gate.js` unchanged; its tests green
- [ ] Cross-gate consistency test shows age-write and marker-escalate agree

## Risk Assessment

**Moderate.** The rewrite is safe only because Phase 2 landed first — if Phase 2's dedup is wrong, this phase re-introduces the spurious-escalation bug the red-team found (S1). Mitigation: Phase 2's multi-row dedup test is the prerequisite gate; the cross-gate consistency test (Step 9) catches any residual disagreement. The test rewrite (Step 1-2) is the genuine effort — the old fixtures encoded the sidecar-reduce behavior, which no longer exists; rewriting them to assert on `updated_at` is correct, not a weakening, but it must be done carefully to preserve coverage of the missing-`updated_at` and paused cases. The "No runtime-state entry" drop is justified by unreachability (M1) but is the one assertion-loss to document explicitly in the PR body.
