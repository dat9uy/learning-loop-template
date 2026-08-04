/**
 * Resolve session_id for a hook decision-log entry.
 *
 * Shared by the PreToolUse bash gate and the PostToolUseFailure
 * toolchain-failure capture. Trust the harness stdin only when it carries a
 * UUID-shaped value of bounded length. Anything else falls back to the
 * worktree-scoped session id from getSessionId(root), which is a
 * per-worktree coarse proxy. The fallback tier is recorded on the entry so
 * the recurrence tracker can bound its span to 24h.
 */

import { getSessionId } from "../../../core/worktree-session-id.js";

const SESSION_ID_MAX_LEN = 64;
// UUID v4 shape: 8-4-4-4-12 hex chars separated by hyphens.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {object} input — parsed stdin payload
 * @param {string} root — project root
 * @returns {{ session_id: string, session_id_tier: "real" | "fallback" }}
 */
// fallow-ignore-next-line complexity -- CRAP inflated by the subprocess-coverage blind spot (hooks run as spawned processes; exercised by hook integration tests)
export function resolveSessionId(input, root) {
  const raw = input?.session_id;
  if (typeof raw === "string" && raw.length > 0 && raw.length <= SESSION_ID_MAX_LEN && UUID_RE.test(raw)) {
    return { session_id: raw, session_id_tier: "real" };
  }
  return { session_id: getSessionId(root), session_id_tier: "fallback" };
}
