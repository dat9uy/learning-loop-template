// Plan 260728-2323-unify-observation-staleness-mechanism Phase 2: TDD tests
// for the kind-before-collapse dedup helper and the projection swap.
//
// Pins:
//   - collapseLatestBudgetStateById: dedups per id to max_by(version),
//     filters budget-state BEFORE collapse (cross-kind collision guard).
//   - readRuntimeObservations: emits ONE observation per (id × constraint),
//     latest row's fields. One per canonical id (surface name) = per surface.
//   - Cross-kind collision guard: a budget-state v0 + canonical-id
//     ledger-event v1 MUST NOT shadow the budget-state (re-red-team F1).
//   - Constraint-gate oracle: every existing fixture's found/not-found
//     decision is unchanged.

import assert from "node:assert";
import { test, describe } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  collapseLatestBudgetStateById,
} from "../../core/runtime-state.js";
import { readRuntimeObservations } from "../../core/file-readers.js";
import { checkObservationExists, makeGateDecision } from "../../core/command-constraint-policy.js";

function ts(minutesAgo) {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

describe("collapseLatestBudgetStateById", () => {
  test("filters budget-state BEFORE dedup (cross-kind collision guard)", () => {
    // Re-red-team F1: a budget-state v0 + canonical-id ledger-event v1 must
    // NOT let the ledger-event shadow the budget-state. The ledger-event is
    // filtered out before the dedup runs.
    const rows = [
      { id: "vnstock", kind: "budget-state", status: "active", timestamp: ts(5), version: 0 },
      { id: "vnstock", kind: "ledger-event", status: "active", timestamp: ts(10), version: 1 },
    ];
    const out = collapseLatestBudgetStateById(rows);
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].kind, "budget-state");
    assert.strictEqual(out[0].version, 0);
  });

  test("ledger-event rows are dropped (kind filter)", () => {
    const rows = [
      { id: "audit-1", kind: "ledger-event", status: "active", timestamp: ts(5), version: 0 },
    ];
    const out = collapseLatestBudgetStateById(rows);
    assert.deepStrictEqual(out, []);
  });

  test("kind-less legacy rows treated as budget-state (read-compat)", () => {
    // Rows with no kind predate the discriminator and count as budget-state
    // (every row was scannable tracking state before the kinds split).
    const rows = [
      { id: "vnstock", status: "active", timestamp: ts(5), version: 0 },
    ];
    const out = collapseLatestBudgetStateById(rows);
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].id, "vnstock");
  });

  test("no-id rows pass through unchanged (re-red-team M1: legacy per-row)", () => {
    // Rows with no `id` are NOT deduped by collapseLatestById (which drops
    // no-id rows) — they pass through so the projection emits one obs per
    // row (per-row conservative path). Plan 260728-2323 re-red-team M1
    // explicitly preserves this for legacy / hand-crafted data shapes.
    const rows = [
      { kind: "budget-state", status: "active", affected_system: "vnstock", timestamp: ts(5) }, // no id
      { kind: "budget-state", status: "active", affected_system: "vnstock", timestamp: ts(10) }, // no id
    ];
    const out = collapseLatestBudgetStateById(rows);
    assert.strictEqual(out.length, 2);
  });

  test("mixed id + no-id: id'd rows dedup, no-id rows pass through", () => {
    const t3 = ts(3);
    const rows = [
      { id: "vnstock", kind: "budget-state", status: "active", timestamp: ts(20), version: 0 },
      { id: "vnstock", kind: "budget-state", status: "active", timestamp: ts(5), version: 1 },
      { kind: "budget-state", status: "active", timestamp: t3 }, // no id
    ];
    const out = collapseLatestBudgetStateById(rows);
    // 1 deduped vnstock + 1 no-id pass-through = 2
    assert.strictEqual(out.length, 2);
    const ided = out.find((r) => r.id === "vnstock");
    assert.strictEqual(ided.version, 1);
    assert.strictEqual(out.find((r) => !r.id).timestamp, t3);
  });

  test("multiple budget-state rows same id dedups to max_by(version)", () => {
    const t5 = ts(5);
    const rows = [
      { id: "vnstock", kind: "budget-state", status: "active", timestamp: ts(20), version: 0 },
      { id: "vnstock", kind: "budget-state", status: "active", timestamp: ts(10), version: 1 },
      { id: "vnstock", kind: "budget-state", status: "active", timestamp: t5, version: 2 },
    ];
    const out = collapseLatestBudgetStateById(rows);
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].version, 2);
    assert.strictEqual(out[0].timestamp, t5);
  });

  test("multiple distinct ids each keep their own latest", () => {
    const rows = [
      { id: "vnstock", kind: "budget-state", status: "active", timestamp: ts(20), version: 0 },
      { id: "fastapi", kind: "budget-state", status: "active", timestamp: ts(15), version: 0 },
      { id: "vnstock", kind: "budget-state", status: "active", timestamp: ts(5), version: 1 },
    ];
    const out = collapseLatestBudgetStateById(rows);
    assert.strictEqual(out.length, 2);
    const byId = Object.fromEntries(out.map((r) => [r.id, r]));
    assert.strictEqual(byId.vnstock.version, 1);
    assert.strictEqual(byId.fastapi.version, 0);
  });
});

