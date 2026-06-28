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
  exitCode,
} from "./lib/protocol-adapter.js";
import { evaluateBashGate } from "../../core/evaluate-bash-gate.js";
import { appendDecisionLog } from "../../core/gate-decision-log.js";
import { resolveRoot } from "#lib/resolve-root.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function main() {
  const stdin = readFileSync(0, "utf8");
  const input = parseInput(stdin);

  const normalizedTool = normalizeToolName(input.tool_name);
  if (normalizedTool !== "bash") process.exit(0);

  const command = extractCommand(input.tool_input);
  if (!command) process.exit(0);

  const root = resolveRoot();
  const decision = evaluateBashGate({ command, root });

  if (decision.decision !== "ok") {
    appendDecisionLog(root, {
      command_prefix: command,
      rule_id: decision.rule_id ?? decision.meta_state_id ?? null,
      decision: decision.decision,
      reason: decision.reason,
      matched_pattern: decision.pattern_type ?? decision.constraint_type ?? null,
      skipped_via_override: false,
    });
    console.log(formatHookDecision(decision, { channel: "hookSpecificOutput" }));
  }
  process.exit(exitCode(decision));
}

main();
