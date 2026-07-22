import { readFileSync } from "node:fs";
import { readFromAllSurfaces } from "./surfaces.js";
// Plan 260711-0030 Phase 5: per-worktree session ID scopes the marker file.
// readLastOperatorMessage now takes a `sessionId` arg and looks for the
// session-suffixed filename; without it, falls back to the legacy name for
// migration compatibility.
import { getSessionId } from "./worktree-session-id.js";
// Plan 260720-1112 Phase 1: consume the shared runtime-state read path so the
// sidecar parse is no longer forked (B-widening of plan 260719-2201). One
// malformed line used to wipe the entire read to [] via the local readSidecar
// try/catch; now it's skipped (parsed → null, then .filter(Boolean)) and
// valid rows survive.
import { readRuntimeStateRows } from "./runtime-state.js";
// Per-surface tracking toggle: a paused surface's stale observations are
// skipped by the inbound gate's stale-observation scan so the gate and the
// writers agree on what gets surfaced. Mirrors the writer-side pause check
// added to runtime_state_record and meta_state_dispatch_finding.
import { isSurfacePaused } from "./runtime-tracking.js";

const MARKER_TTL_MS = 30 * 60 * 1000; // 30 minutes
const META_AFFECTED_SYSTEMS = new Set(["meta", undefined, null]);

/** Apply TTL filter to a parsed marker; returns the marker if valid, else null. */
function isMarkerFresh(marker) {
  if (!marker || !marker.timestamp) return null;
  const markerTime = new Date(marker.timestamp).getTime();
  if (isNaN(markerTime)) return null;
  if (Date.now() - markerTime > MARKER_TTL_MS) return null;
  return marker;
}

/**
 * Read the last operator message marker written by inbound-state-gate.cjs.
 * Returns { timestamp, prompt_snippet } or null if not found or expired.
 * Markers older than MARKER_TTL_MS are treated as non-existent.
 *
 * Plan 260711-0030 Phase 5: scoped per-session via the session id argument
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
 * Partitioning: observations with affected_system in (meta, undefined, null) use
 * the observation's own updated_at. Non-meta observations (vnstock, fastapi, etc.)
 * check the runtime-state.jsonl sidecar instead — the sidecar is the source of truth
 * for substrate-facing state.
 */
export function checkObservationStaleness(observations, root) {
  const marker = readLastOperatorMessage(root);
  if (!marker || !marker.timestamp) return { stale: false };

  const markerTime = new Date(marker.timestamp).getTime();
  if (isNaN(markerTime)) return { stale: false };

  // Lazy-read sidecar once for all non-meta observations.
  let sidecarCache = null;
  function getSidecar() {
    if (sidecarCache === null) sidecarCache = readRuntimeStateRows(root);
    return sidecarCache;
  }

  for (const obs of observations) {
    if (obs.status !== "active") continue;

    if (META_AFFECTED_SYSTEMS.has(obs.affected_system)) {
      // Meta (or legacy) observation: use observation's own updated_at.
      if (!obs.updated_at) {
        return {
          stale: true,
          reason: `Observation "${obs.id || obs.constraint}" has no updated_at. Operator sent state-change at ${marker.timestamp}. Update the observation before proceeding.`,
          observation_id: obs.id || obs.constraint,
        };
      }
      const obsTime = new Date(obs.updated_at).getTime();
      if (isNaN(obsTime) || markerTime > obsTime) {
        return {
          stale: true,
          reason: `Observation "${obs.id || obs.constraint}" updated at ${obs.updated_at}, but operator sent state-change at ${marker.timestamp}. Observation may be stale. Update before proceeding.`,
          observation_id: obs.id || obs.constraint,
        };
      }
    } else {
      // Non-meta observation (vnstock, fastapi, etc.): check runtime-state sidecar.
      // Phase 4 of plan 260722-1623: paused surfaces are skipped — a surface the
      // operator explicitly paused should not surface stale-observation warnings.
      // The skip is gated on `isSurfacePaused` (operator's explicit choice);
      // unpausing restores the warnings.
      if (isSurfacePaused(root, obs.affected_system)) continue;
      const sidecar = getSidecar();
      const matching = sidecar.filter((r) => r.affected_system === obs.affected_system);
      if (matching.length === 0) {
        return {
          stale: true,
          reason: `No runtime-state entry for affected_system="${obs.affected_system}". Operator sent state-change at ${marker.timestamp}. Record a runtime-state entry before proceeding.`,
          observation_id: obs.id || obs.constraint,
        };
      }
      // Find the latest sidecar entry by timestamp.
      const latest = matching.reduce((a, b) =>
        new Date(a.timestamp).getTime() >= new Date(b.timestamp).getTime() ? a : b
      );
      const sidecarTime = new Date(latest.timestamp).getTime();
      if (isNaN(sidecarTime) || markerTime > sidecarTime) {
        return {
          stale: true,
          reason: `Runtime-state for "${obs.affected_system}" last updated at ${latest.timestamp}, but operator sent state-change at ${marker.timestamp}. Sidecar may be stale. Record a new runtime-state entry before proceeding.`,
          observation_id: obs.id || obs.constraint,
        };
      }
    }
  }
  return { stale: false };
}
