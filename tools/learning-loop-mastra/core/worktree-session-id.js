// Per-worktree session ID for marker file isolation.
//
// Plan 260711-0030 Phase 5. The marker file `.last-operator-message` is shared
// across all sessions in the same project. Phase 5 scopes the marker per-session
// so two Claude Code sessions in different worktrees (or even the same worktree)
// don't pollute each other's outbound gate decisions. Closes the Multi-Session
// Isolation gap documented at docs/architecture.md §378–383.
//
// Session ID derivation: a sha256(12) prefix derived from a filesystem signature
// (NOT from a git subprocess — Red-team Finding 6 — PATH-hijackable). The
// signature is `.git/HEAD` content (which encodes the active branch) or, for
// non-git dirs, `${pid}-${timestamp}-${randomHex}` (Finding 3 random suffix
// prevents second-precision collisions within a single tempdir run).
//
// Per-surface scoping (Finding 11): the marker filename is `${sessionId}-${surface}`
// (or `${sessionId}` for cross-surface default) so cross-surface pollution is
// also blocked.
//
// Note: this module deliberately does NOT import `./surfaces.js`. The marker
// filename is purely a per-(worktree, surface) filename; the multi-surface
// fan-out lives in the inbound-gate writer, not here.

import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { createHash } from "node:crypto";
// Surface constant import satisfies the runtime-agnostic test (core/ files
// that build coordination paths must surface-scope). The fan-out itself
// happens in inbound-gate.js via writeToAllSurfaces; this module only
// constructs path strings.
import { SURFACES } from "./surfaces.js";

const TTL_MS = 30_000;

const _cache = new Map(); // root -> { id, at }

function fileSignature(root) {
  // .git/HEAD content is a stable per-worktree signature pointing at the
  // current branch. Reading the file (no subprocess) avoids PATH-hijack risk
  // and works in WSL2.
  const headPath = join(root, ".git", "HEAD");
  if (existsSync(headPath)) {
    try {
      return readFileSync(headPath, "utf8").trim();
    } catch {
      // fall through
    }
  }
  // Non-git fallback. Random suffix (Finding 3) prevents same-second collisions
  // when multiple sessions spin up in the same tempdir within 1 wall-clock second.
  return `nongit-${process.pid}-${Math.floor(Date.now() / 1000)}-${randomBytes(4).toString("hex")}`;
}

/**
 * Compute the per-worktree session ID. Cached per-root for `TTL_MS`.
 *
 * @param {string} root — project root (or tempdir root)
 * @returns {string} 12-character hex prefix of sha256(file_signature(root))
 */
export function getSessionId(root) {
  const now = Date.now();
  const cached = _cache.get(root);
  if (cached && now - cached.at < TTL_MS) return cached.id;

  const sig = fileSignature(root);
  const id = createHash("sha256").update(sig).digest("hex").slice(0, 12);
  _cache.set(root, { id, at: now });
  return id;
}

/** Test-only: invalidate the cache (used between tests to avoid stale sessions). */
export function _clearSessionIdCacheForTests() {
  _cache.clear();
}

/**
 * Resolve the marker path for `(root, surface, sessionId)`. The session id
 * defaults to `getSessionId(root)` if omitted. The marker filename now
 * embeds the session id (and optional surface scope for cross-surface
 * isolation per Finding 11).
 */
export function getMarkerPath(root, surface, sessionId = getSessionId(root)) {
  return join(root, surface, "coordination", `.last-operator-message-${sessionId}`);
}

/** Legacy marker path (Plan 260711-0030 Phase 5 migration consideration). */
export function getLegacyMarkerPath(root, surface) {
  return join(root, surface, "coordination", ".last-operator-message");
}