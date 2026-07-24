// Tests for the runtime-tracking helper: readBudgetTrackingState / isSurfacePaused.
//
// The tracking lifecycle is in-band in runtime-state.jsonl
// (kind: budget-state, status: paused | stopped | active). The
// .loop/runtime-tracking.json sidecar is retired. The helper reads the
// latest kind:budget-state row per surface via readBudgetTrackingState.
//
// Behavior contract:
//   - isSurfacePaused(root, surface) returns true iff the surface's latest
//     budget-state row is status: paused or stopped.
//   - readBudgetTrackingState throws on a corrupt budget-state row AND on
//     any unparseable sidecar line (fail-closed for writers).
//   - hasSurfacePreflightMarker enforces the 30-minute TTL (stale or
//     content-less markers do not authorize).
//
// Plus: handler-level tests for runtime_state_pause / resume / stop that
// route through the per-surface preflight marker (same convention as
// runtime_state_record).

import { describe, test, expect } from "vitest";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  readFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isSurfacePaused } from "../core/runtime-tracking.js";
import {
  readBudgetTrackingState,
  readRuntimeStateRows,
} from "../core/runtime-state.js";

const SURFACE_ENUM = ["vnstock", "fastapi", "tanstack", "product", "api", "web", "meta-state-tools", "runtime-state"];

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

function writeLifecycleRow(root, surface, status) {
  // Helper: seed the canonical budget-state row for a surface with a
  // given status. The canonical id is the surface name itself.
  const path = join(root, "runtime-state.jsonl");
  const row = {
    kind: "budget-state",
    affected_system: surface,
    id: surface,
    value: null,
    delta: null,
    source_ref: "local:meta-state:rule-runtime-state-budget-tracking",
    timestamp: new Date().toISOString(),
    status,
    fingerprint: null,
    metadata: { lifecycle_action: status },
  };
  writeFileSync(path, JSON.stringify(row) + "\n", "utf8");
}

