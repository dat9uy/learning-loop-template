import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MARKER_TTL_MS = 30 * 60 * 1000; // 30 minutes
const SIDECAR_FILENAME = "runtime-state.jsonl";
const META_AFFECTED_SYSTEMS = new Set(["meta", undefined, null]);

/**
 * Read the runtime-state.jsonl sidecar. Returns array of parsed row objects.
 * Fail-open: returns [] on error.
 */
function readSidecar(root) {
  const path = join(root, SIDECAR_FILENAME);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf8");
    return raw
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

/**
 * Read the last operator message marker written by inbound-state-gate.cjs.
 * Returns { timestamp, prompt_snippet } or null if not found or expired.
 * Markers older than MARKER_TTL_MS are treated as non-existent.
 */
export function readLastOperatorMessage(root) {
  try {
    // Priority: env var > .claude > .factory
    if (process.env.GATE_MARKER_PATH) {
      const marker = JSON.parse(readFileSync(process.env.GATE_MARKER_PATH, "utf8"));
      if (marker && marker.timestamp) {
        const markerTime = new Date(marker.timestamp).getTime();
        if (!isNaN(markerTime) && (Date.now() - markerTime) <= MARKER_TTL_MS) {
          return marker;
        }
      }
    }

    // Try .claude/coordination
    const claudeMarker = join(root, ".claude", "coordination", ".last-operator-message");
    try {
      const marker = JSON.parse(readFileSync(claudeMarker, "utf8"));
      if (marker && marker.timestamp) {
        const markerTime = new Date(marker.timestamp).getTime();
        if (!isNaN(markerTime) && (Date.now() - markerTime) <= MARKER_TTL_MS) {
          return marker;
        }
      }
    } catch {
      // fall through
    }

    // Try .factory/coordination for Droid CLI
    const factoryMarker = join(root, ".factory", "coordination", ".last-operator-message");
    try {
      const marker = JSON.parse(readFileSync(factoryMarker, "utf8"));
      if (marker && marker.timestamp) {
        const markerTime = new Date(marker.timestamp).getTime();
        if (!isNaN(markerTime) && (Date.now() - markerTime) <= MARKER_TTL_MS) {
          return marker;
        }
      }
    } catch {
      // fall through
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
    if (sidecarCache === null) sidecarCache = readSidecar(root);
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
