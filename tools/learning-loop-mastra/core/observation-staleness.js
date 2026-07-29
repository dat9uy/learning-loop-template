/**
 * Plan 260728-2323-unify-observation-staleness-mechanism Phase 1: shared
 * observation-staleness primitives. Pure module — no `fs`, no `Date.now()` in
 * predicates (callers inject `now` / `markerTs`). Replaces the two parallel
 * 30-min checks (inbound gate's `findStaleObservations` from gate-logic.js +
 * bash gate's `checkObservationStaleness` from inbound-state.js) with one
 * shared window, one reference-time model, and two mode-predicates.
 *
 * Stale-on-null: both predicates return `true` when `obs.updated_at` is
 * missing or unparseable. Preserves the original defensive semantics of
 * `findStaleObservations` (since removed from gate-logic.js) and the meta
 * branch of `checkObservationStaleness` (since rewritten in inbound-state.js)
 * — both originals treated unknown-update-time as stale, so the unification
 * keeps that behavior on the boundary case.
 */

import { OBSERVATION_STALENESS_WINDOW_MS } from "./constants.js";

/**
 * Resolve the reference timestamp for an observation. Parses
 * `obs.updated_at`; returns `null` for missing / unparseable values so the
 * mode-predicates can branch on it.
 */
export function observationReferenceTimeMs(obs) {
  if (!obs || obs.updated_at === undefined || obs.updated_at === null) return null;
  const t = new Date(obs.updated_at).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Age mode — for the inbound gate's bootstrap. Stale iff `now - ref` exceeds
 * `OBSERVATION_STALENESS_WINDOW_MS`, using strict `>` (matches the original
 * `findStaleObservations`, since removed from gate-logic.js). Equality on the boundary is
 * "not stale". Stale-on-null: a missing / unparseable `updated_at` is stale.
 */
export function isObservationStaleByAge(obs, now) {
  const ref = observationReferenceTimeMs(obs);
  if (ref === null) return true;
  return now - ref > OBSERVATION_STALENESS_WINDOW_MS;
}

/**
 * Age selector — for the inbound gate's stale-observation scan. Returns the
 * subset of `observations` that are `status === "active"` AND
 * stale-by-age (in input order). The active filter mirrors the inbound
 * gate's upstream filter so the predicate stays a pure age check.
 */
export function findObservationsStaleByAge(observations, now) {
  return observations.filter(
    (o) => o && o.status === "active" && isObservationStaleByAge(o, now)
  );
}

/**
 * Marker mode — for the bash gate's escalation. Stale iff `markerTs > ref`,
 * using strict `>` (matches the original `checkObservationStaleness`, since
 * rewritten in inbound-state.js). Equality on the boundary is "not stale". Stale-on-null:
 * a missing / unparseable `updated_at` is stale.
 */
export function isObservationStaleByMarker(obs, markerTs) {
  const ref = observationReferenceTimeMs(obs);
  if (ref === null) return true;
  return markerTs > ref;
}