/**
 * Session-mode declaration (plan 260708-0833-lifecycle-authority-dissolution-
 * session-mode). Replaces the per-invocation OPERATOR_MODE env-var authority
 * gate with a once-per-session declaration LOOP_SESSION_MODE=live|autonomous.
 *
 * The MCP server reads process.env.LOOP_SESSION_MODE at tool-handler entry.
 * Default = `autonomous` (fail-closed: class-approval tools refuse until `live`
 * is declared). Accepted value is strict `=== "live"` — case-sensitive, no
 * empty/garbage/multi-value handling. Any other value (unset, "autonomous",
 * "", "Live", "1", "true", "yes") returns false.
 *
 * No grant machinery: the tools' existing *_by / *_at fields remain the
 * authorship record.
 */

export function isLiveSession() {
  return process.env.LOOP_SESSION_MODE === "live";
}
