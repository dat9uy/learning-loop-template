// core/runtime-tracking.js — operator-controlled per-surface tracking toggle.
//
// Plan 260724-1119 Phase 2: the tracking lifecycle is now in-band in
// runtime-state.jsonl (`kind: budget-state`, `status: paused|stopped`,
// canonical id per surface per D8). The `.loop/runtime-tracking.json`
// sidecar is no longer written by any tool; the legacy
// `loadPausedSurfaces` / `setPausedSurfaces` / `mutatePausedSurfaces`
// helpers are retained as no-op-compat shims so existing tests +
// historical imports do not crash, but the canonical read path is
// `readBudgetTrackingState` (in `core/runtime-state.js`).
//
// `isSurfacePaused` is the only canonical reader; it queries the
// surface's canonical budget-state entity's latest `status` (R1: throws
// on corrupt budget-state rows so a stopped surface cannot silently
// un-stop). The callers (`runtime_state_record`,
// `meta_state_dispatch_finding`, `core/inbound-state.js`,
// `core/evaluate-inbound-gate.js`) wrap it in try/catch for the read
// gate so a corrupt read degrades to "not paused" (gate must fail-open).

import { existsSync } from "node:fs";
import { join } from "node:path";
import { SURFACES } from "./surfaces.js";
import { readBudgetTrackingState } from "./runtime-state.js";

/**
 * Canonical paused-surface check. Reads the surface's latest
 * `kind: budget-state` status (paused | stopped → true). Throws on a
 * corrupt budget-state row (R1) — the writer path must fail-closed.
 *
 * @param {string} root
 * @param {string} surface
 * @returns {boolean}
 */
export function isSurfacePaused(root, surface) {
  const status = readBudgetTrackingState(root, surface);
  return status === "paused" || status === "stopped";
}

/**
 * True when any surface carries the named preflight marker file
 * (`<surface>/coordination/<markerFile>`). Shared by the runtime-state
 * tools that gate on operator preflight. Plan 260724-1119 Phase 2 R2:
 * the marker is checked bare (no TTL) — the operator-audited preflight
 * pattern accepts that the operator writes the marker deliberately per
 * action; the `gate_mark_preflight` MCP tool stamps a fresh timestamp
 * on every call, so stale markers are operator-controlled.
 *
 * @param {string} root
 * @param {string} markerFile — e.g. ".loop-preflight-runtime-tracking"
 * @returns {boolean}
 */
export function hasSurfacePreflightMarker(root, markerFile) {
  return SURFACES.some((surface) =>
    existsSync(join(root, surface, "coordination", markerFile)),
  );
}

// ── Legacy sidecar shims (retained so historical imports do not crash) ──
//
// The destructive `runtime_state_prune_surface` was removed in plan
// 260724-1119 (D4). `setPausedSurfaces` / `mutatePausedSurfaces` /
// `loadPausedSurfaces` are NOT used by any current code path (pause /
// resume / stop now write in-band to runtime-state.jsonl) but remain as
// dead-code shims for tests that still reference them. A future cleanup
// pass can remove these once the test suite migrates to the in-band model.

const RUNTIME_TRACKING_PATH = ".loop/runtime-tracking.json";
const SCHEMA = "runtime-tracking/v1";
const VERSION = 1;

export function loadPausedSurfaces(_root) {
  // Plan 260724-1119: legacy sidecar is no longer written. Returning []
  // is a safe no-op (callers treat [] as "nothing paused").
  return [];
}

export function setPausedSurfaces(_root, _arr) {
  // No-op shim — pause/resume now write in-band to runtime-state.jsonl.
}

export async function mutatePausedSurfaces(_root, _mutate) {
  // No-op shim — pause/resume now write in-band to runtime-state.jsonl.
  return [];
}

