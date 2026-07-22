import assert from "node:assert";
import { test, beforeEach, afterEach } from "vitest";
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

// ── Phase 1 B-widening: malformed line + valid row survives (RED→GREEN for meta-260719T2201Z) ──
// Pre-consolidation: readSidecar wraps the whole read in a single try/catch and fail-opens to []
// on a single malformed line. After consolidation onto readRuntimeStateRows, malformed lines are
// skipped (parsed to null then .filter(Boolean)) and valid rows survive.

await test("malformed line + valid fresh row → not stale (Phase 1 behavior change: skip-not-wipe)", () => {
  writeMarker(ts(10));
  // Sidecar with one malformed line followed by one valid fresh row for vnstock.
  const sidecarPath = join(root, "runtime-state.jsonl");
  writeFileSync(
    sidecarPath,
    "{ this is not valid JSON\n" +
      JSON.stringify({ affected_system: "vnstock", kind: "ledger-event", id: "slot-1", timestamp: ts(5), value: 1, delta: 0 }) +
      "\n",
    "utf8"
  );
  const result = checkObservationStaleness(
    [{ id: "obs-vnstock", status: "active", affected_system: "vnstock", constraint: "vendor-api" }],
    root
  );
  assert.deepStrictEqual(result, { stale: false });
});

await test("malformed line alone → still stale (no valid rows)", () => {
  writeMarker(ts(5));
  const sidecarPath = join(root, "runtime-state.jsonl");
  writeFileSync(sidecarPath, "{ this is not valid JSON\n", "utf8");
  const result = checkObservationStaleness(
    [{ id: "obs-vnstock", status: "active", affected_system: "vnstock", constraint: "vendor-api" }],
    root
  );
  assert.strictEqual(result.stale, true);
  assert.ok(result.reason.includes("No runtime-state entry"));
  assert.ok(result.reason.includes("vnstock"));
});

// ── Phase 1 corruption-masking (RED→GREEN for red-team S7): corrupted latest row + older valid row
// The accepted trade-off (per plan validation decision 1): accept silent skip. Older valid row
// may satisfy freshness and mask corruption. No API change; just pin the observed behavior.

await test("corrupted latest row + older valid row → older valid row masks corruption (silent skip accepted)", () => {
  writeMarker(ts(10));
  const sidecarPath = join(root, "runtime-state.jsonl");
  // Corrupted (malformed) line first, then older valid row.
  // Marker is at ts(10), valid row at ts(5) — valid row is NEWER than marker → freshness passes.
  writeFileSync(
    sidecarPath,
    "{ this is not valid JSON\n" +
      JSON.stringify({ affected_system: "vnstock", kind: "ledger-event", id: "slot-old", timestamp: ts(5), value: 1, delta: 0 }) +
      "\n",
    "utf8"
  );
  const result = checkObservationStaleness(
    [{ id: "obs-vnstock", status: "active", affected_system: "vnstock", constraint: "vendor-api" }],
    root
  );
  // Corruption-masking: the corrupted row is silently skipped; the older valid row satisfies
  // freshness (sidecarTime > markerTime, so the staleness check does not trigger).
  assert.deepStrictEqual(result, { stale: false });
});

// ── Phase 1 timestamp-missing (RED→GREEN for red-team F5): malformed line + valid row with no
// timestamp changes the staleness reason string. Pin the new reason text.

await test("malformed line + valid row missing timestamp → stale with 'Sidecar may be stale' reason", () => {
  writeMarker(ts(5));
  const sidecarPath = join(root, "runtime-state.jsonl");
  writeFileSync(
    sidecarPath,
    "{ this is not valid JSON\n" +
      JSON.stringify({ affected_system: "vnstock", kind: "ledger-event", id: "slot-no-ts", value: 1, delta: 0 }) +
      "\n",
    "utf8"
  );
  const result = checkObservationStaleness(
    [{ id: "obs-vnstock", status: "active", affected_system: "vnstock", constraint: "vendor-api" }],
    root
  );
  assert.strictEqual(result.stale, true);
  assert.ok(
    result.reason.includes("Sidecar may be stale"),
    `expected "Sidecar may be stale" in reason; got: ${result.reason}`
  );
});

await test("corrupt runtime-tracking sidecar degrades to not-paused on the read gate", () => {
  // Writers fail closed on a malformed tracking sidecar, but the staleness
  // read gate must not: a corrupt `.loop/runtime-tracking.json` should not
  // throw out of checkObservationStaleness (which would break the bash gate
  // on every command). Degrade to "not paused" and evaluate normally.
  mkdirSync(join(root, ".loop"), { recursive: true });
  writeFileSync(join(root, ".loop", "runtime-tracking.json"), "{ this is not json", "utf8");
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
