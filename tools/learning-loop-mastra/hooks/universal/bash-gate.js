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
import { resolveSessionId } from "./lib/resolve-session-id.js";
import { resolveRoot } from "#lib/resolve-root.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  if (decision.decision === "ok") {
    // Separate non-permission telemetry channel: a proven inert-data match
    // carries `decision: "ok"` plus `event: "unexpected-match"`. Append the
    // log entry (the recurrence tracker consumes it) but emit NO
    // hookSpecificOutput envelope — the command is allowed and the harness
    // must not see a deny/allow override. Ordinary `ok` commands are NOT
    // logged globally — only this explicit event adds an ok line.
    if (decision.event === "unexpected-match") {
      appendDecisionLog(root, buildLogEntry(decision, command, session));
    }
    return;
  }
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
    // Optional evaluator-provenance fields — copied when present so the
    // cross-surface decision log carries the producer marker + discriminated
    // pair for the recurrence tracker. Absent for non-evaluator decisions
    // (constraint blocks, path writes), matching the pre-provenance shape.
    ...(decision.event_source !== undefined && { event_source: decision.event_source }),
    ...(decision.match_origin !== undefined && { match_origin: decision.match_origin }),
    ...(decision.candidate_kind !== undefined && { candidate_kind: decision.candidate_kind }),
    ...(decision.event !== undefined && { event: decision.event }),
  };
}

main();
