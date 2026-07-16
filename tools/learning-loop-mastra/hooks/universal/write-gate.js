#!/usr/bin/env node
/**
 * Universal Write Gate — PreToolUse hook for Edit/Write/Create/ApplyPatch.
 * Thin I/O adapter — all policy lives in core/evaluate-write-gate.js.
 */

import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseInput,
  normalizeToolName,
  extractFilePath,
  formatHookDecision,
} from "./lib/protocol-adapter.js";
import { evaluateWriteGate } from "../../core/evaluate-write-gate.js";
import { findProjectRoot } from "../../core/gate-logic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function main() {
  const stdin = readFileSync(0, "utf8");
  const input = parseInput(stdin);

  const normalizedTool = normalizeToolName(input.tool_name);
  if (normalizedTool !== "write") process.exit(0);

  const filePath = extractFilePath(input.tool_input);
  if (!filePath) process.exit(0);

  const root = findProjectRoot();
  const decision = evaluateWriteGate({ filePath, root });

  if (decision.decision !== "ok") {
    // Exit 0 + `permissionDecision: "deny"` (in the hookSpecificOutput envelope)
    // is the modern PreToolUse block protocol — the harness processes stdout JSON
    // only on exit 0 and surfaces `permissionDecisionReason` to the model. Exit 2
    // would discard the JSON and report "No stderr output", hiding the reason.
    console.log(formatHookDecision(decision, { channel: "hookSpecificOutput" }));
  }
  process.exit(0);
}

main();
