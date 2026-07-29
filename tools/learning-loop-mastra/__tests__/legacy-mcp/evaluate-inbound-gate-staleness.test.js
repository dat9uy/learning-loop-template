// Plan 260728-2323-unify-observation-staleness-mechanism Phase 3: F1 invariant
// regression tests for the inbound gate's age selector after the swap from
// `findStaleObservations` (gate-logic.js) to `findObservationsStaleByAge`
// (observation-staleness.js).
//
// Pins:
//   - fresh latest-obs → no marker (no stale set)
//   - stale latest-obs → marker written (stale set non-empty)
//   - no observations → no marker
//   - missing updated_at → stale (stale-on-null, F1 defensiveness)
//   - precise multi-row case: older stale row + newer fresh row for the same
//     surface (canonical id) → not flagged (Phase 2 dedup + Phase 3 selector)

import assert from "node:assert";
import { test, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { evaluateInboundGate } from "../../core/evaluate-inbound-gate.js";

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "inbound-gate-stale-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function ts(minutesAgo) {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

function writeSidecar(rows) {
  mkdirSync(root, { recursive: true });
  const lines = rows.map((r) => JSON.stringify(r)).join("\n");
  writeFileSync(join(root, "runtime-state.jsonl"), lines + "\n", "utf8");
}

// State-change signal triggers the staleness scan; otherwise the gate short-
// circuits to "ok". Pick a phrase that matches a state-change pattern.
const STATE_CHANGE_PROMPT = "I cleared the device slot";

await test("fresh latest-obs (< 30 min) → no marker (decision: ok)", () => {
  writeSidecar([
    {
      id: "vnstock",
      kind: "budget-state",
      status: "active",
      affected_system: "vnstock",
      timestamp: ts(5),
      version: 0,
      metadata: {},
    },
  ]);
  const decision = evaluateInboundGate({ prompt: STATE_CHANGE_PROMPT, root });
  assert.strictEqual(decision.decision, "ok");
});

await test("stale latest-obs (> 30 min) → marker written (decision: warn)", () => {
  writeSidecar([
    {
      id: "vnstock",
      kind: "budget-state",
      status: "active",
      affected_system: "vnstock",
      timestamp: ts(60),
      version: 0,
      metadata: {},
    },
  ]);
  const decision = evaluateInboundGate({ prompt: STATE_CHANGE_PROMPT, root });
  assert.strictEqual(decision.decision, "warn");
});

await test("no observations → no marker (decision: ok)", () => {
  writeSidecar([]);
  const decision = evaluateInboundGate({ prompt: STATE_CHANGE_PROMPT, root });
  assert.strictEqual(decision.decision, "ok");
});

await test("missing updated_at on active obs → stale (stale-on-null, F1 defensiveness)", () => {
  // Sidecar row with no timestamp. The projection's dedup collapses to one
  // obs with updated_at = undefined → isObservationStaleByAge returns stale
  // (stale-on-null) → marker written.
  writeSidecar([
    {
      id: "vnstock",
      kind: "budget-state",
      status: "active",
      affected_system: "vnstock",
      // no timestamp
      version: 0,
      metadata: {},
    },
  ]);
  const decision = evaluateInboundGate({ prompt: STATE_CHANGE_PROMPT, root });
  assert.strictEqual(decision.decision, "warn");
});

await test("precise multi-row case: older stale + newer fresh, same surface → NOT flagged (Phase 2 dedup + Phase 3 selector)", () => {
  // Phase 2 dedup collapses to the latest max_by(version) row. Phase 3
  // selector checks only the latest's updated_at. So even though an older
  // stale row exists, the latest is fresh → not flagged. This is the
  // precise-vs-conservative behavior change accepted in the plan.
  writeSidecar([
    {
      id: "vnstock",
      kind: "budget-state",
      status: "active",
      affected_system: "vnstock",
      timestamp: ts(120), // older, stale if read alone
      version: 0,
      metadata: {},
    },
    {
      id: "vnstock",
      kind: "budget-state",
      status: "active",
      affected_system: "vnstock",
      timestamp: ts(5), // latest, fresh
      version: 1,
      metadata: {},
    },
  ]);
  const decision = evaluateInboundGate({ prompt: STATE_CHANGE_PROMPT, root });
  assert.strictEqual(decision.decision, "ok");
});

await test("non-state-change prompt short-circuits to ok even when obs stale", () => {
  writeSidecar([
    {
      id: "vnstock",
      kind: "budget-state",
      status: "active",
      affected_system: "vnstock",
      timestamp: ts(60),
      version: 0,
      metadata: {},
    },
  ]);
  // Prompt without a state-change signal → gate short-circuits without
  // scanning.
  const decision = evaluateInboundGate({ prompt: "Hello, please proceed", root });
  assert.strictEqual(decision.decision, "ok");
});

await test("paused surface → not flagged (writer pause check stays)", () => {
  mkdirSync(join(root, ".claude", "coordination"), { recursive: true });
  // Paused budget-state row triggers isSurfacePaused → skip.
  writeSidecar([
    {
      id: "vnstock",
      kind: "budget-state",
      status: "paused",
      affected_system: "vnstock",
      timestamp: ts(60),
      version: 0,
      metadata: {},
    },
  ]);
  writeFileSync(
    join(root, ".claude", "coordination", ".loop-preflight-runtime-tracking"),
    JSON.stringify({ completed_at: new Date().toISOString() }),
    "utf8"
  );
  const decision = evaluateInboundGate({ prompt: STATE_CHANGE_PROMPT, root });
  assert.strictEqual(decision.decision, "ok");
});