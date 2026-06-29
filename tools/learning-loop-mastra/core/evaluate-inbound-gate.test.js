/**
 * TDD red tests for evaluateInboundGate + STATE_CHANGE_PATTERNS.
 *
 * Signature contract (locked):
 *   evaluateInboundGate({ prompt, root }) → { decision: "ok" | "warn", context_message?, observations_stale? }
 *   STATE_CHANGE_PATTERNS → RegExp[] (11 patterns)
 *
 * Tests import from ./evaluate-inbound-gate.js (does not exist yet → ERR_MODULE_NOT_FOUND = intended TDD red).
 */

import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { evaluateInboundGate, STATE_CHANGE_PATTERNS } from "./evaluate-inbound-gate.js";

// ── helpers ──

function makeRoot() {
  return mkdtempSync(join(tmpdir(), "eval-inbound-gate-test-"));
}

function writeRuntimeState(root, entries) {
  const lines = entries.map((e) => JSON.stringify(e)).join("\n");
  writeFileSync(join(root, "runtime-state.jsonl"), lines + "\n");
}

// ── short-circuits ──

test("short prompt (<10 chars) → ok", () => {
  const root = makeRoot();
  const result = evaluateInboundGate({ prompt: "hi", root });
  assert.strictEqual(result.decision, "ok");
});

test("boundary: prompt length === 10 → not short-circuited by length check", () => {
  // 10-char prompt that triggers a state-change pattern ("I did it!!")
  // — locks the < 10 boundary so a future change to < 11 doesn't silently regress.
  const root = makeRoot();
  writeRuntimeState(root, [
    { id: "obs-stale", status: "active", affected_system: "vnstock", timestamp: new Date(Date.now() - 31 * 60 * 1000).toISOString() },
  ]);
  const result = evaluateInboundGate({ prompt: "I did it!!", root });
  assert.strictEqual(result.decision, "warn");
});

test("question prompt → ok", () => {
  const root = makeRoot();
  const result = evaluateInboundGate({ prompt: "did you clear the device?", root });
  assert.strictEqual(result.decision, "ok");
});

test("null prompt → ok", () => {
  const root = makeRoot();
  const result = evaluateInboundGate({ prompt: null, root });
  assert.strictEqual(result.decision, "ok");
});

test("empty prompt → ok", () => {
  const root = makeRoot();
  const result = evaluateInboundGate({ prompt: "", root });
  assert.strictEqual(result.decision, "ok");
});

// ── state-change + no observations → ok ──

test("state-change phrase + no observations → ok", () => {
  const root = makeRoot();
  // No runtime-state.jsonl → no observations
  const result = evaluateInboundGate({ prompt: "I cleared the device", root });
  assert.strictEqual(result.decision, "ok");
});

// ── state-change + active observations but none stale → ok ──

test("state-change phrase + active observations but none stale → ok", () => {
  const root = makeRoot();
  writeRuntimeState(root, [
    { id: "obs-1", status: "active", affected_system: "vnstock", timestamp: new Date().toISOString() },
  ]);
  // The prompt matches a state-change pattern, observations exist and are fresh
  const result = evaluateInboundGate({ prompt: "I cleared the device", root });
  assert.strictEqual(result.decision, "ok");
});

// ── state-change + stale observation → warn ──

test("state-change phrase + stale observation → warn with context_message", () => {
  const root = makeRoot();
  // Write an observation with timestamp 31 minutes ago (stale)
  const staleTime = new Date(Date.now() - 31 * 60 * 1000).toISOString();
  writeRuntimeState(root, [
    { id: "obs-stale", status: "active", affected_system: "vnstock", timestamp: staleTime },
  ]);
  const result = evaluateInboundGate({ prompt: "I cleared the device", root });
  assert.strictEqual(result.decision, "warn");
  assert.ok(result.context_message);
  assert.ok(result.context_message.includes("meta-state.jsonl"));
  assert.ok(Array.isArray(result.observations_stale));
  assert.ok(result.observations_stale.length > 0);
});

test("state-change phrase + observation missing updated_at → warn", () => {
  const root = makeRoot();
  writeRuntimeState(root, [
    { id: "obs-no-ts", status: "active", affected_system: "vnstock" },
  ]);
  const result = evaluateInboundGate({ prompt: "everything is working now", root });
  assert.strictEqual(result.decision, "warn");
  assert.ok(result.context_message);
});

// ── STATE_CHANGE_PATTERNS coverage ──

test("STATE_CHANGE_PATTERNS is exported and has 11 entries", () => {
  assert.ok(Array.isArray(STATE_CHANGE_PATTERNS));
  assert.strictEqual(STATE_CHANGE_PATTERNS.length, 11);
  for (const p of STATE_CHANGE_PATTERNS) {
    assert.ok(p instanceof RegExp);
  }
});

test("STATE_CHANGE_PATTERNS matches known state-change phrases", () => {
  const phrases = [
    "I cleared the device",
    "we registered a new service",
    "it's working now",
    "the container is running",
    "slot is free",
    "I just finished the task",
    "the sandbox is cleared",
    "state changed",
    "changed the environment",
    "budget is exhausted",
    "the vnstock is ready",
  ];
  for (const phrase of phrases) {
    const matched = STATE_CHANGE_PATTERNS.some((p) => p.test(phrase));
    assert.ok(matched, `Expected pattern to match: "${phrase}"`);
  }
});

test("non-state-change phrase does not match any pattern", () => {
  const phrases = [
    "what is the current status?",
    "can you help me write a test?",
    "explain how the gate works",
    "run pnpm test",
  ];
  for (const phrase of phrases) {
    const matched = STATE_CHANGE_PATTERNS.some((p) => p.test(phrase));
    assert.ok(!matched, `Expected no pattern match for: "${phrase}"`);
  }
});
