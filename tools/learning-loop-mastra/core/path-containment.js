/**
 * Path containment helper — defends against path-traversal, symlink-escape,
 * and hardlink-escape attacks on user-supplied write paths.
 *
 * Exports:
 *   - resolveSafePath(root, userPath) -> absolute, realpath-resolved path iff
 *     it lives inside the realpath of `root`; throws PathContainmentError
 *     otherwise.
 *   - PathContainmentError: extends Error, carries { reason, root, userPath,
 *     resolvedPath }.
 *   - isHardlinked(absPath): returns true iff lstat(absPath).nlink > 1.
 *   - clearRealpathCache(): test-only; clears the per-process realpath(root)
 *     cache.
 *
 * Threat model:
 *   - Path traversal via `../` (realpath + startsWith containment check).
 *   - Symlink escape (realpath resolves symlinks before containment check).
 *   - Hardlink escape (lstat nlink check rejects multi-link files).
 *   - Path-arg smuggling via `:` + line suffix (defensive `:` + `..` reject;
 *     the legitimate `:line`/`:start-end`/`:key.path`/`#anchor` suffix is
 *     stripped by `stripEvidenceAnchor` BEFORE this helper sees the path;
 *     a bare `:symbol` suffix carries no `..` and is allowed through).
 *
 * Residual / out of scope:
 *   - Windows UNC / device paths (deferred).
 *   - Sub-millisecond TOCTOU races between two calls in different processes.
 *     Callers MUST invoke `resolveSafePath` at the moment of use (inside the
 *     tool's execute body, immediately before fs.writeFileSync) — not only
 *     in the gate. The gate is pre-flight; the execute body is the actual
 *     write. See plan 260701-2250-plan-5-lite-r2-lim4 phase-02 NF3.
 */
import { realpathSync, lstatSync } from "node:fs";
import { isAbsolute, resolve as pathResolve, sep } from "node:path";

const realpathCache = new Map();  // canonicalRoot input -> realpath

export class PathContainmentError extends Error {
  constructor(reason, { root, userPath, resolvedPath }) {
    super(`PathContainmentError: ${reason} (root=${root}, userPath=${userPath}, resolvedPath=${resolvedPath})`);
    this.name = "PathContainmentError";
    this.reason = reason;
    this.root = root;
    this.userPath = userPath;
    this.resolvedPath = resolvedPath;
  }
}

function canonicalRoot(root) {
  if (!realpathCache.has(root)) {
    try {
      realpathCache.set(root, realpathSync(root));
    } catch {
      throw new PathContainmentError("realpath_failed", { root, userPath: root, resolvedPath: null });
    }
  }
  return realpathCache.get(root);
}

export function clearRealpathCache() {
  realpathCache.clear();
}

/* istanbul ignore next -- error fallback is exercised by tests but covered as defensive */
export function isHardlinked(absPath) {
  try {
    const stats = lstatSync(absPath);
    // Directories always have nlink >= 2 (`.` and `..`); the R5 hardlink-escape
    // threat only applies to files (hardlinks to directories are disallowed on
    // Linux/macOS). Skipping directories prevents false-positives on legit
    // directory targets (e.g. `step.cwd`, `resolveSafePath(root, '.')`).
    if (stats.isDirectory()) return false;
    return stats.nlink > 1;
  } catch {
    // File missing or unreadable: caller decides (resolveSafePath treats
    // missing as outside_root via realpath ENOENT before reaching here).
    return false;
  }
}

export function resolveSafePath(root, userPath) {
  // 1. Validate inputs
  if (typeof userPath !== "string" || userPath.length === 0) {
    throw new PathContainmentError("traversal_detected", { root, userPath, resolvedPath: null });
  }
  if (userPath.includes("\0")) {
    throw new PathContainmentError("traversal_detected", { root, userPath, resolvedPath: null });
  }
  // R15: defensive reject of path-traversal payloads smuggled after a colon.
  // stripEvidenceAnchor (caller-side) strips legitimate `:line` / `:start-end`
  // / `#anchor` / `:key.path` suffixes BEFORE this helper sees the path. A
  // residual `:` alongside `..` is the smuggling vector (e.g.
  // `tools/foo.js:../../etc/passwd`); reject it. A bare `:symbol` ref (e.g.
  // `audit_output.rs:build_audit_sarif`) carries no `..` and is allowed through
  // to realpath, which maps a non-existent file to `outside_root` (missing-file
  // semantics, preserved by callers). Realpath containment is the primary
  // defense; this guard is belt-and-suspenders for the `:` + `..` shape.
  if (userPath.includes(":") && userPath.includes("..")) {
    throw new PathContainmentError("traversal_detected", { root, userPath, resolvedPath: null });
  }

  // 2. Resolve to absolute
  const absUserPath = isAbsolute(userPath) ? userPath : pathResolve(root, userPath);

  // 3. Realpath (resolves symlinks)
  let realUser;
  try {
    realUser = realpathSync(absUserPath);
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new PathContainmentError("outside_root", { root, userPath, resolvedPath: null });
    }
    throw new PathContainmentError("realpath_failed", { root, userPath, resolvedPath: null });
  }

  // 4. Containment check
  const realRoot = canonicalRoot(root);
  if (realUser !== realRoot && !realUser.startsWith(realRoot + sep)) {
    throw new PathContainmentError("outside_root", { root, userPath, resolvedPath: realUser });
  }

  // 5. Hardlink check (R5)
  if (isHardlinked(realUser)) {
    throw new PathContainmentError("hardlink_rejected", { root, userPath, resolvedPath: realUser });
  }

  return realUser;
}