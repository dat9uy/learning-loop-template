---
title: "Unify Observation Staleness Mechanism"
description: "Resolve meta-260616T0222Z via the deeper fix: dedup readRuntimeObservations to latest-per-surface via kind-before-collapse (filter budget-state, then collapseLatestById — mirroring readBudgetTrackingState) so obs.updated_at becomes the authoritative per-surface-latest timestamp, then collapse the inbound-gate age-TTL check and the bash-gate marker-relative check onto one shared primitive — a single OBSERVATION_STALENESS_WINDOW_MS constant + observationReferenceTimeMs + two mode-predicates (age / marker), both stale-on-null. Drops the meta/non-meta branch + the load-bearing sidecar reduce. Flips the inbound gate from per-row (conservative) to per-surface-latest (precise) for canonical-id rows. TDD-structured; bash-gate staleness tests rewritten to the new model."
status: completed
priority: P1
effort: "1.5d"
tags: [gate-logic, staleness, inbound-gate, bash-gate, runtime-state, tdd, drf, meta-state]
created: 2026-07-28
---

# Unify Observation Staleness Mechanism

## Overview

`meta-260616T0222Z` flags a `loop-anti-pattern`: two parallel observation-staleness checks with independent 30-min constants that "naturally agree" but aren't enforced to agree.

- **Age-TTL** (`gate-logic.js#findStaleObservations`, `STALENESS_THRESHOLD_MS = 30*60*1000`): `now - obs.updated_at > 30min`. Used by the **inbound gate** to decide whether to write the operator-message marker.
- **Marker-relative** (`inbound-state.js#checkObservationStaleness`, `MARKER_TTL_MS = 30*60*1000`): meta branch `markerTime > obs.updated_at`; non-meta branch re-reads `runtime-state.jsonl` and `reduce(latest)` to compare `markerTime > sidecarLatest`. Used by the **bash gate** to escalate.

### What the red-team proved (and the finding understated)

The two checks are NOT pure duplicates. On multi-row budget-state surfaces they are **intentionally different policies** that only coincide on single-row surfaces:

- `readRuntimeObservations` (file-readers.js:67) calls the **raw** `readRuntimeStateRows` (runtime-state.js:58-64 — "Returns the RAW sidecar (every row)") and emits **one observation per active budget-state row**, each carrying its own row's `timestamp` as `updated_at` — *not* one per-surface-latest. `runtime_state_record` (lines 122-156) blocks a new budget-state row only when the surface is `paused`, so successive active rows for one surface are reachable (the normal budget-recording pattern).
- The bash gate's non-meta `reduce(latest)` is therefore **load-bearing** — it compensates for the projection's lack of version dedup by finding the newest active row per surface. The sidecar re-read is NOT dead code.
- The inbound gate's age check is **per-row (conservative)**: any stale row → marker. The bash gate's marker check is **per-surface-latest (precise)**: escalate only if the marker is newer than the *latest* surface state. They disagree on multi-row surfaces by design.

The finding's premise ("duplicates the semantics") is imprecise; the real DRY defect is the **unenforced-equal 30-min constants** plus the **latent projection-no-dedup** that forces the bash gate to re-read what it already has.

### Resolution (the deeper fix)

Make `readRuntimeObservations` dedup to **latest-per-surface** via **kind-before-collapse** — filter `readRuntimeStateRows` to `kind === "budget-state"` THEN `collapseLatestById` (runtime-state.js, `max_by(version)`), mirroring `readBudgetTrackingState` (runtime-state.js:343-354). The kind-agnostic `readRuntimeStateRowsLatest` is forbidden (cross-kind id-collision: a higher-version canonical-id `ledger-event` would shadow a `budget-state`). Now `obs.updated_at` IS the authoritative per-surface-latest timestamp, the bash gate's sidecar `reduce(latest)` becomes a true no-op and is dropped, and the meta/non-meta split collapses. Both gates then use one shared primitive — `OBSERVATION_STALENESS_WINDOW_MS` + `observationReferenceTimeMs(obs) = obs.updated_at` + two mode-predicates — and the inbound gate moves from per-row (conservative) to per-surface-latest (precise) for canonical-id rows, aligning with the bash gate's policy. The two 30-min constants become one.

