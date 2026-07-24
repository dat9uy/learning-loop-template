// core/runtime-tracking.js — operator-controlled per-surface tracking toggle.
//
// The tracking lifecycle is in-band in runtime-state.jsonl
// (`kind: budget-state`, `status: paused|stopped`, canonical id per
// surface). The `.loop/runtime-tracking.json` sidecar is retired — no
// tool writes it and nothing reads it.
//
// `isSurfacePaused` is the only canonical reader; it queries the
// surface's budget-state entities' latest `status` and THROWS on a
// corrupt sidecar line or budget-state row so a stopped surface cannot
// silently un-stop. Read-gate callers (`core/inbound-state.js`,
// `core/evaluate-inbound-gate.js`) wrap it in try/catch so a corrupt
// read degrades to "not paused" (the gate must fail-open). Writer
// callers (`runtime_state_record`, `meta_state_dispatch_finding`) do
// NOT catch — writers fail-closed at the mutation boundary.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SURFACES } from "./surfaces.js";
import { readBudgetTrackingState } from "./runtime-state.js";

/**
 * Canonical paused-surface check. Reads the surface's latest
 * `kind: budget-state` status (paused | stopped → true). Throws on
 * corrupt sidecar state — the writer path must fail-closed.
 *
 * @param {string} root
 * @param {string} surface
 * @returns {boolean}
 */
export function isSurfacePaused(root, surface) {
  const status = readBudgetTrackingState(root, surface);
  return status === "paused" || status === "stopped";
}

// Mirrors the 30-minute TTL in core/gate-logic.js `readPreflightMarker`.
const MARKER_TTL_MS = 30 * 60 * 1000;

/**
 * True when any runtime surface carries a FRESH named preflight marker
 * (`<surface>/coordination/<markerFile>` with a `completed_at` within
 * the 30-minute TTL, matching `readPreflightMarker` in
 * core/gate-logic.js). Missing, unparseable, timestamp-less, and stale
 * markers all count as absent — a lifecycle operation authorized by a
 * marker must not inherit indefinite authorization from an old file.
 *
 * @param {string} root
 * @param {string} markerFile — e.g. ".loop-preflight-runtime-tracking"
 * @returns {boolean}
 */
export function hasSurfacePreflightMarker(root, markerFile) {
  return SURFACES.some((surface) => {
    const markerPath = join(root, surface, "coordination", markerFile);
    try {
      const marker = JSON.parse(readFileSync(markerPath, "utf8"));
      if (!marker.completed_at) return false;
      const ts = new Date(marker.completed_at);
      if (isNaN(ts.getTime())) return false;
      return Date.now() - ts.getTime() <= MARKER_TTL_MS;
    } catch {
      return false;
    }
  });
}
