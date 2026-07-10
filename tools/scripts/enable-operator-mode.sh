#!/usr/bin/env bash
# LEGACY / NO-OP.
#
# Plan 260711-0030 Phase 6: this script previously exported OPERATOR_MODE=1
# to unlock operator-only MCP tools (meta_state_promote_rule, meta_state_log_change
# with supersedes, meta_state_sweep apply=true). The actual gate is
# LOOP_SESSION_MODE === "live" (strict equality); OPERATOR_MODE was dissolved in
# plan 260708-0833 and is no longer read by any code path. This script is
# preserved so existing operator muscle memory doesn't break with a confusing
# "command not found", but it has no effect.
#
# The correct way to enter a live operator session is:
#   export LOOP_SESSION_MODE=live
# (set in the operator's shell before invoking the MCP server).
echo "enable-operator-mode.sh is a no-op. Use: export LOOP_SESSION_MODE=live" >&2
return 0 2>/dev/null || exit 0