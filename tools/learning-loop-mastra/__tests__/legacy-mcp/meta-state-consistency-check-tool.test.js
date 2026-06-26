// Phase 2 tests: meta_state_consistency_check MCP tool — read-only probe
// for status/audit-field drift.
//
// Mirrors the meta-state-query-drift-tool.test.js SP3 pattern (24 tests,
// T-25 through T-48). This file holds 8 tests (T-1 through T-8) per the
// researcher's Section 4.2 test plan in plan 260626-1734-phase-e-registry-drift-fix.
//
// TDD: this file is created BEFORE the implementation. Tests are initially
// RED (failing — Cannot find module) and turn GREEN after the tool is
// implemented in tools/legacy/meta-state-consistency-check-tool.js.

import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateConsistencyCheckTool } from "../../tools/legacy/meta-state-consistency-check-tool.js";

function getGateLogPath(tempDir) {
  return join(tempDir, ".claude", "coordination", "gate-log.jsonl");
}

describe("meta_state_consistency_check tool", () => {
  const originalEnv = process.env.GATE_ROOT;

  // T-1: Empty registry → 0 drift
  test("T-1: empty registry returns 0 drift", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "consistency-check-tool-1-"));
    process.env.GATE_ROOT = tempDir;
    writeFileSync(join(tempDir, "meta-state.jsonl"), "");
    try {
      const result = await metaStateConsistencyCheckTool.handler({});
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.drift_count, 0);
      assert.deepStrictEqual(parsed.drift_events, []);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-2: Seeded registry with one F-1 breach → 1 drift event
  test("T-2: registry with one F-1 breach returns 1 drift event", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "consistency-check-tool-2-"));
    process.env.GATE_ROOT = tempDir;
    const entry = {
      id: "meta-260601T0000Z-f1-breach",
      entry_kind: "finding",
      status: "active",
      resolved_at: "2026-06-01T00:00:00.000Z",
      resolved_by: "operator",
    };
    writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify(entry) + "\n");
    try {
      const result = await metaStateConsistencyCheckTool.handler({});
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.drift_count, 1);
      assert.strictEqual(parsed.drift_events[0].id, entry.id);
      assert.strictEqual(parsed.drift_events[0].invariant_id, "F-1");
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-3: Every call appends exactly 1 gate-log entry with correct shape
  test("T-3: every call appends exactly 1 gate-log entry with shape { event, drift_count }", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "consistency-check-tool-3-"));
    process.env.GATE_ROOT = tempDir;
    writeFileSync(join(tempDir, "meta-state.jsonl"), "");
    try {
      await metaStateConsistencyCheckTool.handler({});
      await metaStateConsistencyCheckTool.handler({});
      await metaStateConsistencyCheckTool.handler({});
      const gateLogRaw = readFileSync(getGateLogPath(tempDir), "utf8");
      const lines = gateLogRaw.split("\n").filter((l) => l.trim() !== "");
      assert.strictEqual(lines.length, 3);
      for (const line of lines) {
        const entry = JSON.parse(line);
        assert.strictEqual(entry.event, "meta_state_consistency_check");
        assert.strictEqual(typeof entry.drift_count, "number");
      }
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-4: missing meta-state.jsonl — readRegistry returns [] → 0 drift, no crash
  test("T-4: missing meta-state.jsonl is handled gracefully (0 drift, no crash)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "consistency-check-tool-4-"));
    process.env.GATE_ROOT = tempDir;
    // Deliberately do NOT create meta-state.jsonl — readRegistry returns []
    // for a missing file per core/meta-state.js:349.
    try {
      const result = await metaStateConsistencyCheckTool.handler({});
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.drift_count, 0);
      assert.deepStrictEqual(parsed.drift_events, []);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-5: Read-only — handler does NOT modify meta-state.jsonl (mtime check)
  test("T-5: handler is read-only (does not modify meta-state.jsonl)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "consistency-check-tool-5-"));
    process.env.GATE_ROOT = tempDir;
    const registryPath = join(tempDir, "meta-state.jsonl");
    const entry = {
      id: "meta-260601T0000Z-readonly-test",
      entry_kind: "finding",
      status: "active",
    };
    writeFileSync(registryPath, JSON.stringify(entry) + "\n");
    // Wait a moment so any modification would produce a different mtime.
    // (Most filesystems have mtime granularity of 1s or better; 50ms is
    // enough to detect a write on most platforms, but be defensive.)
    await new Promise((r) => setTimeout(r, 1100));
    const mtimeBefore = statSync(registryPath).mtimeMs;
    try {
      await metaStateConsistencyCheckTool.handler({});
      await metaStateConsistencyCheckTool.handler({});
      const mtimeAfter = statSync(registryPath).mtimeMs;
      assert.strictEqual(mtimeBefore, mtimeAfter);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-6: Mixed findings + change-logs with 3 breaches → 3 events in stable order
  test("T-6: mixed registry with 3 breaches returns 3 events sorted by (entry_kind, id, invariant_id)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "consistency-check-tool-6-"));
    process.env.GATE_ROOT = tempDir;
    const entries = [
      // F-1 breach on a finding
      { id: "meta-260601T0000Z-f1", entry_kind: "finding", status: "active",
        resolved_at: "2026-06-01T00:00:00.000Z", resolved_by: "op" },
      // F-3 breach on a finding (resolved without resolved_by)
      { id: "meta-260601T0000Z-f3", entry_kind: "finding", status: "resolved" },
      // F-4 breach on a finding (superseded without consolidated_into)
      { id: "meta-260601T0000Z-f4", entry_kind: "finding", status: "superseded" },
      // Clean finding (should NOT appear)
      { id: "meta-260601T0000Z-clean", entry_kind: "finding", status: "resolved",
        resolved_at: "2026-06-01T00:00:00.000Z", resolved_by: "op" },
    ];
    writeFileSync(
      join(tempDir, "meta-state.jsonl"),
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n"
    );
    try {
      const result = await metaStateConsistencyCheckTool.handler({});
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.drift_count, 3);
      // All 3 entries share entry_kind=finding, so they're sorted by id
      const ids = parsed.drift_events.map((e) => e.id);
      assert.deepStrictEqual(ids, [
        "meta-260601T0000Z-f1",
        "meta-260601T0000Z-f3",
        "meta-260601T0000Z-f4",
      ]);
      const invariantIds = parsed.drift_events.map((e) => e.invariant_id);
      assert.deepStrictEqual(invariantIds, ["F-1", "F-3", "F-4"]);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-7: Lean event shape — each event has exactly the documented fields
  test("T-7: drift events have exactly the documented fields", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "consistency-check-tool-7-"));
    process.env.GATE_ROOT = tempDir;
    const entry = {
      id: "meta-260601T0000Z-shape-test",
      entry_kind: "finding",
      status: "active",
      resolved_at: "2026-06-01T00:00:00.000Z",
    };
    writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify(entry) + "\n");
    try {
      const result = await metaStateConsistencyCheckTool.handler({});
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.drift_count, 1);
      const ev = parsed.drift_events[0];
      assert.deepStrictEqual(Object.keys(ev).sort(), [
        "entry_kind",
        "forbidden_fields",
        "id",
        "invariant_id",
        "message",
        "missing_fields",
        "present_fields",
        "status",
      ]);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-8: drift_count === drift_events.length
  test("T-8: drift_count matches drift_events.length", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "consistency-check-tool-8-"));
    process.env.GATE_ROOT = tempDir;
    const entries = [
      { id: "meta-260601T0000Z-a", entry_kind: "finding", status: "active",
        resolved_at: "2026-06-01T00:00:00.000Z" },
      { id: "meta-260601T0000Z-b", entry_kind: "finding", status: "active",
        resolved_by: "op" },
      { id: "meta-260601T0000Z-c", entry_kind: "finding", status: "active",
        resolution: "operator narrative" },
      { id: "meta-260601T0000Z-d", entry_kind: "finding", status: "active" },
      { id: "meta-260601T0000Z-e", entry_kind: "finding", status: "resolved" },
    ];
    writeFileSync(
      join(tempDir, "meta-state.jsonl"),
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n"
    );
    try {
      const result = await metaStateConsistencyCheckTool.handler({});
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.drift_count, parsed.drift_events.length);
      // Only a, b, c should drift (status=active with F-1 forbidden fields); d is clean; e has no resolved_by but it's F-3 not F-1
      // Wait — e IS status=resolved without resolved_by → F-3 breach → drift!
      // So 4 drift events expected (a, b, c, e).
      assert.strictEqual(parsed.drift_count, 4);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });
});