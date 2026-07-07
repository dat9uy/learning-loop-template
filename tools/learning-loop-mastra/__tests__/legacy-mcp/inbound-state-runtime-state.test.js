import assert from "node:assert";
import { test, beforeEach, afterEach } from "node:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkObservationStaleness } from "../../core/inbound-state.js";

let root;

beforeEach(() => {
  root = join(tmpdir(), `inbound-state-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(root, { recursive: true });
  mkdirSync(join(root, ".factory", "coordination"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Generate an ISO timestamp offset minutes from now. */
function ts(minutesAgo) {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

function writeMarker(timestamp) {
  const markerPath = join(root, ".factory", "coordination", ".last-operator-message");
  writeFileSync(markerPath, JSON.stringify({ timestamp, prompt_snippet: "test" }), "utf8");
}

function writeSidecar(rows) {
  const path = join(root, "runtime-state.jsonl");
  const lines = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(path, lines, "utf8");
}

// ── Meta observations: existing behavior ──

await test("meta observation with updated_at newer than marker → stale: false", () => {
  writeMarker(ts(10));
  const result = checkObservationStaleness(
    [{ id: "obs-1", status: "active", affected_system: "meta", updated_at: ts(5) }],
    root
  );
  assert.deepStrictEqual(result, { stale: false });
});

await test("meta observation with updated_at older than marker → stale: true", () => {
  writeMarker(ts(5));
  const result = checkObservationStaleness(
    [{ id: "obs-1", status: "active", affected_system: "meta", updated_at: ts(10) }],
    root
  );
  assert.strictEqual(result.stale, true);
  assert.ok(result.reason.includes("obs-1"));
});

await test("legacy observation (no affected_system) uses updated_at path", () => {
  writeMarker(ts(10));
  const result = checkObservationStaleness(
    [{ id: "obs-legacy", status: "active", constraint: "vendor-api", updated_at: ts(5) }],
    root
  );
  assert.deepStrictEqual(result, { stale: false });
});

// ── Non-meta observations: sidecar path ──

await test("vnstock observation with sidecar newer than marker → stale: false", () => {
  writeMarker(ts(10));
  writeSidecar([
    { affected_system: "vnstock", kind: "ledger-event", id: "slot-1", timestamp: ts(5), value: 1, delta: 0 },
  ]);
  const result = checkObservationStaleness(
    [{ id: "obs-vnstock", status: "active", affected_system: "vnstock", constraint: "vendor-api" }],
    root
  );
  assert.deepStrictEqual(result, { stale: false });
});

await test("vnstock observation with sidecar older than marker → stale: true", () => {
  writeMarker(ts(5));
  writeSidecar([
    { affected_system: "vnstock", kind: "ledger-event", id: "slot-1", timestamp: ts(10), value: 1, delta: 0 },
  ]);
  const result = checkObservationStaleness(
    [{ id: "obs-vnstock", status: "active", affected_system: "vnstock", constraint: "vendor-api" }],
    root
  );
  assert.strictEqual(result.stale, true);
  assert.ok(result.reason.includes("vnstock"));
});

await test("vnstock observation with no sidecar entries → stale: true", () => {
  writeMarker(ts(5));
  writeSidecar([]);
  const result = checkObservationStaleness(
    [{ id: "obs-vnstock", status: "active", affected_system: "vnstock", constraint: "vendor-api" }],
    root
  );
  assert.strictEqual(result.stale, true);
  assert.ok(result.reason.includes("No runtime-state entry"));
  assert.ok(result.reason.includes("vnstock"));
});

await test("vnstock observation with no sidecar file → stale: true", () => {
  writeMarker(ts(5));
  const result = checkObservationStaleness(
    [{ id: "obs-vnstock", status: "active", affected_system: "vnstock", constraint: "vendor-api" }],
    root
  );
  assert.strictEqual(result.stale, true);
  assert.ok(result.reason.includes("No runtime-state entry"));
});

await test("vnstock observation with multiple sidecar rows uses latest", () => {
  writeMarker(ts(10));
  writeSidecar([
    { affected_system: "vnstock", kind: "ledger-event", id: "slot-1", timestamp: ts(20), value: 0, delta: 0 },
    { affected_system: "vnstock", kind: "ledger-event", id: "slot-2", timestamp: ts(5), value: 1, delta: 1 },
    { affected_system: "vnstock", kind: "ledger-event", id: "slot-3", timestamp: ts(15), value: 1, delta: 0 },
  ]);
  const result = checkObservationStaleness(
    [{ id: "obs-vnstock", status: "active", affected_system: "vnstock", constraint: "vendor-api" }],
    root
  );
  assert.deepStrictEqual(result, { stale: false });
});

// ── Mixed observations ──

await test("mixed meta + vnstock: meta passes, vnstock sidecar is fresh → stale: false", () => {
  writeMarker(ts(10));
  writeSidecar([
    { affected_system: "vnstock", kind: "ledger-event", id: "slot-1", timestamp: ts(5), value: 1, delta: 0 },
  ]);
  const result = checkObservationStaleness(
    [
      { id: "obs-meta", status: "active", affected_system: "meta", updated_at: ts(5) },
      { id: "obs-vnstock", status: "active", affected_system: "vnstock", constraint: "vendor-api" },
    ],
    root
  );
  assert.deepStrictEqual(result, { stale: false });
});

await test("mixed meta + vnstock: meta passes, vnstock sidecar stale → stale: true", () => {
  writeMarker(ts(5));
  writeSidecar([
    { affected_system: "vnstock", kind: "ledger-event", id: "slot-1", timestamp: ts(10), value: 1, delta: 0 },
  ]);
  const result = checkObservationStaleness(
    [
      { id: "obs-meta", status: "active", affected_system: "meta", updated_at: ts(1) },
      { id: "obs-vnstock", status: "active", affected_system: "vnstock", constraint: "vendor-api" },
    ],
    root
  );
  assert.strictEqual(result.stale, true);
  assert.ok(result.reason.includes("vnstock"));
});

await test("inactive observations are skipped", () => {
  writeMarker(ts(5));
  writeSidecar([
    { affected_system: "vnstock", kind: "ledger-event", id: "slot-1", timestamp: ts(10), value: 1, delta: 0 },
  ]);
  const result = checkObservationStaleness(
    [{ id: "obs-vnstock", status: "resolved", affected_system: "vnstock", constraint: "vendor-api" }],
    root
  );
  assert.deepStrictEqual(result, { stale: false });
});

// ── No marker → not stale ──

await test("no operator marker → stale: false for non-meta observation", () => {
  const result = checkObservationStaleness(
    [{ id: "obs-vnstock", status: "active", affected_system: "vnstock", constraint: "vendor-api" }],
    root
  );
  assert.deepStrictEqual(result, { stale: false });
});

// ── 18 converted ledger events: success criterion ──

await test("success criterion: 18 vnstock ledger events with fresh sidecar → stale: false", () => {
  writeMarker(ts(20));

  const sidecarRows = [];
  const observations = [];
  for (let i = 0; i < 18; i++) {
    const minutesAgo = 18 - i;
    sidecarRows.push({
      affected_system: "vnstock",
      kind: "ledger-event",
      id: `vnstock-device-slot-${i}`,
      timestamp: ts(minutesAgo),
      value: i % 2,
      delta: i % 2,
    });
    observations.push({
      id: `obs-vnstock-${i}`,
      status: "active",
      affected_system: "vnstock",
      constraint: "vendor-api",
    });
  }
  writeSidecar(sidecarRows);

  const result = checkObservationStaleness(observations, root);
  assert.deepStrictEqual(result, { stale: false });
});

// ── Fastapi observation ──

await test("fastapi observation checks sidecar for affected_system=fastapi", () => {
  writeMarker(ts(5));
  writeSidecar([
    { affected_system: "fastapi", kind: "ledger-event", id: "fp-1", timestamp: ts(10), value: 0, delta: 0 },
  ]);
  const result = checkObservationStaleness(
    [{ id: "obs-fp", status: "active", affected_system: "fastapi", constraint: "vendor-api" }],
    root
  );
  assert.strictEqual(result.stale, true);
  assert.ok(result.reason.includes("fastapi"));
});
