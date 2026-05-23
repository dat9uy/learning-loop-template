import { readFileSync } from "node:fs";
import { join } from "node:path";

const MARKER_TTL_MS = 30 * 60 * 1000; // 30 minutes

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
 */
export function checkObservationStaleness(observations, root) {
  const marker = readLastOperatorMessage(root);
  if (!marker || !marker.timestamp) return { stale: false };

  const markerTime = new Date(marker.timestamp).getTime();
  if (isNaN(markerTime)) return { stale: false };

  for (const obs of observations) {
    if (obs.status !== "active") continue;
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
  }
  return { stale: false };
}