describe("isSurfacePaused reads in-band budget-state status", () => {
  test("absent sidecar + no budget-state rows → not paused (fresh surface)", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "rt-absent-"));
    assert.strictEqual(isSurfacePaused(tempDir, "vnstock"), false);
  });

  test("status: paused → isSurfacePaused returns true", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "rt-paused-"));
    writeLifecycleRow(tempDir, "vnstock", "paused");
    assert.strictEqual(isSurfacePaused(tempDir, "vnstock"), true);
  });

  test("status: stopped → isSurfacePaused returns true (terminal also blocks)", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "rt-stopped-"));
    writeLifecycleRow(tempDir, "vnstock", "stopped");
    assert.strictEqual(isSurfacePaused(tempDir, "vnstock"), true);
  });

  test("status: active → isSurfacePaused returns false", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "rt-active-"));
    writeLifecycleRow(tempDir, "vnstock", "active");
    assert.strictEqual(isSurfacePaused(tempDir, "vnstock"), false);
  });

  test("latest lifecycle wins (pause → resume → not paused)", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "rt-latest-"));
    const path = join(tempDir, "runtime-state.jsonl");
    // Pause first.
    writeFileSync(path, JSON.stringify({
      kind: "budget-state",
      affected_system: "vnstock",
      id: "vnstock",
      value: null,
      delta: null,
      source_ref: "local:meta-state:rule-runtime-state-budget-tracking",
      timestamp: "2026-05-08T10:17:23Z",
      status: "paused",
      fingerprint: null,
      metadata: {},
    }) + "\n", "utf8");
    // Then resume (newer timestamp).
    writeFileSync(path, JSON.stringify({
      kind: "budget-state",
      affected_system: "vnstock",
      id: "vnstock",
      value: null,
      delta: null,
      source_ref: "local:meta-state:rule-runtime-state-budget-tracking",
      timestamp: "2026-05-09T10:17:23Z",
      status: "active",
      fingerprint: null,
      metadata: {},
    }) + "\n", { flag: "a" });
    assert.strictEqual(isSurfacePaused(tempDir, "vnstock"), false, "latest active wins");
  });

  test("kind-blind ledger-event rows do NOT affect pause check", () => {
    // A ledger-event row sharing the surface's id MUST NOT shadow the
    // budget-state row. Filter kind before dedup.
    const tempDir = mkdtempSync(join(tmpdir(), "rt-kind-blind-"));
    const path = join(tempDir, "runtime-state.jsonl");
    // ledger-event row for "vnstock" id with status "active" — should NOT
    // satisfy isSurfacePaused, because it's a ledger-event audit row.
    writeFileSync(path, JSON.stringify({
      kind: "ledger-event",
      affected_system: "vnstock",
      id: "vnstock",
      value: 0,
      delta: 0,
      source_ref: "local:meta-state:rule-vnstock",
      timestamp: "2026-05-08T10:17:23Z",
      status: "active",
      fingerprint: null,
      metadata: {},
    }) + "\n", "utf8");
    assert.strictEqual(isSurfacePaused(tempDir, "vnstock"), false, "ledger-event must not satisfy pause");
  });

  test("readBudgetTrackingState throws on a corrupt budget-state row", () => {
    // Corrupt budget-state rows must throw so a stopped surface cannot
    // silently un-stop on a corrupt read. The read-gate callers catch
    // and degrade to "not paused" (gate fail-open), but writers fail closed.
    const tempDir = mkdtempSync(join(tmpdir(), "rt-corrupt-"));
    const path = join(tempDir, "runtime-state.jsonl");
    writeFileSync(path, JSON.stringify({
      kind: "budget-state",
      affected_system: "vnstock",
      id: "vnstock",
      value: null,
      delta: null,
      source_ref: "local:meta-state:rule-runtime-state-budget-tracking",
      timestamp: "2026-05-08T10:17:23Z",
      status: "weird", // not a valid lifecycle status
      fingerprint: null,
      metadata: {},
    }) + "\n", "utf8");
    assert.throws(
      () => readBudgetTrackingState(tempDir, "vnstock"),
      /runtime_state_budget_tracking_corrupt/,
      "must throw on corrupt budget-state row",
    );
  });

  test("readBudgetTrackingState throws on ANY unparseable sidecar line", () => {
    // A malformed line could be a dropped stop/pause record — the reader
    // must fail-closed rather than resolve state from the survivors.
    const tempDir = mkdtempSync(join(tmpdir(), "rt-malformed-"));
    const path = join(tempDir, "runtime-state.jsonl");
    writeFileSync(path, JSON.stringify({
      kind: "budget-state",
      affected_system: "vnstock",
      id: "vnstock",
      value: null,
      delta: null,
      source_ref: "local:meta-state:rule-runtime-state-budget-tracking",
      timestamp: "2026-05-08T10:17:23Z",
      status: "stopped",
      fingerprint: null,
      metadata: {},
    }) + "\n{corrupt-line\n", "utf8");
    assert.throws(
      () => readBudgetTrackingState(tempDir, "vnstock"),
      /runtime_state_budget_tracking_corrupt/,
      "must throw on unparseable sidecar line",
    );
  });
});

