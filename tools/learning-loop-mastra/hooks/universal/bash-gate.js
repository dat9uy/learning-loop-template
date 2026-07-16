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
import { resolveRoot } from "#lib/resolve-root.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function main() {
  const stdin = readFileSync(0, "utf8");
  const input = parseInput(stdin);

  if (normalizeToolName(input.tool_name) !== "bash") process.exit(0);
  const command = extractCommand(input.tool_input);
  if (!command) process.exit(0);

  const root = resolveRoot();
  const decision = evaluateBashGate({ command, root });
  emitIfBlocked(decision, command, root);
  // Exit 0 so the harness processes the hookSpecificOutput JSON. A denied
  // call is blocked by `permissionDecision: "deny"` in that JSON; an allowed
  // call prints nothing and continues through normal permission flow.
  // Exit 2 would discard the stdout JSON and report "No stderr output".
  process.exit(0);
}

function emitIfBlocked(decision, command, root) {
  if (decision.decision === "ok") return;
  appendDecisionLog(root, buildLogEntry(decision, command));
  console.log(formatHookDecision(decision, { channel: "hookSpecificOutput" }));
}

function buildLogEntry(decision, command) {
  return {
    command_prefix: command,
    rule_id: decision.rule_id ?? null,
    decision: decision.decision,
    reason: decision.reason,
    matched_pattern: decision.pattern_type ?? decision.constraint_type ?? null,
    skipped_via_override: false,
  };
}

main();
