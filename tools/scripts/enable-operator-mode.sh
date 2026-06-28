#!/usr/bin/env bash
# Enable operator-mode for MCP tool calls that require elevated privileges
# (meta_state_promote_rule, meta_state_log_change with supersedes, etc.).
# Idempotent: safe to source multiple times.
export OPERATOR_MODE=1
echo "OPERATOR_MODE=$OPERATOR_MODE"
