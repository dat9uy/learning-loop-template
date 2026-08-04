#!/usr/bin/env node
/**
 * Universal PostToolUseFailure hook — captures recurring toolchain-command
 * failures (fallow:gate, pnpm test*, build, vitest, etc.) into the gate
 * decision log so the SessionStart recurrence tracker can pick them up.
 *
 * Filter layers (in order, each exits 0 on miss):
 *   1. tool_name === "bash"            — only model-initiated shells
 *   2. command matches toolchain set   — noise control (no stderr payload,
 *                                       every shell false-positive would land
 *                                       here). The toolchain set is a
 *                                       maintained list at the top of the file.
 *   3. redact via normalizePrefix      — sliding 50-char cap + quote/whitespace
 *                                       collapse. The recurrence tracker keys
 *                                       off (rule_id, normalize, session_id) so
 *                                       raw commands never escape into the
 *                                       registry.
 *
 * Fail-open: any throw exits 0 silently — PostToolUseFailure hooks must not
 * block the model. Capture is silent: no hookSpecificOutput envelope
 * (the recurring-false-positive registry surface is the loop's self-model,
 * not the agent context).
 *
 * Companion recurrence tracker groups entries by
 * (rule_id="toolchain-failure", normalized_prefix, session_id) and files a
 * finding when the count crosses 3 in a single session — reuses the
 * Channel A grouping code unchanged. With `toolchain-failure` as the
 * rule_id, this channel is partitioned from `gate-logic-bug` escalations:
 * cross-class collapsing is impossible because rule_id is in the hash input.
 */

import { readFileSync } from "node:fs";

import {
  parseInput,
  normalizeToolName,
  extractCommand,
} from "./lib/protocol-adapter.js";
import { appendDecisionLog } from "../../core/gate-decision-log.js";
import { getSessionId } from "../../core/worktree-session-id.js";
import { normalizePrefix } from "../../core/recurrence-tracker.js";
import { resolveRoot } from "#lib/resolve-root.js";

const SESSION_ID_MAX_LEN = 64;
// UUID v4 shape: 8-4-4-4-12 hex chars separated by hyphens.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve session_id for the current decision-log entry.
 * Trust harness UUID; fall back to worktree-scoped session id from
 * getSessionId(root), tagged session_id_tier=fallback so the recurrence
 * tracker can bound its span to 24h (per the plan's clean cutover rule).
 */
function resolveSessionId(input, root) {
  const raw = input?.session_id;
  if (typeof raw === "string" && raw.length > 0 && raw.length <= SESSION_ID_MAX_LEN && UUID_RE.test(raw)) {
    return { session_id: raw, session_id_tier: "real" };
  }
  return { session_id: getSessionId(root), session_id_tier: "fallback" };
}

// Toolchain-pattern set: commands we WANT to capture on failure. Adding a
// new toolchain command means extending this list. Non-matching commands
// are silently filtered (the hook is for toolchain noise, not every shell
// exit code).
//
// Order matters for readability only — first match wins conceptually, but
// all patterns are anchored to ^pnpm so each string is matched in isolation.
// Use simple `^pnpm <verb>` prefixes; do NOT match `pnpm exec <anything>`
// generally (that would catch secrets).
const TOOLCHAIN_PATTERNS = [
  /^pnpm\s+fallow\b/,
  /^pnpm\s+test\b/,
  /^pnpm\s+run\s+build\b/,
  /^pnpm\s+exec\s+vitest\b/,
];

function isToolchainCommand(command) {
  if (typeof command !== "string" || !command) return false;
  return TOOLCHAIN_PATTERNS.some((re) => re.test(command));
}

function main() {
  // Fail-open: any throw exits 0 silently. PostToolUseFailure hooks must
  // not block the model; the recurring-false-positive registry surface is
  // the observability channel.
  try {
    const stdin = readFileSync(0, "utf8");
    const input = parseInput(stdin);

    if (normalizeToolName(input.tool_name) !== "bash") process.exit(0);
    const command = extractCommand(input.tool_input);
    if (!command) process.exit(0);
    if (!isToolchainCommand(command)) process.exit(0);

    const root = resolveRoot();
    const session = resolveSessionId(input, root);

    appendDecisionLog(root, {
      command_prefix: normalizePrefix(command),
      rule_id: "toolchain-failure",
      decision: "toolchain-failure",
      reason: "Bash toolchain command exited non-zero (PostToolUseFailure)",
      matched_pattern: "post-tool-use-failure",
      skipped_via_override: false,
      session_id: session.session_id,
      session_id_tier: session.session_id_tier,
    });
  } catch {
    // Fail-open: capture failure must not block the model.
  }
  process.exit(0);
}

main();
