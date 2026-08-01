import { readFileSync } from "node:fs";
import { readFromAllSurfaces } from "./surfaces.js";
// per-worktree session ID scopes the marker file.
// readLastOperatorMessage now takes a `sessionId` arg and looks for the
// session-suffixed filename; without it, falls back to the legacy name for
// migration compatibility.
import { getSessionId } from "./worktree-session-id.js";
// Per-surface tracking toggle: a paused surface's stale observations are
// skipped by the inbound gate's stale-observation scan so the gate and the
// writers agree on what gets surfaced. Mirrors the writer-side pause check
// added to runtime_state_record and meta_state_dispatch_finding.
import { isSurfacePaused } from "./runtime-tracking.js";
// shared constant + unified marker predicate. The
// local MARKER_TTL_MS and the meta/non-meta branch are gone; both the
// freshness guard and the per-observation check use the same primitive the
// inbound gate uses (Phase 3).
import { OBSERVATION_STALENESS_WINDOW_MS } from "./constants.js";
import {
  observationReferenceTimeMs,
  isObservationStaleByMarker,
} from "./observation-staleness.js";

/** Apply TTL filter to a parsed marker; returns the marker if valid, else null. */
function isMarkerFresh(marker) {
  if (!marker || !marker.timestamp) return null;
  const markerTime = new Date(marker.timestamp).getTime();
  if (isNaN(markerTime)) return null;
  if (Date.now() - markerTime > OBSERVATION_STALENESS_WINDOW_MS) return null;
  return marker;
}

/**
 * Read the last operator message marker written by inbound-state-gate.cjs.
 * Returns { timestamp, prompt_snippet } or null if not found or expired.
 * Markers older than OBSERVATION_STALENESS_WINDOW_MS are treated as non-existent.
 *
// scoped per-session via the session id argument
 * (defaults to getSessionId(root) for the current worktree). Backward-compat:
 * when `sessionId` is null/undefined the legacy un-suffixed filename is also
 * read so existing markers aren't orphaned.
 */
export function readLastOperatorMessage(root, surface, sessionId = getSessionId(root)) {
  try {
    // Priority 1: env var (operator override).
    if (process.env.GATE_MARKER_PATH) {
      const marker = isMarkerFresh(JSON.parse(readFileSync(process.env.GATE_MARKER_PATH, "utf8")));
      if (marker) return marker;
    }

    // Priority 2 + 3: surface iteration via the helper. Read the session-scoped
    // marker first; fall back to the legacy un-suffixed filename for migration.
    const scopedNames = sessionId
      ? [`.last-operator-message-${sessionId}`]
      : [];
    for (const name of scopedNames) {
      const hits = readFromAllSurfaces(root, name);
      for (const hit of hits) {
        const marker = isMarkerFresh(hit.parsed);
        if (marker) return marker;
      }
    }
    // Legacy fallback (un-suffixed filename).
    const legacyHits = readFromAllSurfaces(root, ".last-operator-message");
    for (const hit of legacyHits) {
      const marker = isMarkerFresh(hit.parsed);
      if (marker) return marker;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if observations are stale relative to the last operator state-change message.
 * Returns { stale, reason, observation_id } or { stale: false }.
 *
// rewritten onto the unified primitives. The
 * meta/non-meta branch and the sidecar re-read + `reduce(latest)` are gone.
 * Phase 2's projection dedup guarantees that `obs.updated_at` IS the
 * authoritative per-surface-latest timestamp, so the marker predicate
 * (`isObservationStaleByMarker`) reads `obs.updated_at` directly — no
 * sidecar re-read. Stale-on-null (matches the originals — `findStaleObservations`
 * from gate-logic.js and this function's own pre-rewrite meta branch, both
 * since removed) preserves F1 defensiveness on malformed
 * state. The `status !== "active"` guard and the paused-surface
 * try/catch-degrade-to-not-paused skip are preserved verbatim.
 *
 * The "No runtime-state entry" branch is dropped (unreachable post-Phase-2:
 * an observation reaching this function always originates from a sidecar
 * row, so a sidecar-with-no-row-for-surface cannot happen via the gate's
 * real input). A missing `updated_at` hits the stale-on-null "no updated_at"
 * reason instead.
 */
export function checkObservationStaleness(observations, root) {
  const marker = readLastOperatorMessage(root);
  if (!marker || !marker.timestamp) return { stale: false };

  const markerTime = new Date(marker.timestamp).getTime();
  if (isNaN(markerTime)) return { stale: false };

  for (const obs of observations) {
    if (obs.status !== "active") continue;

    // Paused surfaces are skipped — a surface the operator explicitly
    // paused should not surface stale-observation warnings. The skip is
    // gated on `isSurfacePaused` (operator's explicit choice); unpausing
    // restores the warnings. This is a READ gate: writers fail closed on a
    // malformed tracking sidecar, but here a load failure must degrade to
    // "not paused" — otherwise a corrupt sidecar would block every gated
    // command.
    let paused = false;
    try {
      paused = isSurfacePaused(root, obs.affected_system);
    } catch {
      paused = false;
    }
    if (paused) continue;

    if (isObservationStaleByMarker(obs, markerTime)) {
      const ref = observationReferenceTimeMs(obs);
      const reason = ref === null
        ? `Observation "${obs.id || obs.constraint}" has no updated_at. Operator sent state-change at ${marker.timestamp}. Update the observation before proceeding.`
        : `Observation "${obs.id || obs.constraint}" updated at ${obs.updated_at}, but operator sent state-change at ${marker.timestamp}. Observation may be stale. Update before proceeding.`;
      return {
        stale: true,
        reason,
        observation_id: obs.id || obs.constraint,
      };
    }
  }
  return { stale: false };
}
