import { describe, test } from "node:test";
import assert from "node:assert";
import { metaStateSweepTool } from "../tools/meta-state-sweep-tool.js";
import { metaStateReportTool } from "../tools/meta-state-report-tool.js";
import { metaStateAckTool } from "../tools/meta-state-ack-tool.js";
import { readRegistry, updateEntry } from "../core/meta-state.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("meta_state_sweep", () => {
  let tempDir;
  const originalEnv = process.env.GATE_ROOT;
  const originalOperator = process.env.OPERATOR_MODE;

  test("dry-run returns proposed transitions without mutating registry", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-dry-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "A reported entry that is about to expire for sweep testing",
      });
      const id = JSON.parse(report.content[0].text).id;

      // Force expires_at to the past
      const entries = readRegistry(tempDir);
      const entry = entries.find((e) => e.id === id);
      entry.expires_at = new Date(Date.now() - 1000).toISOString();
      await updateEntry(tempDir, id, { expires_at: entry.expires_at });

      const sweepResult = await metaStateSweepTool.handler({ apply: false });
      const sweepText = JSON.parse(sweepResult.content[0].text);

      assert.strictEqual(sweepText.swept, false);
      assert.strictEqual(sweepText.dry_run, true);
      assert.strictEqual(sweepText.transitions.length, 1);
      assert.strictEqual(sweepText.transitions[0].to, "stale");

      // Verify registry unchanged
      const after = readRegistry(tempDir);
      assert.strictEqual(after.find((e) => e.id === id).status, "reported");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("apply expires past-due entries with operator role", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-apply-"));
    process.env.GATE_ROOT = tempDir;
    process.env.OPERATOR_MODE = "1";
    try {
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "A reported entry that is about to expire for sweep apply testing",
      });
      const id = JSON.parse(report.content[0].text).id;

      const entries = readRegistry(tempDir);
      const entry = entries.find((e) => e.id === id);
      entry.expires_at = new Date(Date.now() - 1000).toISOString();
      await updateEntry(tempDir, id, { expires_at: entry.expires_at });

      const sweepResult = await metaStateSweepTool.handler({ apply: true });
      const sweepText = JSON.parse(sweepResult.content[0].text);

      assert.strictEqual(sweepText.swept, true);
      assert.strictEqual(sweepText.results.length, 1);
      assert.strictEqual(sweepText.results[0].applied, true);
      assert.strictEqual(sweepText.results[0].to, "stale");

      const after = readRegistry(tempDir);
      assert.strictEqual(after.find((e) => e.id === id).status, "stale");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperator;
    }
  });

  test("apply without operator role is rejected", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-role-"));
    process.env.GATE_ROOT = tempDir;
    process.env.OPERATOR_MODE = "0";
    try {
      const result = await metaStateSweepTool.handler({ apply: true });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.swept, false);
      assert.strictEqual(text.reason, "operator_role_required");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperator;
    }
  });

  test("empty registry returns no transitions", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-empty-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await metaStateSweepTool.handler({ apply: false });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.swept, false);
      assert.strictEqual(text.dry_run, true);
      assert.deepStrictEqual(text.transitions, []);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("terminal entries are skipped", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-term-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Terminal entry should not be swept",
      });
      const id = JSON.parse(report.content[0].text).id;

      // Ack then resolve to make terminal
      await metaStateAckTool.handler({ id, reason: "ack" });
      const entries = readRegistry(tempDir);
      const entry = entries.find((e) => e.id === id);
      entry.expires_at = new Date(Date.now() - 1000).toISOString();
      await updateEntry(tempDir, id, { expires_at: entry.expires_at, status: "resolved" });

      const result = await metaStateSweepTool.handler({ apply: false });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.transitions.length, 0);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("CAS mismatch returns version_mismatch via concurrent sweeps", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-cas-"));
    process.env.GATE_ROOT = tempDir;
    process.env.OPERATOR_MODE = "1";
    try {
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "CAS mismatch test entry",
      });
      const id = JSON.parse(report.content[0].text).id;

      const entries = readRegistry(tempDir);
      const entry = entries.find((e) => e.id === id);
      entry.expires_at = new Date(Date.now() - 1000).toISOString();
      await updateEntry(tempDir, id, { expires_at: entry.expires_at });

      // Two concurrent sweeps: first wins, second gets CAS mismatch
      const [r1, r2] = await Promise.all([
        metaStateSweepTool.handler({ apply: true }),
        metaStateSweepTool.handler({ apply: true }),
      ]);
      const t1 = JSON.parse(r1.content[0].text);
      const t2 = JSON.parse(r2.content[0].text);

      // One should succeed, one should fail with version_mismatch
      const allResults = [...t1.results, ...t2.results];
      const success = allResults.find((r) => r.id === id && r.applied === true);
      const mismatch = allResults.find((r) => r.id === id && r.reason === "version_mismatch");
      assert.ok(success, "One concurrent sweep should succeed");
      assert.ok(mismatch, "The other concurrent sweep should get version_mismatch");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperator;
    }
  });

  test("sweep is idempotent on re-run after apply", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-idem-"));
    process.env.GATE_ROOT = tempDir;
    process.env.OPERATOR_MODE = "1";
    try {
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Idempotent sweep test entry",
      });
      const id = JSON.parse(report.content[0].text).id;

      const entries = readRegistry(tempDir);
      const entry = entries.find((e) => e.id === id);
      entry.expires_at = new Date(Date.now() - 1000).toISOString();
      await updateEntry(tempDir, id, { expires_at: entry.expires_at });

      // First apply
      const r1 = await metaStateSweepTool.handler({ apply: true });
      const t1 = JSON.parse(r1.content[0].text);
      assert.strictEqual(t1.results.length, 1);

      // Second apply — nothing left to sweep
      const r2 = await metaStateSweepTool.handler({ apply: true });
      const t2 = JSON.parse(r2.content[0].text);
      assert.strictEqual(t2.results.length, 0);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperator;
    }
  });
});
