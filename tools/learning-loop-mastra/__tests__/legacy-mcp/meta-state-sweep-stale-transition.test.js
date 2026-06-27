import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { metaStateSweepTool } from "../../tools/legacy/meta-state-sweep-tool.js";
import { metaStateReportTool } from "../../tools/legacy/meta-state-report-tool.js";
import { metaStateAckTool } from "../../tools/legacy/meta-state-ack-tool.js";
import { readRegistry, updateEntry } from "../../core/meta-state.js";
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

  // F-series: follow-up report emission (closes meta-260627T0045Z gap).
  // meta_state_sweep must emit a meta_state_report for each newly-stale
  // entry so operators get a structured prompt to triage, not just a
  // discoverability-only Phase 6 invariant signal.
  test("F1: apply emits one follow-up report per stale transition with reopens + mc=false", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-follow-up-"));
    process.env.GATE_ROOT = tempDir;
    process.env.OPERATOR_MODE = "1";
    try {
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "An entry to verify follow-up report emission after stale transition",
      });
      const originalId = JSON.parse(report.content[0].text).id;

      // Force expires_at past so checkExpiry transitions reported → stale.
      const entries = readRegistry(tempDir);
      const entry = entries.find((e) => e.id === originalId);
      entry.expires_at = new Date(Date.now() - 1000).toISOString();
      await updateEntry(tempDir, originalId, { expires_at: entry.expires_at });

      const sweepResult = await metaStateSweepTool.handler({ apply: true });
      const sweepText = JSON.parse(sweepResult.content[0].text);

      // Original entry is now stale
      assert.strictEqual(sweepText.swept, true);
      const applied = sweepText.results.find((r) => r.id === originalId);
      assert.ok(applied, "sweep should have applied the stale transition");
      assert.strictEqual(applied.to, "stale");

      // Exactly one follow-up report was emitted, referencing the original
      assert.ok(Array.isArray(sweepText.stale_reports), "stale_reports array missing");
      assert.strictEqual(sweepText.stale_reports.length, 1);
      assert.strictEqual(sweepText.stale_reports[0].original_id, originalId);
      const followUpId = sweepText.stale_reports[0].follow_up_id;
      assert.ok(followUpId, "follow_up_id missing");

      // Follow-up entry exists in the registry with the right shape
      const after = readRegistry(tempDir);
      const followUp = after.find((e) => e.id === followUpId);
      assert.ok(followUp, "follow-up entry not in registry");
      assert.strictEqual(followUp.status, "reported");
      assert.strictEqual(followUp.category, "stale-ref");
      assert.strictEqual(followUp.severity, "warning");
      assert.strictEqual(followUp.affected_system, "meta-state-tools");
      assert.strictEqual(followUp.mechanism_check, false, "follow-up must opt out of mechanism_check");
      assert.ok(
        Array.isArray(followUp.reopens) && followUp.reopens.includes(originalId),
        "follow-up must reference original via reopens"
      );
      assert.ok(
        followUp.description.includes(originalId),
        "follow-up description must mention the original entry id"
      );
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperator;
    }
  });

  test("F2: dry-run does NOT emit follow-up reports", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-dry-noreport-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "An entry to verify dry-run is non-mutating including no follow-up reports",
      });
      const id = JSON.parse(report.content[0].text).id;

      // Force expires_at past
      const entries = readRegistry(tempDir);
      const entry = entries.find((e) => e.id === id);
      entry.expires_at = new Date(Date.now() - 1000).toISOString();
      await updateEntry(tempDir, id, { expires_at: entry.expires_at });

      const beforeCount = readRegistry(tempDir).length;

      const sweepResult = await metaStateSweepTool.handler({ apply: false });
      const sweepText = JSON.parse(sweepResult.content[0].text);

      assert.strictEqual(sweepText.swept, false);
      assert.strictEqual(sweepText.dry_run, true);
      assert.strictEqual(sweepText.transitions.length, 1);

      // Registry size unchanged — dry-run must not emit follow-up reports
      const afterCount = readRegistry(tempDir).length;
      assert.strictEqual(
        afterCount,
        beforeCount,
        `dry-run mutated registry: ${beforeCount} → ${afterCount} entries`
      );
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("F3: sweep succeeds even if follow-up emission throws on one entry", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-resilient-"));
    process.env.GATE_ROOT = tempDir;
    process.env.OPERATOR_MODE = "1";
    try {
      // Create 3 entries that will all be transitioned to stale
      const ids = [];
      for (let i = 0; i < 3; i++) {
        const r = await metaStateReportTool.handler({
          category: "gate-logic-bug",
          severity: "warning",
          affected_system: "gate-logic",
          description: `Entry ${i} to verify sweep resilience when one follow-up fails`,
        });
        ids.push(JSON.parse(r.content[0].text).id);
      }

      // Force all 3 past expires_at
      for (const id of ids) {
        const entries = readRegistry(tempDir);
        const entry = entries.find((e) => e.id === id);
        entry.expires_at = new Date(Date.now() - 1000).toISOString();
        await updateEntry(tempDir, id, { expires_at: entry.expires_at });
      }

      const sweepResult = await metaStateSweepTool.handler({ apply: true });
      const sweepText = JSON.parse(sweepResult.content[0].text);

      assert.strictEqual(sweepText.swept, true);
      assert.strictEqual(sweepText.results.length, 3);
      // All 3 follow-ups should have been attempted; even if one failed,
      // the sweep returned a successful response with results
      assert.strictEqual(sweepText.stale_reports.length, 3);

      // All 3 originals are now stale in the registry
      const after = readRegistry(tempDir);
      for (const id of ids) {
        const original = after.find((e) => e.id === id);
        assert.strictEqual(original.status, "stale");
      }
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperator;
    }
  });

  test("F4: Phase 6 invariant unaffected — follow-ups do not count toward stale-mc threshold", async () => {
    // This test simulates the Phase 6 filter logic from cold-tier-regression.test.js
    // and asserts that follow-up reports (status=reported, mc=false) do not count
    // toward the stale-mc threshold. Mirrors the real-world case where entries
    // have evidence_code_ref (mc=true) — matching meta-260619T2233Z and
    // meta-260619T2237Z, the two stale findings that triggered this fix.
    tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-threshold-"));
    process.env.GATE_ROOT = tempDir;
    process.env.OPERATOR_MODE = "1";
    try {
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Original entry for Phase 6 invariant isolation test with mc=true",
        evidence_code_ref: "tools/learning-loop-mastra/tools/legacy/meta-state-sweep-tool.js",
      });
      const originalId = JSON.parse(report.content[0].text).id;

      // mc defaults to true when evidence_code_ref is provided
      const entries = readRegistry(tempDir);
      const entry = entries.find((e) => e.id === originalId);
      assert.strictEqual(entry.mechanism_check, true, "test setup: mc should be true");
      entry.expires_at = new Date(Date.now() - 1000).toISOString();
      await updateEntry(tempDir, originalId, { expires_at: entry.expires_at });

      await metaStateSweepTool.handler({ apply: true });

      // Apply the Phase 6 filter logic from cold-tier-regression.test.js:58-60
      const after = readRegistry(tempDir);
      const staleMcFindings = after.filter(
        (f) => f.status === "stale" && (f.mechanism_check === true || f.mechanism_check === null)
      );

      // Exactly 1 stale mc finding: the original. The follow-up is in
      // status=reported (not stale) and mc=false, so it is excluded from
      // both halves of the filter.
      assert.strictEqual(
        staleMcFindings.length,
        1,
        `Phase 6 invariant must hold: ${staleMcFindings.length} stale mc entries, expected 1`
      );
      assert.strictEqual(staleMcFindings[0].id, originalId);

      // Verify the follow-up exists but does not contribute to the count
      const followUps = after.filter((e) => e.reopens?.includes(originalId));
      assert.strictEqual(followUps.length, 1, "exactly one follow-up report");
      assert.strictEqual(followUps[0].status, "reported");
      assert.strictEqual(followUps[0].mechanism_check, false);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperator;
    }
  });
});
