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
import {
  evaluateInboundGate,
  buildSteeringPointer,
  SUPPRESS_WINDOW_MS,
} from "../../core/evaluate-inbound-gate.js";
import { findProjectRoot } from "../../core/gate-logic.js";
import { writeToAllSurfaces, readFromAllSurfaces } from "../../core/surfaces.js";
// Plan 260711-0030 Phase 5: per-worktree session ID scopes the marker filename
// so two Claude Code sessions in different worktrees don't pollute each other's
// outbound gate decisions (closes Multi-Session Isolation gap).
import { getSessionId } from "../../core/worktree-session-id.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SURFACE_TOKEN_SUBPATH = ".inbound-stale-surfaced";
const POINTER_TOKEN_SUBPATH = ".inbound-pointer-surfaced";

function readPointerToken(root) {
  try {
    const hit = readFromAllSurfaces(root, POINTER_TOKEN_SUBPATH, { first: true });
    const parsed = hit?.parsed;
    if (parsed && typeof parsed.ts === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

function writePointerToken(root) {
  try {
    const payload = JSON.stringify({ ts: new Date().toISOString() });
    writeToAllSurfaces(root, POINTER_TOKEN_SUBPATH, payload);
  } catch {
    // pointer write failure never blocks
  }
}

function shouldEmitPointer(root, now) {
  const prior = readPointerToken(root);
  if (!prior) return true;
  const priorMs = Date.parse(prior.ts);
  if (Number.isNaN(priorMs)) return true;
  return now - priorMs >= SUPPRESS_WINDOW_MS;
}

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
  try {
    runMain();
  } catch (err) {
    // Per Plan 260720-1955 Phase 4 (H5): always exit 0; on throw, still emit the
    // pointer so the agent has a degraded but valid pull path.
    try {
      console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: `${buildSteeringPointer()}\n(pointer fallback — gate error: ${err.message})` } }));
    } catch { /* ignore */ }
    process.exit(0);
  }
}

function runMain() {
  const stdin = readFileSync(0, "utf8");
  const input = parseInput(stdin);
  const prompt = extractPrompt(input);

  const root = findProjectRoot();
  const now = Date.now();
  const prior = readSuppressToken(root);
  // priorSignature/priorTs default to null inside evaluateInboundGate, so
  // passing undefined (when no prior token exists) is equivalent to null.
  const decision = evaluateInboundGate({
    prompt,
    root,
    priorSignature: prior?.signature,
    priorTs: prior?.ts,
    now,
  });

  const pointer = buildSteeringPointer();
  // Once-per-session pull pointer (Validation V2): gated by a suppress-token store
  // mirroring SUPPRESS_WINDOW_MS. The pointer never feeds back into the
  // classifier's recorded_attachment_bytes since it lives in the gate's
  // own payload stream, not the prompt's tokens.
  const emitPointer = shouldEmitPointer(root, now);
  // Per red-team C5: evaluate BEFORE marker write
  if (decision.decision === "warn") {
    writeSuppressToken(root, decision.stale_signature);
    writeOperatorMessageMarker(root, prompt);
  }
  // The pointer token is written exactly when a pointer is emitted, in either
  // the warn or the non-warn branch; hoist it so the output formatting below
  // stays a single linear pass.
  if (emitPointer) writePointerToken(root);
  const out = formatGateOutput(decision, pointer, emitPointer);
  if (out !== null) console.log(out);
  // Inbound gate always exits 0 (soft warning, never blocks)
  process.exit(0);
}

// Build the stdout payload for the gate decision. Returns the exact string to
// console.log, or null when nothing should be emitted (non-warn + no pointer).
function formatGateOutput(decision, pointer, emitPointer) {
  if (decision.decision === "warn") {
    const body = emitPointer ? `${pointer}\n\n${decision.context_message}` : decision.context_message;
    return formatSoftWarning(body);
  }
  if (emitPointer) {
    return JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: pointer } });
  }
  return null;
}

main();
