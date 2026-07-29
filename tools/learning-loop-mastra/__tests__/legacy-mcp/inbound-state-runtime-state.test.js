// Plan 260728-2323-unify-observation-staleness-mechanism Phase 4: rewritten
// bash-gate staleness tests under the unified model.
//
// Pre-Phase-4: `checkObservationStaleness` re-read the runtime-state sidecar
// and reduced to the latest per surface. Post-Phase-4: it uses the unified
// primitives (`observationReferenceTimeMs` + `isObservationStaleByMarker`)
// and trusts that `obs.updated_at` IS the per-surface-latest timestamp
// (Phase 2 dedup). The fixtures below now hand observations WITH `updated_at`
// directly and assert on the marker predicate. The "No runtime-state entry"
// reason is dropped (unreachable post-Phase-2 — an observation reaching
// `checkObservationStaleness` always has `updated_at`); missing-`updated_at`
// observations hit the stale-on-null "no updated_at" reason.

import assert from "node:assert";
import { test, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkObservationStaleness } from "../../core/inbound-state.js";
import { readRuntimeObservations } from "../../core/file-readers.js";

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

// ── Unified model: observations carry updated_at, no sidecar-read ──

await test("obs with updated_at newer than marker → stale: false", () => {
  writeMarker(ts(10));
  const result = checkObservationStaleness(
    [{ id: "obs-1", status: "active", affected_system: "meta", updated_at: ts(5) }],
    root
  );
  assert.deepStrictEqual(result, { stale: false });
});

await test("obs with updated_at older than marker → stale: true (reason 'updated at X, marker at Y')", () => {
  writeMarker(ts(5));
  const result = checkObservationStaleness(
    [{ id: "obs-1", status: "active", affected_system: "meta", updated_at: ts(10) }],
    root
  );
  assert.strictEqual(result.stale, true);
  assert.ok(result.reason.includes("obs-1"));
  assert.ok(result.reason.includes("updated at"));
  assert.ok(result.reason.includes("operator sent state-change at"));
});

await test("legacy observation (no affected_system) treated as meta path", () => {
  writeMarker(ts(10));
  const result = checkObservationStaleness(
    [{ id: "obs-legacy", status: "active", constraint: "vendor-api", updated_at: ts(5) }],
    root
  );
  assert.deepStrictEqual(result, { stale: false });
});

await test("vnstock observation with updated_at newer than marker → stale: false", () => {
  // Post-Phase-2: observations arrive with updated_at = the latest budget-state
  // timestamp. The unified model reads updated_at directly — no sidecar re-read.
  writeMarker(ts(10));
  const result = checkObservationStaleness(
    [
      {
        id: "obs-vnstock",
        status: "active",
        affected_system: "vnstock",
        constraint: "vendor-api",
        updated_at: ts(5),
      },
    ],
    root
  );
  assert.deepStrictEqual(result, { stale: false });
});

await test("vnstock observation with updated_at older than marker → stale: true", () => {
  writeMarker(ts(5));
  const result = checkObservationStaleness(
    [
      {
        id: "obs-vnstock",
        status: "active",
        affected_system: "vnstock",
        constraint: "vendor-api",
        updated_at: ts(10),
      },
    ],
    root
  );
  assert.strictEqual(result.stale, true);
  assert.ok(result.reason.includes("vnstock"));
});

await test("vnstock observation with no updated_at → stale: true (stale-on-null, no sidecar-read)", () => {
  // Pre-Phase-4: "No runtime-state entry" reason (sidecar re-read fell empty).
  // Post-Phase-4: stale-on-null hits the "no updated_at" reason. The projection
  // (Phase 2) is the only source of observations; an obs with no updated_at
  // here is a malformed upstream input, not a missing sidecar.
  writeMarker(ts(5));
  const result = checkObservationStaleness(
    [
      {
        id: "obs-vnstock",
        status: "active",
        affected_system: "vnstock",
        constraint: "vendor-api",
        // no updated_at
      },
    ],
    root
  );
  assert.strictEqual(result.stale, true);
  assert.ok(result.reason.includes("no updated_at"));
  assert.ok(result.reason.includes("obs-vnstock"));
});

await test("vnstock observation with no marker → stale: false", () => {
  const result = checkObservationStaleness(
    [
      {
        id: "obs-vnstock",
        status: "active",
        affected_system: "vnstock",
        constraint: "vendor-api",
        updated_at: ts(5),
      },
    ],
    root
  );
  assert.deepStrictEqual(result, { stale: false });
});

await test("paused budget-state surface is skipped (try/catch degrade to not-paused)", () => {
  // Post-Phase-2: the projection emits one obs per active surface. A paused
  // surface has no obs (status filter) — but if an obs arrives, the
  // isSurfacePaused try/catch skip degrades to "not paused" and the obs is
  // evaluated against the marker.
  mkdirSync(join(root, ".claude", "coordination"), { recursive: true });
  writeMarker(ts(5));
  const result = checkObservationStaleness(
    [
      {
        id: "obs-vnstock",
        status: "active",
        affected_system: "vnstock",
        constraint: "vendor-api",
        updated_at: ts(10),
      },
    ],
    root
  );
  // Without the paused marker, falls through to marker check → stale.
  assert.strictEqual(result.stale, true);
});

