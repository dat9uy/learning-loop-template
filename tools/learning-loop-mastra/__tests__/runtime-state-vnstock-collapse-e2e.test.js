// Phase 3 e2e: collapse 20 vnstock ledger-event rows (15 distinct ids) into
// one versioned budget-state entity (canonical id per D8), with a terminal
// `stopped` lifecycle. Honors validate D2 (keep the collapse, not drop,
// honoring the operator's re-type decision) and D1 (stop = terminal).
//
// Hazards addressed:
//   - id-collision (R9): the canonical id is "vnstock" (NOT
//     "vnstock-device-slot-2026-05-08T10:17:23Z" — shared with a
//     runtime-state ledger-event row that the kind-aware dedup would
//     collapse under one id).
//   - history hidden (FailureMode #2): `include_all_versions: true` on
//     `runtime_state_read` returns the full version chain.

import { describe, test, expect } from "vitest";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OLD_TIMESTAMP_VNSTOCK_A = "2026-05-08T10:17:23Z";
const OLD_TIMESTAMP_VNSTOCK_B = "2026-05-09T07:18:00Z";
const OLD_TIMESTAMP_VNSTOCK_C = "2026-05-13T17:31:04Z";
const OLD_TIMESTAMP_MST = "2026-05-08T11:17:23Z";

function createRuntimeTrackingPreflight(root) {
  const markerDir = join(root, ".claude", "coordination");
  mkdirSync(markerDir, { recursive: true });
  writeFileSync(join(markerDir, ".loop-preflight-runtime-tracking"), "", "utf8");
}

function createRuntimeStatePreflight(root) {
  const markerDir = join(root, ".claude", "coordination");
  mkdirSync(markerDir, { recursive: true });
  writeFileSync(join(markerDir, ".loop-preflight-runtime-state"), "", "utf8");
}

function createBothPreflights(root) {
  createRuntimeTrackingPreflight(root);
  createRuntimeStatePreflight(root);
}

function seedRuntimeStateRows(root, rows) {
  const path = join(root, "runtime-state.jsonl");
  const body = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(path, body, "utf8");
}

