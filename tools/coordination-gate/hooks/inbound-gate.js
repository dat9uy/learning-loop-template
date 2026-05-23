#!/usr/bin/env node
/**
 * Universal Inbound State Gate — UserPromptSubmit hook.
 *
 * Works with both Claude Code and Droid CLI.
 * Imports all logic from coordination-gate/core (single source of truth).
 */

import { readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseInput,
  extractPrompt,
  formatSoftWarning,
  exitCode,
} from "./lib/protocol-adapter.js";
import { findProjectRoot } from "../core/gate-logic.js";
import { readObservations } from "../core/file-readers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- State-change signal patterns ---
const STATE_CHANGE_PATTERNS = [
  /\b(i|we)?\s*(cleared|clear|removed|delete[ds]?|wiped|reset)\s*(the|my|all)?\s*(device|slot|container|sandbox|cache|venv|vnstock)\b/i,
  /\b(i|we)?\s*(registered|created|installed|started|launched|ran|executed|bootstrapped)\b/i,
  /\b(it'?s?|it\s+is|that'?s?|that\s+is|everything'?s?|everything\s+is|all)\s+(working|running|fixed|ready|done|complete|success|good|ok)\b/i,
  /\b(container|service|server|process|app)\s*(is|are|was)\s*(up|running|alive|ready|started|stopped|killed|dead)\b/i,
  /\b(slot|device|fingerprint)\s*(is|are|was|now)?\s*(free|available|clear|empty|open|used|occupied|taken)\b/i,
  /\b(i|we)?\s*(just\s+)?(did|finished|completed|succeeded|failed)\b/i,
  /\b(the\s+)?(env|environment|venv|sandbox|docker)\s*(is|was|has\s+been)?\s*(cleared|reset|ready|clean|dirty|broken|fixed)\b/i,
  /\bstate\s*(change|update|shift|changed|updated)\b/i,
  /\bchanged\s*(the|my|our)\b/i,
  /\b(budget|resource|limit|quota)\s*(is|was|has\s+been)?\s*(exhausted|reset|replenished|full|empty|cleared)\b/i,
  /\bthe\s+\w+\s+(is|was|has\s+been)\s+(cleared|reset|fixed|ready|running|working|broken|done)\b/i,
];

const STALENESS_THRESHOLD_MS = 30 * 60 * 1000;

function detectStateChange(prompt) {
  if (!prompt || typeof prompt !== "string") return false;
  return STATE_CHANGE_PATTERNS.some((p) => p.test(prompt));
}

function readActiveObservations(root) {
  const all = readObservations(root);
  return all.filter((obs) => obs.status === "active");
}

function findStaleObservations(observations, now) {
  return observations.filter((obs) => {
    if (!obs.updated_at) return true;
    const updated = new Date(obs.updated_at).getTime();
    if (isNaN(updated)) return true;
    return (now - updated) > STALENESS_THRESHOLD_MS;
  });
}

function writeOperatorMessageMarker(root, prompt) {
  try {
    const marker = {
      timestamp: new Date().toISOString(),
      prompt_snippet: prompt.slice(0, 200),
    };

    // If GATE_MARKER_PATH is set, write only there (test override)
    if (process.env.GATE_MARKER_PATH) {
      const markerPath = process.env.GATE_MARKER_PATH;
      mkdirSync(dirname(markerPath), { recursive: true });
      const tmpPath = markerPath + ".tmp";
      writeFileSync(tmpPath, JSON.stringify(marker, null, 2));
      renameSync(tmpPath, markerPath);
      return;
    }

    // Write to both .claude and .factory for cross-surface compatibility
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

function buildContextMessage(staleObservations) {
  const ids = staleObservations.map((o) => o.id || o.constraint || "unknown").join(", ");
  return [
    "INBOUND STATE GATE: Operator message contains a state-change signal.",
    `Active observations may be stale: ${ids}`,
    "Before proceeding, update affected observations via record_observation MCP tool.",
    "Do NOT assume external state matches observation records — verify first.",
  ].join("\n");
}

function main() {
  const stdin = readFileSync(0, "utf8");
  const input = parseInput(stdin);
  const prompt = extractPrompt(input);

  if (!prompt || prompt.length < 10) process.exit(0);
  if (prompt.endsWith("?")) process.exit(0);
  if (!detectStateChange(prompt)) process.exit(0);

  const root = findProjectRoot();
  const observations = readActiveObservations(root);
  if (observations.length === 0) process.exit(0);

  const now = Date.now();
  const stale = findStaleObservations(observations, now);
  if (stale.length === 0) process.exit(0);

  writeOperatorMessageMarker(root, prompt);

  const message = buildContextMessage(stale);
  console.log(formatSoftWarning(message));
  process.exit(0);
}

main();
