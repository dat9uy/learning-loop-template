/**
 * Exec-mode declaration. Mirrors session-mode.js: a once-per-session env
 * declaration (META_STATE_VERIFY_EXEC=1|true) that authorizes running
 * registry-stored commands.
 *
 * Sibling to session-mode.js: session-mode authorizes operator-tier
 * mutations; exec-mode authorizes spawning external processes. The split is
 * deliberate — meta_state_re_verify is the only tool that executes
 * registry-stored verification steps, so its kill-switch stays independent
 * of LOOP_SESSION_MODE=live. A live session can mutate the registry without
 * being able to run its commands.
 *
 * Default = disabled (fail-closed). Accepted values: "1" or "true"; any
 * other value (unset, "", "0", "yes") returns false.
 */

export function isExecSession() {
  return (
    process.env.META_STATE_VERIFY_EXEC === "1" ||
    process.env.META_STATE_VERIFY_EXEC === "true"
  );
}