describe("runtime_state_pause / resume / stop handlers", () => {
  test("pause appends a kind:budget-state, status:paused row under the canonical id", async () => {
    const { runtimeStatePauseTool } = await import("../tools/handlers/runtime-state-pause-tool.js");
    const tempDir = mkdtempSync(join(tmpdir(), "rt-pause-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createRuntimeTrackingPreflight(tempDir);
      const res = await runtimeStatePauseTool.handler({ surface: "vnstock" });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.ok, true);
      assert.strictEqual(parsed.paused, true);
      assert.strictEqual(parsed.surface, "vnstock");

      const rows = readRuntimeStateRows(tempDir);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].kind, "budget-state");
      assert.strictEqual(rows[0].status, "paused");
      assert.strictEqual(rows[0].id, "vnstock");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("resume appends a kind:budget-state, status:active row (only when previously paused)", async () => {
    const { runtimeStatePauseTool } = await import("../tools/handlers/runtime-state-pause-tool.js");
    const { runtimeStateResumeTool } = await import("../tools/handlers/runtime-state-resume-tool.js");
    const tempDir = mkdtempSync(join(tmpdir(), "rt-resume-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createRuntimeTrackingPreflight(tempDir);
      await runtimeStatePauseTool.handler({ surface: "vnstock" });
      const res = await runtimeStateResumeTool.handler({ surface: "vnstock" });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.ok, true);
      const rows = readRuntimeStateRows(tempDir);
      const latest = rows[rows.length - 1];
      assert.strictEqual(latest.status, "active");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("stop requires confirm:true and appends status:stopped (terminal)", async () => {
    const { runtimeStateStopTool } = await import("../tools/handlers/runtime-state-stop-tool.js");
    const tempDir = mkdtempSync(join(tmpdir(), "rt-stop-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createRuntimeTrackingPreflight(tempDir);
      // Without confirm → no row written.
      const noConfirm = await runtimeStateStopTool.handler({ surface: "vnstock" });
      const noConfirmParsed = JSON.parse(noConfirm.content[0].text);
      assert.strictEqual(noConfirmParsed.ok, false);
      assert.strictEqual(noConfirmParsed.reason, "confirm_required");
      assert.strictEqual(readRuntimeStateRows(tempDir).length, 0);

      // With confirm → terminal stop row.
      const confirmed = await runtimeStateStopTool.handler({ surface: "vnstock", confirm: true });
      const confirmedParsed = JSON.parse(confirmed.content[0].text);
      assert.strictEqual(confirmedParsed.ok, true);
      assert.strictEqual(confirmedParsed.stopped, true);
      const rows = readRuntimeStateRows(tempDir);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].status, "stopped");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("pause rejects when canonical entity is stopped (D1: terminal)", async () => {
    const { runtimeStatePauseTool } = await import("../tools/handlers/runtime-state-pause-tool.js");
    const { runtimeStateStopTool } = await import("../tools/handlers/runtime-state-stop-tool.js");
    const tempDir = mkdtempSync(join(tmpdir(), "rt-stoppped-pause-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createRuntimeTrackingPreflight(tempDir);
      await runtimeStateStopTool.handler({ surface: "vnstock", confirm: true });
      const res = await runtimeStatePauseTool.handler({ surface: "vnstock" });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.ok, false);
      assert.strictEqual(parsed.reason, "already_stopped");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("pause rejects unknown surface — schema-level", async () => {
    const { runtimeStatePauseTool } = await import("../tools/handlers/runtime-state-pause-tool.js");
    const surfaceParse = runtimeStatePauseTool.schema.surface.safeParse("vnstock_vendor");
    assert.strictEqual(surfaceParse.success, false, "schema must reject meta-state-only surfaces");
  });

  test("pause without preflight marker returns preflight_required", async () => {
    const { runtimeStatePauseTool } = await import("../tools/handlers/runtime-state-pause-tool.js");
    const tempDir = mkdtempSync(join(tmpdir(), "rt-pause-nopreflight-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      const res = await runtimeStatePauseTool.handler({ surface: "vnstock" });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.error, "preflight_required");
      assert.strictEqual(readRuntimeStateRows(tempDir).length, 0);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("runtime_state_record refuses a paused surface for the canonical id", async () => {
    const { runtimeStatePauseTool } = await import("../tools/handlers/runtime-state-pause-tool.js");
    const { runtimeStateRecordTool } = await import("../tools/handlers/runtime-state-record-tool.js");
    const tempDir = mkdtempSync(join(tmpdir(), "rt-record-paused-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createBothPreflights(tempDir);
      await runtimeStatePauseTool.handler({ surface: "vnstock" });

      // Canonical id == surface → blocked (D1: the stopped/paused entity
      // is blocked).
      const res = await runtimeStateRecordTool.handler({
        affected_system: "vnstock",
        kind: "budget-state",
        id: "vnstock",
        value: 0,
        delta: 0,
        source_ref: "local:meta-state:rule-test",
        timestamp: "2026-05-08T10:17:23Z",
      });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.ok, false);
      assert.strictEqual(parsed.status, "paused");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("runtime_state_record rejects a budget-state row under a non-canonical id", async () => {
    const { runtimeStateRecordTool } = await import("../tools/handlers/runtime-state-record-tool.js");
    const tempDir = mkdtempSync(join(tmpdir(), "rt-record-freshid-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createBothPreflights(tempDir);

      // One tracking entity per surface under the canonical id (the
      // surface name) — pause/resume/stop only ever write that id, so a
      // budget-state record under any other id would fork the lifecycle.
      const res = await runtimeStateRecordTool.handler({
        affected_system: "vnstock",
        kind: "budget-state",
        id: "vnstock-fresh-1",
        value: 0,
        delta: 0,
        source_ref: "local:meta-state:rule-test",
        timestamp: "2026-05-08T10:17:23Z",
      });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.ok, false);
      assert.strictEqual(parsed.reason, "canonical_id_required");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("budget-state record under the canonical id after stop is the sanctioned restart (and repeatable)", async () => {
    const { runtimeStateStopTool } = await import("../tools/handlers/runtime-state-stop-tool.js");
    const { runtimeStateRecordTool } = await import("../tools/handlers/runtime-state-record-tool.js");
    const tempDir = mkdtempSync(join(tmpdir(), "rt-record-restart-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createBothPreflights(tempDir);
      await runtimeStateStopTool.handler({ surface: "vnstock", confirm: true });

      const recordArgs = {
        affected_system: "vnstock",
        kind: "budget-state",
        id: "vnstock",
        value: 0,
        delta: 0,
        source_ref: "local:meta-state:rule-test",
        timestamp: "2026-05-08T10:17:23Z",
      };
      // Restart: first record after stop is allowed — a fresh active
      // version on top of the preserved stopped history.
      const first = JSON.parse((await runtimeStateRecordTool.handler(recordArgs)).content[0].text);
      assert.strictEqual(first.ok, true, "record under the canonical id restarts a stopped surface");
      // The restarted entity is live: subsequent records are ordinary
      // re-records, not rejections.
      const second = JSON.parse((await runtimeStateRecordTool.handler(recordArgs)).content[0].text);
      assert.strictEqual(second.ok, true, "re-record on the restarted entity is allowed");
      const status = readBudgetTrackingState(tempDir, "vnstock");
      assert.strictEqual(status, "active", "surface is live after restart");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("runtime_state_record fails closed when the sidecar has an unparseable line", async () => {
    const { runtimeStateRecordTool } = await import("../tools/handlers/runtime-state-record-tool.js");
    const tempDir = mkdtempSync(join(tmpdir(), "rt-record-corrupt-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createBothPreflights(tempDir);
      appendFileSync(join(tempDir, "runtime-state.jsonl"), "{not-json\n", "utf8");

      const res = await runtimeStateRecordTool.handler({
        affected_system: "vnstock",
        kind: "ledger-event",
        id: "vnstock-any",
        value: 0,
        delta: 0,
        source_ref: "local:meta-state:rule-test",
        timestamp: "2026-05-08T10:17:23Z",
      });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.ok, false);
      assert.strictEqual(parsed.error, "corrupt_state");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("runtime_state_resume rejects a never-tracked surface (resume requires paused)", async () => {
    const { runtimeStateResumeTool } = await import("../tools/handlers/runtime-state-resume-tool.js");
    const tempDir = mkdtempSync(join(tmpdir(), "rt-resume-null-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      createBothPreflights(tempDir);
      const res = await runtimeStateResumeTool.handler({ surface: "fastapi" });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.ok, false);
      assert.strictEqual(parsed.reason, "not_tracked");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("preflight marker older than the TTL does not authorize lifecycle ops", async () => {
    const { runtimeStatePauseTool } = await import("../tools/handlers/runtime-state-pause-tool.js");
    const tempDir = mkdtempSync(join(tmpdir(), "rt-stale-marker-"));
    const originalEnv = process.env.GATE_ROOT;
    process.env.GATE_ROOT = tempDir;
    try {
      const markerDir = join(tempDir, ".claude", "coordination");
      mkdirSync(markerDir, { recursive: true });
      writeFileSync(
        join(markerDir, ".loop-preflight-runtime-tracking"),
        JSON.stringify({ completed_at: new Date(Date.now() - 31 * 60 * 1000).toISOString() }),
        "utf8",
      );
      const res = await runtimeStatePauseTool.handler({ surface: "vnstock" });
      const parsed = JSON.parse(res.content[0].text);
      assert.strictEqual(parsed.error, "preflight_required");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