**Trade-off accepted:** the inbound gate stops flagging an older pre-restart active row when a newer active row exists for the same surface — i.e. it becomes precise, not conservative. This is more correct (a restarted surface is fresh) and removes the cross-gate disagreement.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | One `OBSERVATION_STALENESS_WINDOW_MS` in `core/constants.js` replacing both 30-min constants | P1 |
| 2 | `readRuntimeObservations` dedups to latest-per-surface via **kind-before-collapse** (budget-state filtered before `collapseLatestById`); constraint gate + drift check unaffected | P1 |
| 3 | One `observationReferenceTimeMs` model; both predicates stale-on-null (matches originals); two pure mode-predicates in `core/observation-staleness.js` | P1 |
| 4 | Drop the meta/non-meta branch + sidecar `reduce(latest)`; bash-gate staleness tests rewritten to the new model | P1 |
| 5 | Inbound gate flips per-row → per-surface-latest (precise) for canonical-id rows; F1 invariant structurally preserved | P1 |
| 6 | Repoint + re-ground the finding's drifted `evidence_code_ref`; resolve `meta-260616T0222Z` | P2 |

## Phases

| # | Phase | Status | Priority | Effort | Deps |
|---|-------|--------|----------|--------|------|
| 1 | [Shared constant + unified predicates](./phase-01-shared-constant-and-predicates.md) | Completed | P1 | 2h | — |
| 2 | [Dedup the projection (latest-per-surface)](./phase-02-dedup-projection-latest-per-surface.md) | Completed | P1 | 2.5h | 1 |
| 3 | [Rewire inbound gate to age predicate](./phase-03-rewire-inbound-gate-to-age-predicate.md) | Completed | P1 | 1.5h | 2 |
| 4 | [Rewrite bash-gate staleness + notify-artifact](./phase-04-rewrite-bash-gate-staleness-and-notify-artifact.md) | Completed | P1 | 2.5h | 2 |
| 5 | [Re-ground, resolve finding, log change](./phase-05-re-ground-resolve-finding-log-change.md) | Completed | P2 | 1h | 3,4 |

## Architecture

```
core/constants.js
  + OBSERVATION_STALENESS_WINDOW_MS = Number(env.META_STATE_OBSERVATION_STALENESS_WINDOW_MS) || 30*60*1000
    (distinct from STALENESS_WINDOW_MS = 7 days, the findings-window)

core/observation-staleness.js   ← NEW, pure (no fs)
  import { OBSERVATION_STALENESS_WINDOW_MS } from "./constants.js"
  observationReferenceTimeMs(obs)         = parse(obs.updated_at); null if missing/NaN
  isObservationStaleByAge(obs, now)        = ref===null ? true  : (now - ref) > WINDOW   [stale-on-null]
  findObservationsStaleByAge(obs[], now)   = filter active + isObservationStaleByAge
  isObservationStaleByMarker(obs, markerTs) = ref===null ? true  : markerTs > ref        [stale-on-null]

core/file-readers.js   ← MODIFY (Phase 2, the linchpin)
  readRuntimeObservations(root):
    // kind-before-collapse (mirrors readBudgetTrackingState): filter budget-state BEFORE
    // collapseLatestById so a canonical-id ledger-event cannot shadow a budget-state.
    rows = collapseLatestById(
      readRuntimeStateRows(resolvedRoot).filter(r => (r.kind ?? "budget-state") === "budget-state")
    ).map(e => e.row)
    ... existing status=active filter + assertinvariantSync + constraint projection unchanged
  → now emits ONE observation per (surface × constraint) = the latest budget-state row, so
    obs.updated_at is the authoritative per-surface-latest timestamp
  ⚠️ NOT the kind-agnostic readRuntimeStateRowsLatest — that would let a higher-version
    canonical-id ledger-event shadow the budget-state (cross-kind collision, re-red-team F1)

core/evaluate-inbound-gate.js   ← MODIFY (Phase 3)
  import findObservationsStaleByAge from "./observation-staleness.js"  (was findStaleObservations from gate-logic.js)
  loadStaleActiveObservations: findObservationsStaleByAge(active, Date.now())
  → now per-surface-latest (precise), not per-row (conservative)

core/gate-logic.js   ← MODIFY (Phase 3)
  - delete STALENESS_THRESHOLD_MS + findStaleObservations   (the OTHER MARKER_TTL_MS at line 1 is preflight — leave it)

core/inbound-state.js   ← MODIFY (Phase 4)
  - MARKER_TTL_MS;  + OBSERVATION_STALENESS_WINDOW_MS (isMarkerFresh keyed on it)
  checkObservationStaleness rewritten: single loop over observationReferenceTimeMs + isObservationStaleByMarker
    drops: META_AFFECTED_SYSTEMS, meta/non-meta if/else, getSidecar, readRuntimeStateRows re-read, reduce(latest)
    keeps: readLastOperatorMessage, obs.status!==active guard, isSurfacePaused try/catch skip, reason strings
  → now safe because Phase 2 made obs.updated_at authoritative

core/evaluate-bash-gate.js   ← unchanged call site (checkObservationStaleness contract preserved)
tools/handlers/notify-artifact-tool.js   ← drop dead checkObservationStaleness import (keep readLastOperatorMessage)
```

