/**
 * R2 write-gate wrapper (F2, F5, F6 / Plan 5-Lite Phase 1).
 *
 * Composes the gating chain for every MCP tool execute:
 *
 *   1. detectPathFields({ tool, args }) — collect declared write-path values.
 *      Empty set (pathFields: []) short-circuits to allow (passthrough).
 *   2. For each path: resolveSafePath (Phase 2 path containment) — throws first
 *      on traversal / symlink / hardlink escape. For new files that do not yet
 *      exist (ENOENT), the parent directory is verified instead so legitimate
 *      new-file writes are not blocked by the gate's pre-flight.
 *   3. checkR2Ownership (R2 ownership) — throws cross_runtime_write_denied on
 *      a miss. Denial is logged via appendR2DenialLog BEFORE the throw.
 *   4. execute(args, context) — runs the original tool body.
 *
 * The pin runtime id is read once per call via getPinnedRuntimeId() (set at
 * server boot by pinRuntimeIdAtBoot). The allowlist is loaded lazily on the
 * first gated call (cached for process lifetime per root; invalidated by the
 * update_r2_allowlist tool).
 *
 * This is the SINGLE write-authorization point in createLoopTool.
 */

import { dirname as pathDirname, resolve as pathResolve, normalize as pathNormalize } from "node:path";
import { resolveSafePath, PathContainmentError } from "../core/path-containment.js";
import { detectPathFields } from "../core/r2/path-field-detector.js";
import { checkR2Ownership } from "../core/r2/ownership.js";
import { loadAllowlist } from "../core/r2/allowlist-cache.js";
import { appendR2DenialLog } from "../core/r2/denial-log.js";
import { getPinnedRuntimeId } from "../core/identity-pin.js";
import { findProjectRoot } from "../core/gate-logic.js";

/**
 * Wrap a tool's execute function with the R2 write-gate.
 *
 * @param {{ id: string, execute: Function, pathFields?: string[] }} params
 * @returns {Function} gated execute (args, context) => result
 */
export function withR2Gate({ id, execute, pathFields }) {
  const tool = { pathFields };
  return async function gatedExecute(args, context) {
    const root = findProjectRoot();
    const paths = detectPathFields({ tool, args });
    if (paths.size === 0) {
      // No declared write-path args → passthrough allow (pathFields: [] opt-out).
      return execute(args, context);
    }
    const runtime = getPinnedRuntimeId();
    const allowlist = loadAllowlist(root);
    for (const userPath of paths) {
      const resolved = resolveForGate(root, userPath); // may throw PathContainmentError
      const decision = checkR2Ownership({ runtime, path: userPath, allowlist, root });
      if (!decision.allowed) {
        const hint = decision.hint ??
          `Path "${userPath}" is not writable by runtime "${runtime}". Edit .loop/r2-allowlist.json via the update_r2_allowlist MCP tool.`;
        const denial = {
          error: "cross_runtime_write_denied",
          runtime,
          tool: id,
          path: userPath,
          hint,
          denied_at: new Date().toISOString(),
          normalized_path: decision.normalized_path ?? resolved,
          reason: decision.reason,
        };
        appendR2DenialLog(root, denial);
        const err = new Error(JSON.stringify(denial));
        err.name = "R2WriteDeniedError";
        err.denial = denial;
        throw err;
      }
    }
    return execute(args, context);
  };
}

/**
 * Resolve a user path for the gate. Existing files/symlinks are realpath-
 * resolved via resolveSafePath (throws on escape). New files that do not yet
 * exist (ENOENT) fall back to verifying the parent directory is contained,
 * so the gate does not block legitimate new-file writes (the actual write
 * site re-runs resolveSafePath per Phase 2 NF3).
 */
function resolveForGate(root, userPath) {
  try {
    return resolveSafePath(root, userPath);
  } catch (err) {
    if (!(err instanceof PathContainmentError)) throw err;
    if (err.reason !== "outside_root") throw err;
    // ENOENT (new file): verify the parent directory is contained instead.
    const parent = pathDirname(userPath);
    if (parent === "." || parent === userPath) {
      // no parent to verify — re-throw the original escape
      throw err;
    }
    try {
      resolveSafePath(root, parent);
    } catch (parentErr) {
      throw parentErr; // parent escapes → real violation, surface it
    }
    // parent contained; new file is OK. Return normalized path for logging.
    return pathNormalize(pathResolve(root, userPath));
  }
}