describe("readRuntimeObservations: dedup projection", () => {
  let root;

  test("setup", () => {
    root = mkdtempSync(join(tmpdir(), "dedup-projection-"));
  });

  test("multi-row surface dedups to one observation per constraint, latest timestamp", () => {
    // Pre-dedup: emit 2 observations per row × 2 constraints = 6 obs.
    // Post-dedup: emit 1 observation per constraint = 2 obs (both carrying
    // updated_at = T2 = the latest row).
    mkdirSync(root, { recursive: true });
    const sidecarPath = join(root, "runtime-state.jsonl");
    const t1 = ts(20);
    const t2 = ts(5);
    const lines = [
      // vnstock canonical id = "vnstock"; T1 older, T2 newer.
      { id: "vnstock", kind: "budget-state", status: "active", affected_system: "vnstock", timestamp: t1, version: 0, metadata: { value: 0 } },
      { id: "vnstock", kind: "budget-state", status: "active", affected_system: "vnstock", timestamp: t2, version: 1, metadata: { value: 1 } },
      // fastapi canonical id = "fastapi"; T1 older, T2 newer.
      { id: "fastapi", kind: "budget-state", status: "active", affected_system: "fastapi", timestamp: ts(15), version: 0, metadata: { value: 0 } },
      { id: "fastapi", kind: "budget-state", status: "active", affected_system: "fastapi", timestamp: ts(10), version: 1, metadata: { value: 1 } },
    ].map((r) => JSON.stringify(r)).join("\n");
    writeFileSync(sidecarPath, lines + "\n", "utf8");

    const observations = readRuntimeObservations(root);
    // 2 surfaces × 1 vnstock constraint (["vendor-api","package-manager"] is
    // only mapped for vnstock) = the actual mapping matters here.
    // fastapi isn't in AFFECTED_SYSTEM_TO_CONSTRAINTS → no observation.
    // So we expect only vnstock constraints to emit: 2 (one per constraint).
    const vnstockObs = observations.filter((o) => o.affected_system === "vnstock");
    assert.strictEqual(vnstockObs.length, 2);
    // Both must carry the latest timestamp T2 and its metadata.
    for (const obs of vnstockObs) {
      assert.strictEqual(obs.updated_at, t2);
      assert.strictEqual(obs.metadata?.value, 1);
    }
  });

  test("cross-kind collision: budget-state v0 + canonical-id ledger-event v1 → budget-state survives", () => {
    // The blocking test for kind-before-collapse ordering. The ledger-event
    // shares the canonical id "vnstock" with the budget-state. With
    // kind-before-collapse, the ledger-event is filtered out before the
    // dedup → the budget-state v0 survives as the observation.
    // A naive collapse-all-then-filter-kind would let the v1 ledger-event
    // shadow the budget-state → the observation vanishes.
    mkdirSync(root, { recursive: true });
    const sidecarPath = join(root, "runtime-state.jsonl");
    const tBudget = ts(20);
    const lines = [
      { id: "vnstock", kind: "budget-state", status: "active", affected_system: "vnstock", timestamp: tBudget, version: 0, metadata: { value: 1 } },
      { id: "vnstock", kind: "ledger-event", status: "active", affected_system: "vnstock", timestamp: ts(5), version: 1, metadata: { value: 0 } },
    ].map((r) => JSON.stringify(r)).join("\n");
    writeFileSync(sidecarPath, lines + "\n", "utf8");

    const observations = readRuntimeObservations(root);
    const vnstockObs = observations.filter((o) => o.affected_system === "vnstock");
    assert.strictEqual(vnstockObs.length, 2); // vendor-api + package-manager
    assert.strictEqual(vnstockObs[0].updated_at, tBudget);
    assert.strictEqual(vnstockObs[0].metadata?.value, 1);
  });

  test("constraint-gate oracle: checkObservationExists still finds vnstock", () => {
    // After dedup, the canonical-id contract is preserved. The gate's
    // checkObservationExists uses a found/not-found find() — the dedup
    // changes WHICH row is matched but not WHETHER a match exists.
    mkdirSync(root, { recursive: true });
    const sidecarPath = join(root, "runtime-state.jsonl");
    const lines = [
      { id: "vnstock", kind: "budget-state", status: "active", affected_system: "vnstock", timestamp: ts(20), version: 0, value: 1, delta: 0 },
      { id: "vnstock", kind: "budget-state", status: "active", affected_system: "vnstock", timestamp: ts(5), version: 1, value: 1, delta: 1 },
    ].map((r) => JSON.stringify(r)).join("\n");
    writeFileSync(sidecarPath, lines + "\n", "utf8");

    const observations = readRuntimeObservations(root);
    const status = checkObservationExists("vendor-api", observations);
    assert.strictEqual(status.found, true);
  });

  test("constraint-gate oracle: checkObservationExists returns not-found for absent surface", () => {
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "runtime-state.jsonl"), "", "utf8");
    const observations = readRuntimeObservations(root);
    const status = checkObservationExists("vendor-api", observations);
    assert.strictEqual(status.found, false);
  });

  test("lifecycle transition: active v0 + paused v1 (same canonical id) → no active observation → constraint gate blocks (intended)", () => {
    // runtime_state_pause appends a kind:budget-state, status:paused row under
    // the canonical id at a higher version. kind-before-collapse keeps only the
    // paused row; the status=active filter then emits NO observation, so
    // checkObservationExists returns not-found and makeGateDecision blocks.
    // Intended (a paused surface should not satisfy the "observation required"
    // constraint) and pinned here as the regression guard. The same flip holds
    // for active→stopped (terminal).
    mkdirSync(root, { recursive: true });
    const sidecarPath = join(root, "runtime-state.jsonl");
    const lines = [
      { id: "vnstock", kind: "budget-state", status: "active", affected_system: "vnstock", timestamp: ts(20), version: 0, metadata: {} },
      { id: "vnstock", kind: "budget-state", status: "paused", affected_system: "vnstock", timestamp: ts(5), version: 1, metadata: {} },
    ].map((r) => JSON.stringify(r)).join("\n");
    writeFileSync(sidecarPath, lines + "\n", "utf8");

    const observations = readRuntimeObservations(root);
    assert.strictEqual(observations.length, 0);
    const status = checkObservationExists("vendor-api", observations);
    assert.strictEqual(status.found, false);
    const decision = makeGateDecision("vendor-api", status);
    assert.strictEqual(decision.decision, "block");
  });

  test("teardown", () => {
    rmSync(root, { recursive: true, force: true });
  });
});