### F1 preservation (the blocker, resolved)

The finding's blocker: `checkObservationStaleness` needs a marker to detect staleness, and the marker is only written *after* staleness is detected → naive consolidation bootstraps never. This design keeps the two **modes** distinct (age-set for the inbound gate's bootstrap; marker-first for the bash gate's escalation). It unifies the *primitives* (constant + refTime + threshold + stale-on-null) so the two modes provably agree. The marker remains the cache of "an age-staleness event occurred within the last WINDOW." F1's "write marker only when age-stale" (hooks/universal/inbound-gate.js:145-148, gated on `decision === "warn"`) is unchanged.

### Why stale-on-null (fixes the original semantics — red-team S2/M2)

The original `findStaleObservations` (gate-logic.js:1032,1034) returns `true` (stale) for missing/NaN `updated_at`, and `checkObservationStaleness`'s meta branch (inbound-state.js:120-126) returns stale on missing `updated_at`. Both gates treat unknown-update-time as stale (defensive). Both new predicates return stale on null ref — preserving that defensiveness and keeping the two gates **consistent** on the boundary case (red-team M2: the plan's earlier `ref===null ? false` would have split them).

## Success Criteria

- [x] One `OBSERVATION_STALENESS_WINDOW_MS` in `core/constants.js`; both old 30-min constants removed
- [x] `readRuntimeObservations` dedups kind-before-collapse (budget-state filtered before `collapseLatestById`); one obs per surface×constraint, latest
- [x] Constraint-gate decisions unchanged for active+active same-id rows; active→paused/stopped lifecycle transitions now block (intended, pinned by test); drift check unaffected
- [x] `core/observation-staleness.js` pure; 4 primitives; both predicates stale-on-null
- [x] `checkObservationStaleness` contract preserved on the **new model** (obs carries updated_at); meta/non-meta + sidecar reduce dropped
- [x] Bash-gate staleness tests rewritten to the new model and green
- [x] F1 invariants hold: fresh obs → no marker; stale obs → marker; no obs → no marker
- [x] `meta-260616T0222Z` `evidence_code_ref` repointed to `observation-staleness.js`; re-grounded; resolved
- [x] `check_runtime_agnostic` passes on the new module
- [x] Full test suite green

## Risk Assessment

