#!/usr/bin/env node
/**
 * Universal Inbound State Gate — UserPromptSubmit hook.
 * Thin I/O adapter — all policy lives in core/evaluate-inbound-gate.js.
 */

import { readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseInput,
  extractPrompt,
  formatSoftWarning,
} from "./lib/protocol-adapter.js";
import { evaluateInboundGate } from "../../core/evaluate-inbound-gate.js";
import { findProjectRoot } from "../../core/gate-logic.js";
import { writeToAllSurfaces, readFromAllSurfaces } from "../../core/surfaces.js";
// Plan 260711-0030 Phase 5: per-worktree session ID scopes the marker filename
// so two Claude Code sessions in different worktrees don't pollute each other's
// outbound gate decisions (closes Multi-Session Isolation gap).
import { getSessionId } from "../../core/worktree-session-id.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SURFACE_TOKEN_SUBPATH = ".inbound-stale-surfaced";

// Read the suppress token written on the previous emission. Returns
// { signature, ts } or null. Best-effort: missing/malformed → null.
function readSuppressToken(root) {
  try {
    const hit = readFromAllSurfaces(root, SURFACE_TOKEN_SUBPATH, { first: true });
    const parsed = hit?.parsed;
    if (parsed && typeof parsed.signature === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeSuppressToken(root, signature) {
  try {
    const payload = JSON.stringify({ signature, ts: new Date().toISOString() });
    writeToAllSurfaces(root, SURFACE_TOKEN_SUBPATH, payload);
  } catch {
    // token write failure never blocks the gate
  }
}

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

    // Plan 260711-0030 Phase 5: per-worktree session ID scopes the marker.
    // Each surface gets the session-id-suffixed filename. Cross-surface
    // pollution blocked (Finding 11).
    const sessionId = getSessionId(root);
    writeToAllSurfaces(root, `.last-operator-message-${sessionId}`, JSON.stringify(marker, null, 2));
  } catch {
    // marker write failure never blocks
  }
}

function main() {
  const stdin = readFileSync(0, "utf8");
  const input = parseInput(stdin);
  const prompt = extractPrompt(input);

  const root = findProjectRoot();
  const prior = readSuppressToken(root);
  const decision = evaluateInboundGate({
    prompt,
    root,
    priorSignature: prior?.signature ?? null,
    priorTs: prior?.ts ?? null,
  });

  // Per red-team C5: evaluate BEFORE marker write
  if (decision.decision === "warn") {
    writeSuppressToken(root, decision.stale_signature);
    writeOperatorMessageMarker(root, prompt);
    console.log(formatSoftWarning(decision.context_message));
  }
  // Inbound gate always exits 0 (soft warning, never blocks)
  process.exit(0);
}

main();
