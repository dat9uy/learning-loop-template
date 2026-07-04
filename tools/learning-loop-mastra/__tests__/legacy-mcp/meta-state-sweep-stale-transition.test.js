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
  // Phase 1 (Rec 8 collapse, plan 260704-0301-stale-findings-dispatch-handle)
  // REMOVED the stale-ref follow-up emission block from meta-state-sweep-tool.js
  // at :94-108 (now :60-95). The follow-up is replaced by the derived view in
  // meta_state_relationships + the Rec 10 surfacing in Phase 3. The F-series
  // now asserts the absence of follow-up emission (the producer is gone).
  test("F1: apply does NOT emit stale-ref follow-up; original is transitioned to stale", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-follow-up-"));
    process.env.GATE_ROOT = tempDir;
    process.env.OPERATOR_MODE = "1";
    try {
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "An entry to verify sweep no longer emits stale-ref follow-ups",
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

      // Phase 1: stale_reports is removed from the response (producer gone).
      assert.deepStrictEqual(
        sweepText.stale_reports ?? [],
        [],
        `sweep must not emit stale-ref follow-ups; got ${JSON.stringify(sweepText.stale_reports)}`
      );

      // No follow-up entry exists in the registry re-opening the original.
      const after = readRegistry(tempDir);
      const followUps = after.filter((e) => e.reopens?.includes(originalId));
      assert.deepStrictEqual(followUps, [], `registry must not contain stale-ref follow-ups re-opening ${originalId}`);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperator;
    }
  });

  test("F2: dry-run does NOT mutate registry (no follow-up reports)", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-dry-noreport-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "An entry to verify dry-run is non-mutating",
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

      // Registry size unchanged — dry-run must not mutate registry
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

  test("F3: sweep applies all 3 stale transitions; zero stale_ref follow-ups emitted", async () => {
    // Phase 1 retarget: the assertion `sweepText.stale_reports.length === 3`
    // (old follow-up emission count) becomes `length === 0` (no follow-ups).
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
          description: `Entry ${i} for sweep resilience test`,
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
      // Phase 1: zero follow-ups emitted (the producer is gone).
      assert.deepStrictEqual(
        sweepText.stale_reports ?? [],
        [],
        `sweep must not emit stale-ref follow-ups; got ${JSON.stringify(sweepText.stale_reports)}`
      );

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

  test("F4: Phase 6 invariant — exactly 1 stale mc finding (original only)", async () => {
    // Phase 1 retarget: the assertion `followUps.length === 1` (old follow-up
    // count) becomes `followUps.length === 0` (no follow-ups). The Phase 6
    // mc threshold assertion itself is unchanged — the original entry still
    // counts as 1 stale mc finding.
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

      // Exactly 1 stale mc finding: the original. No follow-up emitted in
      // Phase 1, so the count is 1 either way.
      assert.strictEqual(
        staleMcFindings.length,
        1,
        `Phase 6 invariant must hold: ${staleMcFindings.length} stale mc entries, expected 1`
      );
      assert.strictEqual(staleMcFindings[0].id, originalId);

      // Phase 1: no follow-up exists.
      const followUps = after.filter((e) => e.reopens?.includes(originalId));
      assert.deepStrictEqual(followUps, [], `registry must not contain stale-ref follow-ups; got ${followUps.map((f) => f.id).join(", ")}`);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperator;
    }
  });
});
