#!/usr/bin/env node
/**
 * Universal Inbound State Gate — UserPromptSubmit hook.
 * Thin I/O adapter — all policy lives in core/evaluate-inbound-gate.js.
 */

import { readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseInput,
  extractPrompt,
  formatSoftWarning,
} from "./lib/protocol-adapter.js";
import { evaluateInboundGate } from "../../core/evaluate-inbound-gate.js";
import { findProjectRoot } from "../../core/gate-logic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function writeOperatorMessageMarker(root, prompt) {
  try {
    const marker = {
      timestamp: new Date().toISOString(),
      prompt_snippet: prompt.slice(0, 200),
    };

    if (process.env.GATE_MARKER_PATH) {
      const markerPath = process.env.GATE_MARKER_PATH;
      mkdirSync(dirname(markerPath), { recursive: true });
      const tmpPath = markerPath + ".tmp";
      writeFileSync(tmpPath, JSON.stringify(marker, null, 2));
      renameSync(tmpPath, markerPath);
      return;
    }

    for (const dir of [".claude", ".factory"]) {
      const markerPath = join(root, dir, "coordination", ".last-operator-message");
      mkdirSync(dirname(markerPath), { recursive: true });
      const tmpPath = markerPath + ".tmp";
      writeFileSync(tmpPath, JSON.stringify(marker, null, 2));
      renameSync(tmpPath, markerPath);
    }
  } catch {
    // marker write failure never blocks
  }
}

function main() {
  const stdin = readFileSync(0, "utf8");
  const input = parseInput(stdin);
  const prompt = extractPrompt(input);

  const root = findProjectRoot();
  const decision = evaluateInboundGate({ prompt, root });

  // Per red-team C5: evaluate BEFORE marker write
  if (decision.decision === "warn") {
    writeOperatorMessageMarker(root, prompt);
    console.log(formatSoftWarning(decision.context_message));
  }
  // Inbound gate always exits 0 (soft warning, never blocks)
  process.exit(0);
}

main();
