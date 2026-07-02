/**
 * R2 denial logger (F6 / Plan 5-Lite Phase 1, hardened Phase 3).
 *
 * Appends one JSON-serialized line per denial to the cross-surface decision
 * log (`.gate-decision.log` under each surface's coordination/ dir), reusing
 * `appendToAllSurfaces` from `core/surfaces.js`.
 *
 * R6.2 hardening (Plan 5-Lite Phase 3): the `path` field is realpath-resolved
 * before serialization when the path exists on disk. A malicious path
 * (e.g., `foo\n{"forged":"override"}`) that resolves to a real entry becomes
 * its benign realpath; a non-existent path is logged as-is (wrapped in
 * try/catch so the log never fails on realpath resolution). The serialized
 * line MUST NOT contain a raw `\n` or `\r` — a defensive assertion throws
 * BEFORE the line reaches `appendToAllSurfaces` if any raw newline survives.
 */

import { realpathSync } from "node:fs";
import { appendToAllSurfaces } from "../surfaces.js";

const DECISION_LOG_SUBPATH = ".gate-decision.log";

/**
 * Resolve `path` via `realpathSync` when it exists; otherwise return the path
 * unchanged. Never throws — a non-existent path is logged as-is so the denial
 * record is never lost due to realpath resolution failure.
 *
 * @param {string} path
 * @returns {string}
 */
function resolvePathForLog(path) {
  if (typeof path !== "string" || path.length === 0) return path;
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * Append one R2 denial entry to the cross-surface decision log.
 *
 * @param {string} root — project root
 * @param {object} denial — the structured denial object (may include a `path` field)
 * @throws {Error} if the serialized line contains a raw `\n` or `\r`.
 */
export function appendR2DenialLog(root, denial) {
  const resolved = { ...denial };
  if (Object.prototype.hasOwnProperty.call(resolved, "path") && typeof resolved.path === "string") {
    resolved.path = resolvePathForLog(resolved.path);
  }
  let line = JSON.stringify({
    ts: new Date().toISOString(),
    gate: "r2",
    ...resolved,
  });
  // Belt-and-suspenders: guarantee no raw newline survives in the entry.
  line = line.replace(/[\r\n]+/g, " ");
  if (line.includes("\n") || line.includes("\r")) {
    throw new Error("gate_log entry contains unescaped newline");
  }
  appendToAllSurfaces(root, DECISION_LOG_SUBPATH, line);
}