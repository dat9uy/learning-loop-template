#!/usr/bin/env node
/**
 * Universal Bash Gate — PreToolUse hook for Bash/Execute commands.
 * Thin I/O adapter — all policy lives in core/evaluate-bash-gate.js.
 */

import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseInput,
  normalizeToolName,
  extractCommand,
  formatHookDecision,
} from "./lib/protocol-adapter.js";
import { evaluateBashGate } from "../../core/evaluate-bash-gate.js";
import { appendDecisionLog } from "../../core/gate-decision-log.js";
import { getSessionId } from "../../core/worktree-session-id.js";
import { resolveRoot } from "#lib/resolve-root.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SESSION_ID_MAX_LEN = 64;
// UUID v4 shape: 8-4-4-4-12 hex chars separated by hyphens.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve session_id for the current decision-log entry.
 *
 * Trust the harness stdin only when it carries a UUID-shaped value of bounded
 * length. Anything else falls back to the worktree-scoped session id from
 * getSessionId(root), which is a per-worktree coarse proxy. The fallback
 * tier is recorded on the entry so the recurrence tracker can bound its
 * span to 24h (per the plan's clean cutover rule).
 *
 * @param {object} input — parsed stdin payload
 * @param {string} root — project root
 * @returns {{ session_id: string, session_id_tier: "real" | "fallback" }}
 */
// fallow-ignore-next-line complexity -- CRAP inflated by the subprocess-coverage blind spot (hook runs as a spawned process; exercised by hook integration tests)
function resolveSessionId(input, root) {
  const raw = input?.session_id;
  if (typeof raw === "string" && raw.length > 0 && raw.length <= SESSION_ID_MAX_LEN && UUID_RE.test(raw)) {
    return { session_id: raw, session_id_tier: "real" };
  }
  return { session_id: getSessionId(root), session_id_tier: "fallback" };
}

function main() {
  const stdin = readFileSync(0, "utf8");
  const input = parseInput(stdin);

  if (normalizeToolName(input.tool_name) !== "bash") process.exit(0);
  const command = extractCommand(input.tool_input);
  if (!command) process.exit(0);

  const root = resolveRoot();
  const session = resolveSessionId(input, root);
  const decision = evaluateBashGate({ command, root });
  emitIfBlocked(decision, command, root, session);
  // Exit 0 so the harness processes the hookSpecificOutput JSON. A denied
  // call is blocked by `permissionDecision: "deny"` in that JSON; an allowed
  // call prints nothing and continues through normal permission flow.
  // Exit 2 would discard the stdout JSON and report "No stderr output".
  process.exit(0);
}

function emitIfBlocked(decision, command, root, session) {
  if (decision.decision === "ok") return;
  appendDecisionLog(root, buildLogEntry(decision, command, session));
  console.log(formatHookDecision(decision, { channel: "hookSpecificOutput" }));
}

// fallow-ignore-next-line complexity -- CRAP inflated by the subprocess-coverage blind spot (hook runs as a spawned process; exercised by hook integration tests)
function buildLogEntry(decision, command, session) {
  return {
    command_prefix: command,
    rule_id: decision.rule_id ?? null,
    decision: decision.decision,
    reason: decision.reason,
    matched_pattern: decision.pattern_type ?? decision.constraint_type ?? null,
    skipped_via_override: false,
    session_id: session?.session_id ?? null,
    session_id_tier: session?.session_id_tier ?? "fallback",
  };
}

main();
