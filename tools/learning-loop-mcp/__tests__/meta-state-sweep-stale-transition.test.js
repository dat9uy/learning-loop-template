import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { metaStateSweepTool } from "../tools/meta-state-sweep-tool.js";
import { metaStateReportTool } from "../tools/meta-state-report-tool.js";
import { metaStateAckTool } from "../tools/meta-state-ack-tool.js";
import { readRegistry, updateEntry } from "../core/meta-state.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("meta_state_sweep stale transitions", () => {
  let tempDir;
  const originalEnv = process.env.GATE_ROOT;
  const originalOperator = process.env.OPERATOR_MODE;
  const originalStalenessWindow = process.env.META_STATE_STALENESS_WINDOW_MS;

  test("S1: reported past expires_at -> stale (no resolved_at/resolved_by)", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-stale-"));
    process.env.GATE_ROOT = tempDir;
    process.env.OPERATOR_MODE = "1";
    try {
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "A reported entry past expires_at for stale transition testing",
      });
      const id = JSON.parse(report.content[0].text).id;

      const entries = readRegistry(tempDir);
      const entry = entries.find((e) => e.id === id);
      entry.expires_at = new Date(Date.now() - 1000).toISOString();
      await updateEntry(tempDir, id, { expires_at: entry.expires_at });

      const sweepResult = await metaStateSweepTool.handler({ apply: true });
      const sweepText = JSON.parse(sweepResult.content[0].text);

      assert.strictEqual(sweepText.swept, true);
      const applied = sweepText.results.find((r) => r.id === id);
      assert.ok(applied, "should have applied transition");
      assert.strictEqual(applied.to, "stale");

      const after = readRegistry(tempDir);
      const updated = after.find((e) => e.id === id);
      assert.strictEqual(updated.status, "stale");
      assert.ok(!updated.resolved_at, "stale should not stamp resolved_at");
      assert.ok(!updated.resolved_by, "stale should not stamp resolved_by");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperator;
    }
  });

  test("S2: active past STALENESS_WINDOW_MS -> stale", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-active-stale-"));
    process.env.GATE_ROOT = tempDir;
    process.env.OPERATOR_MODE = "1";
    process.env.META_STATE_STALENESS_WINDOW_MS = "10";
    try {
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "An active entry past staleness window for transition testing",
      });
      const id = JSON.parse(report.content[0].text).id;

      await metaStateAckTool.handler({ id, reason: "ack for test" });

      // Wait for staleness window to pass
      await new Promise((r) => setTimeout(r, 50));

      const sweepResult = await metaStateSweepTool.handler({ apply: true });
      const sweepText = JSON.parse(sweepResult.content[0].text);

      assert.strictEqual(sweepText.swept, true);
      const applied = sweepText.results.find((r) => r.id === id);
      assert.ok(applied, "should have applied transition");
      assert.strictEqual(applied.to, "stale");

      const after = readRegistry(tempDir);
      const updated = after.find((e) => e.id === id);
      assert.strictEqual(updated.status, "stale");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperator;
      process.env.META_STATE_STALENESS_WINDOW_MS = originalStalenessWindow;
    }
  });

  test("S3: re-run is idempotent (stale entries are not re-processed)", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-idem-stale-"));
    process.env.GATE_ROOT = tempDir;
    process.env.OPERATOR_MODE = "1";
    try {
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "An entry for idempotent stale sweep testing",
      });
      const id = JSON.parse(report.content[0].text).id;

      const entries = readRegistry(tempDir);
      const entry = entries.find((e) => e.id === id);
      entry.expires_at = new Date(Date.now() - 1000).toISOString();
      await updateEntry(tempDir, id, { expires_at: entry.expires_at });

      // First sweep
      const r1 = await metaStateSweepTool.handler({ apply: true });
      const t1 = JSON.parse(r1.content[0].text);
      assert.strictEqual(t1.results.length, 1);

      // Second sweep — stale is terminal for sweep, so 0 transitions
      const r2 = await metaStateSweepTool.handler({ apply: true });
      const t2 = JSON.parse(r2.content[0].text);
      assert.strictEqual(t2.results.length, 0);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperator;
    }
  });
});
