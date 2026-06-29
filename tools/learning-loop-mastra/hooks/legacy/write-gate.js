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
  formatOutput,
  exitCode,
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
    console.log(formatOutput(decision));
  }
  process.exit(exitCode(decision));
}

main();
