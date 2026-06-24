import assert from "node:assert";
import { test, beforeEach, afterEach } from "node:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { readLastOperatorMessage } from "../../core/legacy/inbound-state.js";

let root;
const originalMarkerPath = process.env.GATE_MARKER_PATH;

beforeEach(() => {
  root = join(tmpdir(), `inbound-state-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  delete process.env.GATE_MARKER_PATH;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  if (originalMarkerPath !== undefined) {
    process.env.GATE_MARKER_PATH = originalMarkerPath;
  } else {
    delete process.env.GATE_MARKER_PATH;
  }
});

/** Generate an ISO timestamp offset minutes from now. */
function ts(minutesAgo) {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

function writeMarker(surface, timestamp) {
  const markerPath = join(root, surface, "coordination", ".last-operator-message");
  mkdirSync(join(root, surface, "coordination"), { recursive: true });
  writeFileSync(markerPath, JSON.stringify({ timestamp, prompt_snippet: "test" }), "utf8");
}

// ─── Priority 1: env var ───

await test("returns env-var marker when GATE_MARKER_PATH is set and fresh", () => {
  const envTs = ts(5);
  const envPath = join(root, "env-marker.json");
  writeFileSync(envPath, JSON.stringify({ timestamp: envTs, prompt_snippet: "env" }), "utf8");
  process.env.GATE_MARKER_PATH = envPath;

  const result = readLastOperatorMessage(root);
  assert.deepStrictEqual(result, { timestamp: envTs, prompt_snippet: "env" });
});

await test("returns null when env-var path is missing (does not fall through)", () => {
  process.env.GATE_MARKER_PATH = join(root, "nonexistent.json");
  writeMarker(".claude", ts(5));

  // Original behavior: the env-var path is inside the outer try/catch,
  // so a missing env-var file throws and returns null — no fall-through.
  const result = readLastOperatorMessage(root);
  assert.strictEqual(result, null);
});

await test("falls through to .claude when env-var marker is expired", () => {
  const claudeTs = ts(5);
  const envPath = join(root, "env-marker.json");
  writeFileSync(envPath, JSON.stringify({ timestamp: ts(60), prompt_snippet: "old" }), "utf8");
  process.env.GATE_MARKER_PATH = envPath;
  writeMarker(".claude", claudeTs);

  const result = readLastOperatorMessage(root);
  assert.ok(result);
  assert.strictEqual(result.timestamp, claudeTs);
});

// ─── Priority 2 + 3: surface iteration ───

await test("falls through to .factory when env-var and .claude are both missing", () => {
  const factoryTs = ts(5);
  writeMarker(".factory", factoryTs);

  const result = readLastOperatorMessage(root);
  assert.ok(result);
  assert.strictEqual(result.timestamp, factoryTs);
});

await test("returns null when no surface has a marker", () => {
  const result = readLastOperatorMessage(root);
  assert.strictEqual(result, null);
});

await test("skips expired marker (older than 30 min)", () => {
  const factoryTs = ts(5);
  writeMarker(".claude", ts(60));
  writeMarker(".factory", factoryTs);

  const result = readLastOperatorMessage(root);
  assert.ok(result);
  assert.strictEqual(result.timestamp, factoryTs);
});

await test("skips malformed JSON on a surface", () => {
  const factoryTs = ts(5);
  const claudePath = join(root, ".claude", "coordination", ".last-operator-message");
  mkdirSync(join(root, ".claude", "coordination"), { recursive: true });
  writeFileSync(claudePath, "not json {", "utf8");
  writeMarker(".factory", factoryTs);

  const result = readLastOperatorMessage(root);
  assert.ok(result);
  assert.strictEqual(result.timestamp, factoryTs);
});

await test("skips marker without timestamp", () => {
  const factoryTs = ts(5);
  const claudePath = join(root, ".claude", "coordination", ".last-operator-message");
  mkdirSync(join(root, ".claude", "coordination"), { recursive: true });
  writeFileSync(claudePath, JSON.stringify({ foo: "bar" }), "utf8");
  writeMarker(".factory", factoryTs);

  const result = readLastOperatorMessage(root);
  assert.ok(result);
  assert.strictEqual(result.timestamp, factoryTs);
});

await test("returns null when all surfaces have expired markers", () => {
  writeMarker(".claude", ts(60));
  writeMarker(".factory", ts(60));

  const result = readLastOperatorMessage(root);
  assert.strictEqual(result, null);
});

await test("priority order: .claude wins over .factory when both have fresh markers", () => {
  const claudeTs = ts(10);
  writeMarker(".claude", claudeTs);
  writeMarker(".factory", ts(5));

  const result = readLastOperatorMessage(root);
  assert.ok(result);
  assert.strictEqual(result.timestamp, claudeTs);
});

await test("returns null on inner throws (defense-in-depth)", () => {
  process.env.GATE_MARKER_PATH = root; // root is a directory, not a file

  const result = readLastOperatorMessage(root);
  assert.strictEqual(result, null);
});
