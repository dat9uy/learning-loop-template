// Regression guard: pinning the "no delete-ledger-to-clear-gate" invariant.
//
// Bug class: the operator reached for the destructive `prune` to clear a
// budget gate — deleting a resolved finding's delivery audit trail (the
// "delete the ledger to clear the gate" flaw class, plans/reports/
// debug-260723-1410-pr77-runtime-state-prune-flaw.md). The fix is structural:
// the gate's stale count drops via the tracking lifecycle (pause/stop), NOT
// via row deletion.
//
// This test pins the invariant the PR#77 prune violated. It uses the public
// tool surface (`runtime_state_pause` + the gate reader). The row-count
// assertion uses `>=`, not `===` — the in-band pause appends a row, so a
// strict-equality assertion would break under the lifecycle mechanism.
//
// Live sidecar pause on the real repo is intentionally NOT run; the
// regression guard operates on a fixture sidecar. A separate pin test
// (bottom of file) asserts the REAL repo sidecar retains its ledger
// history (row count ≥ the pre-collapse 33 and the collapsed vnstock
// budget-state entity present, terminal stopped).

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Fixture timestamps: deliberately >30 minutes old so the gate's
// staleness threshold (`STALENESS_THRESHOLD_MS` in gate-logic.js:1024)
// classifies them stale without depending on wall-clock arithmetic.
const OLD_TIMESTAMP_VNSTOCK = "2026-05-08T10:17:23Z";
const OLD_TIMESTAMP_META = "2026-05-08T11:17:23Z";

function createRuntimeTrackingPreflight(root) {
  const markerDir = join(root, ".claude", "coordination");
  mkdirSync(markerDir, { recursive: true });
  writeFileSync(join(markerDir, ".loop-preflight-runtime-tracking"), JSON.stringify({ completed_at: new Date().toISOString() }), "utf8");
}

function createRuntimeStatePreflight(root) {
  const markerDir = join(root, ".claude", "coordination");
  mkdirSync(markerDir, { recursive: true });
  writeFileSync(join(markerDir, ".loop-preflight-runtime-state"), JSON.stringify({ completed_at: new Date().toISOString() }), "utf8");
}

function createBothPreflights(root) {
  createRuntimeTrackingPreflight(root);
  createRuntimeStatePreflight(root);
}

// Seed runtime-state.jsonl with N active rows across M surfaces so the
// gate has something to surface as stale. Each row needs an `id`, the
// correct `affected_system`, a timestamp older than the 30-min threshold,
// and a `kind` of `ledger-event` (the field's current shape in the real
// sidecar; Phase 2 will add `budget-state` rows but the legacy shape must
// still flow).
function seedRuntimeStateRows(root, rows) {
  const path = join(root, "runtime-state.jsonl");
  const body = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(path, body, "utf8");
}

