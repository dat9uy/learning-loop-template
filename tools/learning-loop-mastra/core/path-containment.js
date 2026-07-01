import { sep, isAbsolute, normalize } from "node:path";
import { existsSync, realpathSync } from "node:fs";

/**
 * Error thrown when a user-supplied path fails the containment check.
 *
 * @property {string} code — one of: "outside_root", "empty", "empty_root".
 */
export class PathContainmentError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "PathContainmentError";
    this.code = code;
  }
}

// Key the cache by canonical realRoot (the resolved canonical form), NOT the
// caller-provided `root` string. Avoids stale cache hits when the same
// logical root is invoked with different string forms (e.g., trailing sep,
// symlinked tmpdir). Per LIM-4 phase notes.
const _realRootCache = new Map();

function resolveRealRoot(root) {
  if (_realRootCache.has(root)) return _realRootCache.get(root);
  const real = realpathSync(root);
  _realRootCache.set(root, real);
  return real;
}

/**
 * Resolve a user-supplied path against the project root, enforcing that
 * the result is contained inside `root` after symlink resolution. Throws
 * PathContainmentError when the path escapes or is malformed.
 *
 * Behavior:
 *   - Absolute paths OUTSIDE `root` → throw "outside_root".
 *   - Relative paths that traverse outside `root` → throw "outside_root".
 *   - Existing paths whose resolved realpath is outside `root` (symlink
 *     detected) → throw "outside_root".
 *   - Paths inside `root` (existing or non-existing leaf) → return resolved
 *     absolute path.
 *   - Empty / non-string inputs → throw "empty".
 *
 * @param {string} userPath
 * @param {string} root — project root directory.
 * @returns {string} — resolved absolute path.
 */
export function resolveInsideRoot(userPath, root) {
  if (typeof userPath !== "string" || userPath.length === 0) {
    throw new PathContainmentError("path must be a non-empty string", "empty");
  }
  if (!root || typeof root !== "string") {
    throw new PathContainmentError("root must be a non-empty string", "empty_root");
  }
  const realRoot = resolveRealRoot(root);
  const candidate = isAbsolute(userPath)
    ? userPath
    : normalize(`${realRoot}${sep}${userPath}`);
  // Only realpath the candidate if it actually exists; for non-existing
  // leaves we return the joined candidate.
  const resolved = existsSync(candidate) ? realpathSync(candidate) : candidate;
  const inside =
    resolved === realRoot || resolved.startsWith(realRoot + sep);
  if (!inside) {
    throw new PathContainmentError(
      `path escapes project root: ${userPath}`,
      "outside_root",
    );
  }
  return resolved;
}

/**
 * Test-only: clear the realRoot cache. Production code must not call this.
 */
export function _clearRealRootCacheForTests() {
  _realRootCache.clear();
}
