// Regression test for plan 260704-0301-stale-findings-dispatch-handle / Phase 1.
//
// `stale-ref` is no longer a recorded finding kind — it is a query output
// (the derived view in meta_state_relationships). meta_state_sweep must NOT
// emit a stale-ref follow-up when an entry transitions to stale. The
// follow-up used to materialize at meta-state-sweep-tool.js:94-108; that
// block is removed in Phase 1 step 2, and the test below is the gate.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { metaStateSweepTool } from "../../tools/legacy/meta-state-sweep-tool.js";
import { metaStateReportTool } from "../../tools/legacy/meta-state-report-tool.js";
import { readRegistry, updateEntry } from "../../core/meta-state.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("meta_state_sweep does not emit stale-ref follow-up (Phase 1 Rec 8 collapse)", () => {
  const originalEnv = process.env.GATE_ROOT;
  const originalOperator = process.env.OPERATOR_MODE;

  test("apply: zero stale-ref follow-ups emitted on stale transitions", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-no-stale-ref-"));
    process.env.GATE_ROOT = tempDir;
    process.env.OPERATOR_MODE = "1";
    try {
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "An entry for the no-stale-ref-follow-up regression test",
      });
      const id = JSON.parse(report.content[0].text).id;

      // Force expires_at past so checkExpiry transitions reported -> stale.
      const entries = readRegistry(tempDir);
      const entry = entries.find((e) => e.id === id);
      entry.expires_at = new Date(Date.now() - 1000).toISOString();
      await updateEntry(tempDir, id, { expires_at: entry.expires_at });

      const sweepResult = await metaStateSweepTool.handler({ apply: true });
      const sweepText = JSON.parse(sweepResult.content[0].text);

      // The original entry still transitions to stale (the transition itself
      // is preserved; only the follow-up is dropped).
      assert.strictEqual(sweepText.swept, true);
      const applied = sweepText.results.find((r) => r.id === id);
      assert.ok(applied, "sweep should have applied the stale transition");
      assert.strictEqual(applied.to, "stale");

      // The follow-up emission is the bit that's removed.
      assert.deepStrictEqual(
        sweepText.stale_reports ?? [],
        [],
        `sweep must not emit stale-ref follow-ups; got ${JSON.stringify(sweepText.stale_reports)}`
      );

      // No entry in the registry reopens the original (the stale-ref follow-up
      // shape was: reopens=[original], category=stale-ref, mc=false). The
      // category enum is also being removed in Phase 1, so this assertion is
      // a forward-looking shape guard.
      const after = readRegistry(tempDir);
      const followUps = after.filter((e) => e.reopens?.includes(id));
      assert.deepStrictEqual(
        followUps,
        [],
        `registry must not contain stale-ref follow-ups re-opening ${id}; got ${followUps.map((f) => f.id).join(", ")}`
      );
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperator;
    }
  });

  test("dry-run: no stale-ref follow-ups and no registry mutations", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-no-stale-ref-dry-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "An entry for the no-stale-ref-follow-up dry-run regression test",
      });
      const id = JSON.parse(report.content[0].text).id;

      const entries = readRegistry(tempDir);
      const entry = entries.find((e) => e.id === id);
      entry.expires_at = new Date(Date.now() - 1000).toISOString();
      await updateEntry(tempDir, id, { expires_at: entry.expires_at });

      const beforeCount = readRegistry(tempDir).length;
      const sweepResult = await metaStateSweepTool.handler({ apply: false });
      const sweepText = JSON.parse(sweepResult.content[0].text);

      assert.strictEqual(sweepText.swept, false);
      assert.strictEqual(sweepText.dry_run, true);
      assert.deepStrictEqual(sweepText.stale_reports ?? [], []);

      const afterCount = readRegistry(tempDir).length;
      assert.strictEqual(afterCount, beforeCount, "dry-run must not mutate registry");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });
});
