import { relative, isAbsolute } from "node:path";
import { readFileSync, existsSync } from "node:fs";

/**
 * R2 per-runtime write allowlist (Plan 5 Phase 2).
 *
 * - Run an allowlist through `loadAllowlist(filePath)` at server boot.
 * - For every path-bearing tool input, call `checkR2Ownership(runtime_id,
 *   absPath, allowlist, root)` which returns `{ ok, scope?, reason?, hint?, path? }`.
 *
 * Decision precedence (first match wins):
 *   1. Path outside root → "outside_root" deny.
 *   2. Path matches `protected_paths` → "protected_path" deny (immutable for v1).
 *   3. Path matches `universal` patterns → allow with scope "universal".
 *   4. Path matches this runtime's `own` patterns → allow with scope "own".
 *   5. Path matches this runtime's `deny` patterns → "cross_runtime_write" deny.
 *   6. Default deny → "cross_runtime_write" with hint to extend the allowlist.
 *
 * Glob syntax (built-in `RegExp` per Plan 5 red-team Finding 12 — no `minimatch`):
 *   - `**` → any characters including `/`
 *   - `*`  → any characters except `/`
 *   - `?`  → single non-`/` character
 *   - All other regex metacharacters are escaped.
 */

let _cachedAllowlist = null;

/**
 * Translate a single glob pattern to a regular expression.
 * Anchored to the full path (^...$).
 */
export function globToRegex(glob) {
  let re = "^";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      re += ".*";
      i++;
    } else if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else if (/[.+^$|(){}\[\]\\]/.test(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  re += "$";
  return new RegExp(re);
}

/**
 * Load + validate an allowlist JSON file. Returns the parsed object or null.
 * @param {string} filePath
 * @returns {object|null}
 */
export function loadAllowlist(filePath) {
  if (!existsSync(filePath)) return null;
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  return validateAllowlist(data) ? data : null;
}

/**
 * Test-only: pin the allowlist in memory.
 */
export function _setAllowlistForTests(allowlist) {
  _cachedAllowlist = allowlist;
}

function validateAllowlist(data) {
  if (!data || typeof data !== "object") return false;
  if (data.version !== 1) return false;
  if (typeof data.runtimes !== "object" || data.runtimes === null) return false;
  if (!Array.isArray(data.universal) && !Array.isArray(data.protected_paths)) return false;
  return true;
}

/**
 * The core R2 ownership check.
 *
 * @param {string} runtimeId — verified identity from LIM-3 verifier.
 * @param {string} absPath — already-resolved absolute path inside root.
 * @param {object} allowlist — parsed allowlist (from loadAllowlist).
 * @param {string} root — project root for relative-path computation.
 * @returns {{ ok: boolean, scope?: "universal"|"own", reason?: string, runtime?: string, path?: string, hint?: string }}
 */
// fallow-ignore-next-line complexity
export function checkR2Ownership(runtimeId, absPath, allowlist, root) {
  if (!allowlist || !allowlist.runtimes) {
    return { ok: false, reason: "no-allowlist", runtime: runtimeId };
  }
  const entry = allowlist.runtimes[runtimeId];
  if (!entry || entry.identity !== runtimeId) {
    return { ok: false, reason: "unknown_runtime", runtime: runtimeId };
  }
  const rel = isAbsolute(absPath)
    ? relative(root, absPath).replace(/\\/g, "/")
    : absPath;
  if (!rel || rel === "" || rel === ".") {
    return { ok: true, scope: "root", path: rel };
  }
  if (rel.startsWith("..") || rel.startsWith("/")) {
    return {
      ok: false,
      reason: "outside_root",
      runtime: runtimeId,
      path: rel,
    };
  }

  // 1) Protected paths — NO runtime may write, including operator override (v1)
  for (const protectedPat of allowlist.protected_paths ?? []) {
    if (globToRegex(protectedPat).test(rel)) {
      return {
        ok: false,
        reason: "protected_path",
        runtime: runtimeId,
        path: rel,
        hint: `Path '${rel}' is protected. No runtime session may write to it. See .loop/r2-allowlist.json#protected_paths.`,
      };
    }
  }

  // 2) Universal patterns (every runtime may write)
  for (const pat of allowlist.universal ?? []) {
    if (globToRegex(pat).test(rel)) {
      return { ok: true, scope: "universal", path: rel };
    }
  }

  // 3) Runtime's own patterns
  for (const pat of entry.own ?? []) {
    if (globToRegex(pat).test(rel)) {
      return { ok: true, scope: "own", path: rel };
    }
  }

  // 4) Explicit deny patterns
  for (const pat of entry.deny ?? []) {
    if (globToRegex(pat).test(rel)) {
      return {
        ok: false,
        reason: "cross_runtime_write",
        runtime: runtimeId,
        path: rel,
        hint: `Path '${rel}' is owned by another runtime. See .loop/r2-allowlist.json.`,
      };
    }
  }

  // 5) Default deny
  return {
    ok: false,
    reason: "cross_runtime_write",
    runtime: runtimeId,
    path: rel,
    hint: `Path '${rel}' is not in runtime '${runtimeId}' allowlist. ` +
      `Add to .loop/r2-allowlist.json if intentional.`,
  };
}