- **Risk (highest — re-red-team F1):** a kind-agnostic `readRuntimeStateRowsLatest` (collapse-all-by-id, then filter-kind) would let a higher-version canonical-id `ledger-event` shadow a `budget-state` and delete it from the projection — a non-deterministic false-block (constraint gate) + silent loss of inbound bootstrap for that surface. `appendLedgerEvent` versions rows kind-agnostically by `id` (runtime-state.js:271); a canonical-id ledger-event is permitted when the surface is active (runtime-state-record-tool.js:122-126; runtime-contract.md:70). **Mitigation:** Phase 2 filters `kind === "budget-state"` BEFORE `collapseLatestById`, mirroring `readBudgetTrackingState` (runtime-state.js:343-354); the cross-kind collision TDD test (phase-02 Step 4) is the must-pass gate. The kind-agnostic `readRuntimeStateRowsLatest` is explicitly forbidden for this path.
- **Risk:** Phase 2 changes the shared reader `readRuntimeObservations`, which feeds the **constraint gate** (`checkObservationExists` → `makeGateDecision`). **Mitigation (verified, with a documented behavior change):** `makeGateDecision` (gate-logic.js:464) reads only `constraintMatch` + `observationStatus.found` — metadata-insensitive, so dedup does not change *which* row's metadata drives the decision. **However `found`/not-`found` DOES flip on lifecycle transitions** (verified post-implementation): a surface whose latest budget-state row is `paused`/`stopped` (e.g. after `runtime_state_pause` appends a higher-version paused row under the canonical id) projects NO active observation → `checkObservationExists` returns `found:false` → `makeGateDecision` blocks. Pre-dedup the older active row survived and the gate returned `ok`. This flip is **intended** (a paused/stopped surface should not satisfy the "observation required" constraint) and pinned by a regression test in `collapse-latest-budget-state-by-id.test.js`. The earlier "dedup changes which row is matched, not found/not-found" claim held only for active+active same-id rows. (Open Question closed.)
- **Risk:** Phase 2 flips the inbound gate from per-row (conservative) to per-surface-latest (precise) — a behavior change. **Mitigation:** accepted by design choice (user-approved deeper fix); more correct for restarted surfaces. Scope caveat (re-red-team M1): "precise" holds for canonical-id rows; legacy/distinct-id budget-state rows are NOT collapsed by `collapseLatestById` and stay per-row (conservative). Phase 3 TDD documents the canonical-id case explicitly.
- **Risk:** Bash-gate staleness tests (`inbound-state-runtime-state.test.js`) hand-craft observations WITHOUT `updated_at` + sidecar rows and assert sidecar-latest behavior (e.g. line 115-127 "multiple sidecar rows uses latest"). Under the new model `checkObservationStaleness` no longer reads the sidecar. **Mitigation:** Phase 4 rewrites these fixtures to the new model — observations carry `updated_at` = latest budget-state timestamp (as the projection now supplies); the sidecar-read assertions are replaced by direct-`updated_at` assertions. The "No runtime-state entry" branch (lines 93-113) is dropped (unreachable post-Phase-2) and re-mapped to the stale-on-null "no updated_at" path — one assertion-loss documented in the PR. This is a faithful rewrite, not a weakening.
- **Risk:** Finding's `evidence_code_ref` repoint triggers a grounding rejection. **Mitigation:** `meta_state_refresh_file_index` on each refactored path before `meta_state_re_verify`; resolve via change-log citation.

## Related Plans

- `260517-2300-gate-v2-staleness-fixes` (completed) — shipped the F1 invariant this plan preserves.
- `260724-1119-runtime-state-ledger-vs-budget-tracking-lifecycle` (shipped) — established `readRuntimeStateRowsLatest`/`collapseLatestById` (`max_by(version)`) and the kind-before-collapse `readBudgetTrackingState` pattern (runtime-state.js:343-354) that Phase 2 mirrors; established the `budget-state`+`active` scan this gate protects.

## Open Questions

None remaining. Validation interview resolved: (1) extract the shared `collapseLatestBudgetStateById` helper in `runtime-state.js` (DRY with `readBudgetTrackingState`); (2) rewrite the bash-gate staleness tests to the new model and drop the unreachable "No runtime-state entry" branch (one assertion-loss documented in the PR); (3) per-phase focused tests + a full-suite run in Phase 5.

<!-- slug: unify-observation-staleness-mechanism -->
