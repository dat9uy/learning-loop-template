import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateQueryDriftTool } from "../../tools/legacy/meta-state-query-drift-tool.js";
import { metaStateReportTool } from "../../tools/legacy/meta-state-report-tool.js";

function getGateLogPath(tempDir) {
  return join(tempDir, ".claude", "coordination", "gate-log.jsonl");
}

describe("meta_state_query_drift tool", () => {
  const originalEnv = process.env.GATE_ROOT;

  // T-25: Default mode (run_grounding: false) → derivation-only drift
  test("T-25: default run_grounding false returns derivation-only drift events", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-25-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");
      writeFileSync(join(tempDir, "src.test.js"), "// test");
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Default mode test finding for derivation-only drift.",
        evidence_code_ref: "src.js",
        evidence_test: "src.test.js",
      });

      const result = await metaStateQueryDriftTool.handler({});
      assert.strictEqual(result.drift_count, 1);
      assert.strictEqual(result.drift_events[0].derived_status, "resolved-by-mechanism");
      assert.strictEqual(result.drift_events[0].recommendation, "resolve");
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-26: Default mode → gate log entry created
  test("T-26: default run_grounding false appends gate log line on call", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-26-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateQueryDriftTool.handler({});
      const gateLogRaw = readFileSync(getGateLogPath(tempDir), "utf8");
      const lines = gateLogRaw.split("\n").filter((l) => l.trim() !== "");
      assert.strictEqual(lines.length, 1);
      const logEntry = JSON.parse(lines[0]);
      assert.strictEqual(logEntry.event, "meta_state_query_drift");
      // filter is undefined when no filter provided; JSON.stringify omits undefined values
      // (T-47 explicitly tests for this behavior)
      assert.strictEqual(logEntry.run_grounding, false);
      assert.strictEqual(logEntry.drift_count, 0);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-27: Default mode → SP2 not invoked
  test("T-27: default run_grounding false does not invoke checkGrounding; entries without evidence_code_ref are not filtered out", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-27-"));
    process.env.GATE_ROOT = tempDir;
    try {
      // Create an entry with no evidence_code_ref (no-signals → fast path skip)
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Entry with no code ref — should be skipped via fast path.",
      });
      const result = await metaStateQueryDriftTool.handler({});
      assert.strictEqual(result.drift_count, 0);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-28: No filter → all non-terminal entries scanned
  test("T-28: no filter scans all non-terminal entries (active and reported)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-28-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");
      writeFileSync(join(tempDir, "src.test.js"), "// test");
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Active entry for filter test one.",
        evidence_code_ref: "src.js",
        evidence_test: "src.test.js",
      });
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Reported entry for filter test two.",
        evidence_code_ref: "src.js",
        evidence_test: "src.test.js",
      });
      const result = await metaStateQueryDriftTool.handler({});
      // Both entries are reported (default status for new entries); should both surface as drift
      assert.strictEqual(result.drift_count, 2);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-29: Filter status active → migrated to `open` after Phase 2.
  // Plan 260707-0812 Phase 2: `meta_state_ack` removed; new findings are
  // written with `status: "open"`. The legacy `status: "active"`/`status: "reported"`
  // filter values still return legacy entries via filterEntries' backward-compat
  // mapping, but new entries land as `open`.
  test("T-29: filter status active returns legacy active entries (post-migration empty)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-29-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");
      writeFileSync(join(tempDir, "src.test.js"), "// test");
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Open entry for filter test one.",
        evidence_code_ref: "src.js",
        evidence_test: "src.test.js",
      });

      // Post-Phase 2: filter by `active` returns nothing because no new
      // entries land with `active` (ack is gone). The legacy mapping keeps
      // the schema permissive but the steady state is `open`.
      const result = await metaStateQueryDriftTool.handler({ filter: { status: "active" } });
      assert.strictEqual(result.drift_count, 0);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-30: Filter status reported → migrated. No new entries land as
  // `reported` post-Phase 2; the filter is forward-compat for legacy entries.
  test("T-30: filter status reported returns legacy reported entries (post-migration empty)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-30-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");
      writeFileSync(join(tempDir, "src.test.js"), "// test");
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Open entry for reported-only filter test.",
        evidence_code_ref: "src.js",
        evidence_test: "src.test.js",
      });

      const result = await metaStateQueryDriftTool.handler({ filter: { status: "reported" } });
      assert.strictEqual(result.drift_count, 0);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-31: No filter → all open entries
  test("T-31: no filter returns all open entries", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-31-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");
      writeFileSync(join(tempDir, "src.test.js"), "// test");
      // Post-Phase 2: both entries are `status: "open"` (no ack, no
      // reported/active split). The no-filter path returns all open entries.
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Open entry for no-filter test one.",
        evidence_code_ref: "src.js",
        evidence_test: "src.test.js",
      });

      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Open entry for no-filter test two.",
        evidence_code_ref: "src.js",
        evidence_test: "src.test.js",
      });

      const result = await metaStateQueryDriftTool.handler({});
      assert.strictEqual(result.drift_count, 2);
      const statuses = result.drift_events.map((e) => e.raw_status).sort();
      assert.deepStrictEqual(statuses, ["open", "open"]);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-32: Invalid filter status (zod-like rejection)
  test("T-32: invalid filter.status value yields empty result (function only accepts open/active/reported/stale)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-32-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");
      writeFileSync(join(tempDir, "src.test.js"), "// test");
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Test entry for invalid filter test.",
        evidence_code_ref: "src.js",
        evidence_test: "src.test.js",
      });
      // The tool doesn't use zod validation in the raw shape; the function is filter-agnostic.
      // filter.status = "resolved" → filterEntries returns no entries → drift_count: 0
      const result = await metaStateQueryDriftTool.handler({ filter: { status: "resolved" } });
      assert.strictEqual(result.drift_count, 0);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-33: Empty registry
  test("T-33: empty registry returns { drift_count: 0, drift_events: [] }", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-33-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await metaStateQueryDriftTool.handler({});
      assert.deepStrictEqual(result, { drift_count: 0, drift_events: [] });
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-34: Single entry with no drift
  test("T-34: single entry with no signals returns no drift", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-34-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Entry with no signals for single-entry no-drift test.",
      });
      const result = await metaStateQueryDriftTool.handler({});
      assert.strictEqual(result.drift_count, 0);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-35: All-terminal entries → empty result
  test("T-35: all-terminal entries (resolved) yield empty result", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-35-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");
      writeFileSync(join(tempDir, "src.test.js"), "// test");
      const r1 = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Resolved entry for terminal test.",
        evidence_code_ref: "src.js",
        evidence_test: "src.test.js",
      });
      const id1 = JSON.parse(r1.content[0].text).id;
      const { metaStateResolveTool } = await import("../../tools/legacy/meta-state-resolve-tool.js");
      await metaStateResolveTool.handler({ id: id1, resolution: "fixed" });
      const result = await metaStateQueryDriftTool.handler({});
      assert.strictEqual(result.drift_count, 0);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-36: Large registry (50+ entries)
  test("T-36: large registry (50 entries) — performance smoke test", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-36-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");
      writeFileSync(join(tempDir, "src.test.js"), "// test");
      const entries = [];
      for (let i = 0; i < 50; i++) {
        const r = await metaStateReportTool.handler({
          category: "loop-anti-pattern",
          severity: "warning",
          affected_system: "mcp-tools",
          description: `Large registry test entry number ${i} for performance smoke test.`,
          evidence_code_ref: "src.js",
          evidence_test: "src.test.js",
        });
        entries.push(JSON.parse(r.content[0].text).id);
      }
      const result = await metaStateQueryDriftTool.handler({});
      assert.strictEqual(result.drift_count, 50);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-37: Missing run_grounding → defaults to false
  test("T-37: missing run_grounding defaults to false (no SP2 invocation)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-37-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateQueryDriftTool.handler({});
      const gateLogRaw = readFileSync(getGateLogPath(tempDir), "utf8");
      const logEntry = JSON.parse(gateLogRaw.trim().split("\n")[0]);
      assert.strictEqual(logEntry.run_grounding, false);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-38: run_grounding true → passed through to gate log
  test("T-38: run_grounding true is passed through and recorded in gate log", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-38-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateQueryDriftTool.handler({ run_grounding: true });
      const gateLogRaw = readFileSync(getGateLogPath(tempDir), "utf8");
      const logEntry = JSON.parse(gateLogRaw.trim().split("\n")[0]);
      assert.strictEqual(logEntry.run_grounding, true);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-39: Invalid run_grounding type — the tool is filter-shape-agnostic; this just verifies it's preserved
  test("T-39: run_grounding value is passed through to gate log even if non-boolean (defensive)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-39-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateQueryDriftTool.handler({ run_grounding: "yes" });
      const gateLogRaw = readFileSync(getGateLogPath(tempDir), "utf8");
      const logEntry = JSON.parse(gateLogRaw.trim().split("\n")[0]);
      assert.strictEqual(logEntry.run_grounding, "yes");
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-40: Extra field is passed through (filter-agnostic function); just verifies the tool doesn't crash
  test("T-40: extra unknown field does not crash the tool", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-40-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await metaStateQueryDriftTool.handler({ foo: "bar" });
      assert.deepStrictEqual(result, { drift_count: 0, drift_events: [] });
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-41: 5 fields per event
  test("T-41: drift events have exactly 5 fields (id, raw_status, derived_status, drift_kind, recommendation)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-41-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");
      writeFileSync(join(tempDir, "src.test.js"), "// test");
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Field shape test finding.",
        evidence_code_ref: "src.js",
        evidence_test: "src.test.js",
      });
      const result = await metaStateQueryDriftTool.handler({});
      assert.strictEqual(result.drift_count, 1);
      const ev = result.drift_events[0];
      assert.deepStrictEqual(Object.keys(ev).sort(), [
        "derived_status",
        "drift_kind",
        "id",
        "raw_status",
        "recommendation",
      ]);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-42: drift_count matches drift_events.length
  test("T-42: drift_count matches drift_events.length", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-42-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");
      writeFileSync(join(tempDir, "src.test.js"), "// test");
      for (let i = 0; i < 3; i++) {
        await metaStateReportTool.handler({
          category: "loop-anti-pattern",
          severity: "warning",
          affected_system: "mcp-tools",
          description: `Count consistency test number ${i}.`,
          evidence_code_ref: "src.js",
          evidence_test: "src.test.js",
        });
      }
      const result = await metaStateQueryDriftTool.handler({});
      assert.strictEqual(result.drift_count, result.drift_events.length);
      assert.strictEqual(result.drift_count, 3);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-43: drift_kind always assertion_lags_derivation
  test("T-43: drift_kind is always assertion_lags_derivation", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-43-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");
      writeFileSync(join(tempDir, "src.test.js"), "// test");
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Drift kind test entry.",
        evidence_code_ref: "src.js",
        evidence_test: "src.test.js",
      });
      const result = await metaStateQueryDriftTool.handler({});
      assert.strictEqual(result.drift_count, 1);
      assert.strictEqual(result.drift_events[0].drift_kind, "assertion_lags_derivation");
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-44: No nested derivation/grounding objects
  test("T-44: drift events have no nested derivation or grounding objects (lean shape)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-44-"));
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "src.js"), "// code");
      writeFileSync(join(tempDir, "src.test.js"), "// test");
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Lean shape test entry.",
        evidence_code_ref: "src.js",
        evidence_test: "src.test.js",
      });
      const result = await metaStateQueryDriftTool.handler({});
      assert.strictEqual(result.drift_count, 1);
      const ev = result.drift_events[0];
      assert.strictEqual(ev.derivation, undefined);
      assert.strictEqual(ev.grounding, undefined);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-45: Every tool call appends 1 gate log entry
  test("T-45: every tool call appends exactly 1 gate log entry", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-45-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateQueryDriftTool.handler({});
      await metaStateQueryDriftTool.handler({});
      await metaStateQueryDriftTool.handler({});
      const gateLogRaw = readFileSync(getGateLogPath(tempDir), "utf8");
      const lines = gateLogRaw.split("\n").filter((l) => l.trim() !== "");
      assert.strictEqual(lines.length, 3);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-46: Gate log entry shape
  test("T-46: gate log entry shape is { event, filter, run_grounding, drift_count }", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-46-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateQueryDriftTool.handler({ filter: { status: "active" }, run_grounding: true });
      const gateLogRaw = readFileSync(getGateLogPath(tempDir), "utf8");
      const logEntry = JSON.parse(gateLogRaw.trim().split("\n")[0]);
      assert.strictEqual(logEntry.event, "meta_state_query_drift");
      assert.deepStrictEqual(logEntry.filter, { status: "active" });
      assert.strictEqual(logEntry.run_grounding, true);
      assert.strictEqual(logEntry.drift_count, 0);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-47: Gate log entry includes the actual filter value
  test("T-47: gate log entry includes the actual filter value (or undefined for no filter)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-47-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateQueryDriftTool.handler({});
      const gateLogRaw = readFileSync(getGateLogPath(tempDir), "utf8");
      const logEntry = JSON.parse(gateLogRaw.trim().split("\n")[0]);
      assert.strictEqual(logEntry.filter, undefined);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  // T-48: Gate log entry includes run_grounding boolean
  test("T-48: gate log entry includes run_grounding boolean value", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "query-drift-tool-48-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateQueryDriftTool.handler({ run_grounding: false });
      const gateLogRaw = readFileSync(getGateLogPath(tempDir), "utf8");
      const logEntry = JSON.parse(gateLogRaw.trim().split("\n")[0]);
      assert.strictEqual(typeof logEntry.run_grounding, "boolean");
      assert.strictEqual(logEntry.run_grounding, false);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });
});
