// core/runtime-tracking.js — operator-controlled per-surface tracking toggle.
//
// Sidecar: `<root>/.loop/runtime-tracking.json`, shape
//   `{schema: "runtime-tracking/v1", version: 1, paused_surfaces: string[]}`.
//
// Read-from-disk per call (NO in-process cache — the CLI one-shot path
// never hits a warm one, and the allowlist-cache's long-running process
// assumption does not hold for this low-frequency read). Fail-closed on
// malformed sidecars (the writers REFUSE to append until the operator
// repairs the corruption), mirroring `core/r2/allowlist-cache.js:39-48`
// — NOT the fail-open "tolerant → []" pattern.

import { readFileSync, existsSync, writeFileSync, renameSync, unlinkSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const RUNTIME_TRACKING_PATH = ".loop/runtime-tracking.json";

const SCHEMA = "runtime-tracking/v1";
const VERSION = 1;

/**
 * Load paused-surfaces from the operator-controlled sidecar. Absent
 * sidecar → `[]` (nothing paused). Malformed sidecar → throws
 * (fail-closed — writers must refuse, not silently unpause).
 *
 * @param {string} root
 * @returns {string[]} — sorted, deduped paused surface names
 */
export function loadPausedSurfaces(root) {
  const path = join(root, RUNTIME_TRACKING_PATH);
  if (!existsSync(path)) return [];
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`runtime_tracking_invalid_json: ${path}: ${err.message}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`runtime_tracking_invalid_schema: root must be an object at ${path}`);
  }
  if (parsed.schema !== SCHEMA) {
    throw new Error(
      `runtime_tracking_invalid_schema: expected schema "${SCHEMA}", got ${JSON.stringify(parsed.schema)} at ${path}`,
    );
  }
  if (typeof parsed.version !== "number") {
    throw new Error(`runtime_tracking_invalid_schema: missing numeric "version" at ${path}`);
  }
  if (!Array.isArray(parsed.paused_surfaces)) {
    throw new Error(`runtime_tracking_invalid_schema: paused_surfaces must be an array at ${path}`);
  }
  if (!parsed.paused_surfaces.every((s) => typeof s === "string")) {
    throw new Error(`runtime_tracking_invalid_schema: paused_surfaces entries must be strings at ${path}`);
  }
  return [...new Set(parsed.paused_surfaces)].sort();
}

/**
 * Cheap check: is `surface` in the paused set? Propagates the load
 * failure (fail-closed) so a malformed sidecar makes every writer refuse.
 *
 * @param {string} root
 * @param {string} surface
 * @returns {boolean}
 */
export function isSurfacePaused(root, surface) {
  return loadPausedSurfaces(root).includes(surface);
}

/**
 * Atomic temp+rename rewrite of the sidecar. Public for symmetry so
 * callers don't need to know the temp-path convention. The persisted
 * shape is sorted + deduped — defensive against hand-rolled writes that
 * produce a canonical form anyway.
 *
 * @param {string} root
 * @param {string[]} arr — full paused-surfaces set (NOT a delta)
 */
export function setPausedSurfaces(root, arr) {
  const target = join(root, RUNTIME_TRACKING_PATH);
  const canonical = [...new Set(arr.filter((s) => typeof s === "string"))].sort();
  const body = JSON.stringify(
    { schema: SCHEMA, version: VERSION, paused_surfaces: canonical },
    null,
    2,
  );
  const tmp = `${target}.${process.pid}-${Date.now()}.tmp`;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(tmp, body, "utf8");
  try {
    renameSync(tmp, target);
  } catch (err) {
    try { unlinkSync(tmp); } catch { /* best-effort cleanup */ }
    throw err;
  }
}
