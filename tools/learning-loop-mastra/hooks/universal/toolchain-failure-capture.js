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
 * Fail-open: any throw exits 0 — PostToolUseFailure hooks must not block the
 * model — but the failure is NOT silent: every invocation and every catch
 * appends one JSON line to `.claude/coordination/.toolchain-failure-capture.debug.log`
 * (gitignored via `*.log`), so "the event never fired" is distinguishable
 * from "the hook ran and dropped/crashed." Capture itself stays silent: no
 * hookSpecificOutput envelope (the recurring-false-positive registry surface
 * is the loop's self-model, not the agent context).
 *
 * Companion recurrence tracker groups entries by
 * (rule_id="toolchain-failure", normalized_prefix, session_id) and files a
 * finding when the count crosses 3 in a single session — reuses the
 * Channel A grouping code unchanged. With `toolchain-failure` as the
 * rule_id, this channel is partitioned from `gate-logic-bug` escalations:
 * cross-class collapsing is impossible because rule_id is in the hash input.
 */

import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  parseInput,
  normalizeToolName,
  extractCommand,
} from "./lib/protocol-adapter.js";
import { appendDecisionLog } from "../../core/gate-decision-log.js";
import { resolveSessionId } from "./lib/resolve-session-id.js";
import { normalizePrefix } from "../../core/recurrence-tracker.js";
import { resolveRoot } from "#lib/resolve-root.js";

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

// Debug trace: one JSON line per invocation/outcome to a gitignored file.
// Exists because the hook is fail-open — without it, "the harness never
// fired the event" and "the hook crashed" are indistinguishable. Never
// throws; a full command string is never logged (prefix-capped, same as
// the decision log).
const DEBUG_LOG_REL = join(".claude", "coordination", ".toolchain-failure-capture.debug.log");

function emitDebug(root, record) {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...record });
    appendFileSync(join(root, DEBUG_LOG_REL), line + "\n", "utf8");
  } catch {
    // Debug trace must never break the fail-open contract.
  }
}

// fallow-ignore-next-line complexity -- CRAP inflated by the subprocess-coverage blind spot (hook runs as a spawned process; exercised by hook integration tests)
function main() {
  // Fail-open: any throw exits 0 (traced). PostToolUseFailure hooks must
  // not block the model; the recurring-false-positive registry surface is
  // the observability channel.
  let root;
  try {
    const stdin = readFileSync(0, "utf8");
    const input = parseInput(stdin);
    root = resolveRoot();

    const toolName = normalizeToolName(input.tool_name);
    if (toolName !== "bash") {
      emitDebug(root, { outcome: "skip-non-bash", tool_name: toolName });
      process.exit(0);
    }
    const command = extractCommand(input.tool_input);
    if (!command) {
      emitDebug(root, { outcome: "skip-no-command" });
      process.exit(0);
    }
    if (!isToolchainCommand(command)) {
      emitDebug(root, { outcome: "skip-non-toolchain", command_prefix: normalizePrefix(command) });
      process.exit(0);
    }

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
    emitDebug(root, { outcome: "captured", command_prefix: normalizePrefix(command) });
  } catch (err) {
    // Fail-open: capture failure must not block the model — but it is traced.
    if (!root) {
      try { root = resolveRoot(); } catch { root = process.env.GATE_ROOT || process.cwd(); }
    }
    emitDebug(root, { outcome: "error", message: String(err && err.message || err).slice(0, 200) });
  }
  process.exit(0);
}

main();