describe("regression guard: no delete-ledger-to-clear-gate", () => {
  test("gate stale count drops via pause; runtime-state.jsonl row count does not decrease", async () => {
    const { runtimeStatePauseTool } = await import("../tools/handlers/runtime-state-pause-tool.js");
    const { readRuntimeStateRows } = await import("../core/runtime-state.js");
    const { evaluateInboundGate } = await import("../core/evaluate-inbound-gate.js");

    const tempDir = mkdtempSync(join(tmpdir(), "rt-nodelete-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      // Two surfaces: vnstock (mapped → "vendor-api" + "package-manager"
      // constraints; produces 2 observations per row) and meta-state-tools
      // (unmapped → "unmapped-active-entry" drift row; produces 1
      // observation per row). After Phase 2's kind+status gate filter, only
      // budget-state + status:active rows participate in the stale scan;
      // ledger-event rows are out of scope by kind. Use the kind+status
      // combination that survives the rewrite.
      seedRuntimeStateRows(tempDir, [
        {
          kind: "budget-state",
          affected_system: "vnstock",
          id: "vnstock-a",
          value: 0,
          delta: 0,
          source_ref: "local:meta-state:rule-vnstock-device-slot-budget",
          timestamp: OLD_TIMESTAMP_VNSTOCK,
          status: "active",
          metadata: { experiment: "exp-a" },
        },
        {
          kind: "budget-state",
          affected_system: "meta-state-tools",
          id: "mst-a",
          value: 0,
          delta: 0,
          source_ref: "local:meta-state:rule-test",
          timestamp: OLD_TIMESTAMP_META,
          status: "active",
          metadata: { experiment: "exp-b" },
        },
      ]);

      createBothPreflights(tempDir);

      // Pre-pause row count + gate observation.
      const beforeRows = readRuntimeStateRows(tempDir);
      const beforeCount = beforeRows.length;
      assert.strictEqual(beforeCount, 2, "fixture must seed 2 rows");

      // State-change prompt triggers the stale scan. "I cleared the
      // device" matches the surface pattern (device/slot/container/sandbox)
      // at evaluate-inbound-gate.js:32.
      const prompt = "I cleared the device slot before testing.";
      const before = evaluateInboundGate({ prompt, root: tempDir });
      // vnstock has 1 row → 2 observations (mapped to 2 constraints);
      // meta-state-tools has 1 row → 1 observation (unmapped drift row).
      // `dedupStale` (evaluate-inbound-gate.js:57-67) collapses by id+constraint,
      // so 3 observations dedup to 2 unique stale keys.
      assert.strictEqual(before.decision, "warn", "must warn before pause");
      assert.strictEqual(
        before.observations_stale.length,
        2,
        "pre-pause: vnstock-a + mst-a = 2 unique stale keys",
      );
      // Both surfaces represented in the pre-pause stale set.
      assert.ok(
        before.observations_stale.includes("vnstock-a"),
        "vnstock must appear in pre-pause stale set",
      );
      assert.ok(
        before.observations_stale.includes("mst-a"),
        "meta-state-tools must appear in pre-pause stale set",
      );

      // Run the public tool surface — `runtime_state_pause`. This is
      // the lever the test pins: pause, not prune. The test does NOT
      // touch the sidecar file shape directly so Phase 2's sidecar
      // retirement does not break it.
      const pauseRes = await runtimeStatePauseTool.handler({ surface: "vnstock" });
      const pauseParsed = JSON.parse(pauseRes.content[0].text);
      assert.strictEqual(pauseParsed.ok, true, "pause must succeed with preflight marker");

      // Row count does NOT decrease. The lever (pause) is non-destructive.
      const afterRows = readRuntimeStateRows(tempDir);
      assert.ok(
        afterRows.length >= beforeCount,
        `row count must not decrease (before=${beforeCount}, after=${afterRows.length})`,
      );

      // Gate stale count drops to the meta-state-tools subset ONLY.
      const after = evaluateInboundGate({ prompt, root: tempDir });
      assert.strictEqual(
        after.observations_stale.length,
        1,
        "post-pause: vnstock observations skipped, only meta-state-tools drift row remains = 1 stale",
      );
      assert.ok(
        after.observations_stale.includes("mst-a"),
        "meta-state-tools drift row must remain in post-pause stale set",
      );
      assert.ok(
        !after.observations_stale.some((id) => id.startsWith("vnstock-")),
        "no vnstock observation may remain in the post-pause stale set",
      );
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("re-running the gate does NOT zero the count — the lever is pause/lifecycle, not prune", async () => {
    // A second motivation: even after pausing vnstock, the unpaused-surface
    // subset still surfaces. Zeroing the count via any other mechanism
    // (deletion, hand-edit, sidecar rewrite) violates the invariant.
    // The test pins that the post-pause state is observably stable: the
    // gate still surfaces the unpaused subset on every call.
    const { runtimeStatePauseTool } = await import("../tools/handlers/runtime-state-pause-tool.js");
    const { evaluateInboundGate } = await import("../core/evaluate-inbound-gate.js");

    const tempDir = mkdtempSync(join(tmpdir(), "rt-nodelete-stable-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      seedRuntimeStateRows(tempDir, [
        {
          kind: "budget-state",
          affected_system: "vnstock",
          id: "vnstock-stable-a",
          value: 0,
          delta: 0,
          source_ref: "local:meta-state:rule-test",
          timestamp: OLD_TIMESTAMP_VNSTOCK,
          status: "active",
          metadata: {},
        },
        {
          kind: "budget-state",
          affected_system: "meta-state-tools",
          id: "mst-stable-a",
          value: 0,
          delta: 0,
          source_ref: "local:meta-state:rule-test",
          timestamp: OLD_TIMESTAMP_META,
          status: "active",
          metadata: {},
        },
      ]);
      createBothPreflights(tempDir);

      const prompt = "I cleared the device slot before testing.";
      const pauseRes = await runtimeStatePauseTool.handler({ surface: "vnstock" });
      assert.strictEqual(JSON.parse(pauseRes.content[0].text).ok, true);

      const first = evaluateInboundGate({ prompt, root: tempDir });
      const second = evaluateInboundGate({ prompt, root: tempDir });
      const third = evaluateInboundGate({ prompt, root: tempDir });

      // Each call observes the SAME post-pause count — the lever is the
      // lifecycle (pause), not a one-shot destructive op.
      assert.strictEqual(first.observations_stale.length, 1);
      assert.strictEqual(second.observations_stale.length, 1);
      assert.strictEqual(third.observations_stale.length, 1);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("repo sidecar pin (non-destructive collapse)", () => {
  // Pins the real repo sidecar against the destructive-prune regression
  // class: the vnstock collapse ADDED one budget-state row and deleted
  // nothing. If ledger history ever shrinks below the pre-collapse count,
  // something deleted rows to clear state — that mechanism must not return.
  test("real runtime-state.jsonl retains ledger history + collapsed vnstock entity", async () => {
    const { readRuntimeStateRows, readBudgetTrackingState } = await import("../core/runtime-state.js");
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
    const rows = readRuntimeStateRows(repoRoot);
    assert.ok(
      rows.length >= 33,
      `ledger history must not shrink below the pre-collapse 33 rows (got ${rows.length})`,
    );
    const vnstockEntity = rows.filter((r) => r.kind === "budget-state" && r.id === "vnstock");
    assert.ok(vnstockEntity.length >= 1, "collapsed vnstock budget-state entity exists");
    assert.strictEqual(
      readBudgetTrackingState(repoRoot, "vnstock"),
      "stopped",
      "vnstock canonical entity is terminal stopped",
    );
  });
});