await test("inactive observations are skipped (status filter)", () => {
  writeMarker(ts(5));
  const result = checkObservationStaleness(
    [
      {
        id: "obs-vnstock",
        status: "resolved",
        affected_system: "vnstock",
        constraint: "vendor-api",
        updated_at: ts(10),
      },
    ],
    root
  );
  assert.deepStrictEqual(result, { stale: false });
});

await test("mixed observations: meta passes, vnstock has stale updated_at → stale: true", () => {
  writeMarker(ts(5));
  const result = checkObservationStaleness(
    [
      { id: "obs-meta", status: "active", affected_system: "meta", updated_at: ts(1) },
      {
        id: "obs-vnstock",
        status: "active",
        affected_system: "vnstock",
        constraint: "vendor-api",
        updated_at: ts(10),
      },
    ],
    root
  );
  assert.strictEqual(result.stale, true);
  assert.ok(result.reason.includes("vnstock"));
});

await test("fastapi observation with stale updated_at → stale: true", () => {
  writeMarker(ts(5));
  const result = checkObservationStaleness(
    [
      {
        id: "obs-fp",
        status: "active",
        affected_system: "fastapi",
        constraint: "vendor-api",
        updated_at: ts(10),
      },
    ],
    root
  );
  assert.strictEqual(result.stale, true);
  assert.ok(result.reason.includes("obs-fp"));
});

await test("isMarkerFresh rejects markers older than OBSERVATION_STALENESS_WINDOW_MS", () => {
  // A 60-min-old marker is past the freshness window → treated as no marker →
  // no stale (Phase 4 keeps the freshness guard via the shared constant).
  writeMarker(ts(60));
  const result = checkObservationStaleness(
    [
      {
        id: "obs-vnstock",
        status: "active",
        affected_system: "vnstock",
        constraint: "vendor-api",
        updated_at: ts(120),
      },
    ],
    root
  );
  assert.deepStrictEqual(result, { stale: false });
});

await test("read gate degrades to not-paused on corrupt budget-tracking read (legacy: kept for posterity)", () => {
  // Sidecar row with invalid status for budget-state. Phase 2's dedup
  // produces no observation (status filter). With no obs, the gate returns
  // {stale: false}. This documents the survivor: a corrupt sidecar no
  // longer surfaces as "No runtime-state entry" (that branch was dropped in
  // Phase 4 as unreachable post-Phase-2) — instead, the absence of obs
  // means the gate has nothing to flag.
  mkdirSync(join(root, ".loop"), { recursive: true });
  writeMarker(ts(10));
  const sidecarPath = join(root, "runtime-state.jsonl");
  writeFileSync(
    sidecarPath,
    JSON.stringify({
      affected_system: "vnstock",
      kind: "budget-state",
      status: "weird",
      id: "vnstock",
      timestamp: ts(5),
      metadata: {},
    }) + "\n",
    "utf8"
  );
  const observations = readRuntimeObservations(root);
  assert.strictEqual(observations.length, 0);
  const result = checkObservationStaleness(observations, root);
  assert.deepStrictEqual(result, { stale: false });
});

await test("sidecar row timestamp projection → marker check (Phase 2 dedup proof)", () => {
  // Phase 2's projection dedups multi-row surfaces to one obs with the
  // latest timestamp. The marker check uses that timestamp directly. Two
  // budget-state rows for the same canonical id (vnstock), the projection
  // emits ONE obs carrying the latest. Pre-Phase-2 the sidecar was re-read
  // and reduced; post-Phase-4 the projection already supplies the latest.
  const t20 = ts(20);
  const t10 = ts(10);
  const t5 = ts(5);
  writeMarker(t5);
  const sidecarPath = join(root, "runtime-state.jsonl");
  const lines = [
    { id: "vnstock", kind: "budget-state", status: "active", affected_system: "vnstock", timestamp: t20, version: 0, metadata: {} },
    { id: "vnstock", kind: "budget-state", status: "active", affected_system: "vnstock", timestamp: t10, version: 1, metadata: {} },
  ].map((r) => JSON.stringify(r)).join("\n");
  writeFileSync(sidecarPath, lines + "\n", "utf8");

  // The bash gate's call site consumes `observations` from readRuntimeObservations
  // (the projection); verify that path: the projection emits one obs per
  // constraint with the latest t10 (vnstock maps to vendor-api + package-manager).
  // Marker at t5, obs at t10 → marker is NEWER than obs → stale.
  const observations = readRuntimeObservations(root);
  assert.strictEqual(observations.length, 2);
  for (const obs of observations) {
    assert.strictEqual(obs.updated_at, t10);
  }
  const result = checkObservationStaleness(observations, root);
  assert.strictEqual(result.stale, true);
});

await test("ledger-event rows are out of scope (kind filter at projection)", () => {
  // Phase 2's projection filters ledger-event rows BEFORE the dedup, so they
  // never reach the bash gate's checkObservationStaleness. No observations
  // means no stale.
  writeMarker(ts(5));
  const sidecarPath = join(root, "runtime-state.jsonl");
  writeFileSync(
    sidecarPath,
    JSON.stringify({
      affected_system: "vnstock",
      kind: "ledger-event",
      status: "active",
      id: "audit-1",
      timestamp: ts(10),
      metadata: {},
    }) + "\n",
    "utf8"
  );
  const observations = readRuntimeObservations(root);
  const result = checkObservationStaleness(observations, root);
  assert.deepStrictEqual(result, { stale: false });
});