describe("vnstock collapse e2e", () => {
  test("20 ledger-event rows → 1 versioned budget-state entity (terminal stopped), gate sees zero vnstock stale", async () => {
    const { runtimeStateStopTool } = await import("../tools/handlers/runtime-state-stop-tool.js");
    const { evaluateInboundGate } = await import("../core/evaluate-inbound-gate.js");
    const { readRuntimeStateRows, readBudgetTrackingState } = await import("../core/runtime-state.js");

    const tempDir = mkdtempSync(join(tmpdir(), "vnstock-collapse-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      // Pre-migration: 20 vnstock ledger-event rows (15 distinct ids) plus
      // 1 meta-state-tools ledger-event (unmapped). All ledger-event — out
      // of the gate's stale scope by kind, so the gate surfaces 0 stale.
      const rows = [];
      // 20 vnstock ledger-event rows.
      for (let i = 0; i < 20; i++) {
        rows.push({
          kind: "ledger-event",
          affected_system: "vnstock",
          id: `vnstock-device-slot-2026-05-${String(8 + Math.floor(i / 5)).padStart(2, "0")}T${String(10 + (i % 5)).padStart(2, "0")}:${String(17 + (i % 3)).padStart(2, "0")}Z`,
          value: i % 2,
          delta: i % 2,
          source_ref: "local:meta-state:rule-vnstock-device-slot-budget",
          timestamp: [OLD_TIMESTAMP_VNSTOCK_A, OLD_TIMESTAMP_VNSTOCK_B, OLD_TIMESTAMP_VNSTOCK_C][i % 3],
          status: "active",
          metadata: { experiment: `exp-${i}` },
        });
      }
      // 1 meta-state-tools ledger-event (out of scope by kind).
      rows.push({
        kind: "ledger-event",
        affected_system: "meta-state-tools",
        id: "mst-delivery-1",
        value: 0,
        delta: 0,
        source_ref: "local:meta-state:rule-test",
        timestamp: OLD_TIMESTAMP_MST,
        status: "active",
        metadata: {},
      });
      seedRuntimeStateRows(tempDir, rows);
      createBothPreflights(tempDir);

      // Pre-migration sanity: gate sees 0 stale (all rows are ledger-event).
      const before = evaluateInboundGate({ prompt: "I cleared the device", root: tempDir });
      assert.strictEqual(before.decision, "ok", "ledger-event rows out of scope by kind");

      // Migration: stop vnstock via the canonical budget-state entity.
      const stopRes = await runtimeStateStopTool.handler({
        surface: "vnstock",
        confirm: true,
      });
      const stopParsed = JSON.parse(stopRes.content[0].text);
      assert.strictEqual(stopParsed.ok, true);
      assert.strictEqual(stopParsed.stopped, true);

      // Post-migration: readBudgetTrackingState returns "stopped" for vnstock.
      const status = readBudgetTrackingState(tempDir, "vnstock");
      assert.strictEqual(status, "stopped", "vnstock canonical entity is stopped");

      // Post-migration: gate sees 0 vnstock stale (lifecycle excludes stopped).
      const after = evaluateInboundGate({ prompt: "I cleared the device", root: tempDir });
      assert.strictEqual(after.decision, "ok", "vnstock stopped → out by lifecycle");

      // Sidecar row count grew by exactly 1 (the stopped version).
      const allRows = readRuntimeStateRows(tempDir);
      assert.strictEqual(allRows.length, 22, "21 original + 1 stopped version");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("include_all_versions: true returns the full version chain", async () => {
    const { runtimeStatePauseTool } = await import("../tools/handlers/runtime-state-pause-tool.js");
    const { runtimeStateResumeTool } = await import("../tools/handlers/runtime-state-resume-tool.js");
    const { runtimeStateStopTool } = await import("../tools/handlers/runtime-state-stop-tool.js");
    const { runtimeStateReadTool } = await import("../tools/handlers/runtime-state-read-tool.js");
    const { readRuntimeStateRows } = await import("../core/runtime-state.js");
    void readRuntimeStateRows;

    const tempDir = mkdtempSync(join(tmpdir(), "vnstock-history-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createBothPreflights(tempDir);

      // Append 3 lifecycle transitions under the canonical id "vnstock".
      await runtimeStatePauseTool.handler({ surface: "vnstock" });
      await runtimeStateResumeTool.handler({ surface: "vnstock" });
      await runtimeStateStopTool.handler({ surface: "vnstock", confirm: true });

      const allRows = readRuntimeStateRows(tempDir);
      assert.strictEqual(allRows.length, 3);

      // Deduped read (default) → 1 row (the latest).
      const deduped = await runtimeStateReadTool.handler({
        affected_system: "vnstock",
      });
      const dedupedParsed = JSON.parse(deduped.content[0].text);
      assert.strictEqual(dedupedParsed.count, 1, "deduped projection: 1 row");
      assert.strictEqual(dedupedParsed.rows[0].status, "stopped", "latest is stopped");

      // include_all_versions: true → 3 rows (the full chain).
      const full = await runtimeStateReadTool.handler({
        affected_system: "vnstock",
        include_all_versions: true,
      });
      const fullParsed = JSON.parse(full.content[0].text);
      assert.strictEqual(fullParsed.count, 3, "include_all_versions: 3 rows");
      assert.strictEqual(fullParsed.include_all_versions, true);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("canonical id 'vnstock' is NOT the shared id (R9 id-collision avoidance)", async () => {
    // The shared id "vnstock-device-slot-2026-05-08T10:17:23Z" is taken by
    // a ledger-event row in the real sidecar; using it as the canonical
    // budget-state id would collapse under kind-blind max_by(version).
    // D8 keeps the canonical id = surface name, which is collision-free.
    const { runtimeStateStopTool } = await import("../tools/handlers/runtime-state-stop-tool.js");
    const { readRuntimeStateRows } = await import("../core/runtime-state.js");

    const tempDir = mkdtempSync(join(tmpdir(), "vnstock-collision-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createBothPreflights(tempDir);
      // Seed a ledger-event row with the shared id (the same id that
      // appears in the real sidecar).
      seedRuntimeStateRows(tempDir, [
        {
          kind: "ledger-event",
          affected_system: "vnstock",
          id: "vnstock-device-slot-2026-05-08T10:17:23Z",
          value: 0,
          delta: 0,
          source_ref: "local:meta-state:rule-vnstock-device-slot-budget",
          timestamp: OLD_TIMESTAMP_VNSTOCK_A,
          status: "active",
          metadata: {},
        },
      ]);

      // Stop uses the canonical id "vnstock" (NOT the shared id).
      const stopRes = await runtimeStateStopTool.handler({
        surface: "vnstock",
        confirm: true,
      });
      assert.strictEqual(JSON.parse(stopRes.content[0].text).ok, true);

      // Two distinct ids — no kind-blind collision.
      const ids = new Set(readRuntimeStateRows(tempDir).map((r) => r.id));
      assert.ok(ids.has("vnstock-device-slot-2026-05-08T10:17:23Z"), "shared ledger-event id preserved");
      assert.ok(ids.has("vnstock"), "canonical budget-state id added");
      assert.strictEqual(ids.size, 2);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
