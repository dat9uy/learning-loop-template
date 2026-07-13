// Regression test for plan 260707-0812 Phase 3 (sweep read-only) +
// plan 260704-0301 Rec 8 collapse (stale-ref follow-up emission removed).
//
// `stale-ref` is no longer a recorded finding kind — it is a query output
// (the derived view in meta_state_relationships). meta_state_sweep must NOT
// emit a stale-ref follow-up. Sweep is now read-only (no apply mode); the
// only path it can take is the dry-run report.

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { metaStateSweepTool } from "../../tools/handlers/meta-state-sweep-tool.js";
import { metaStateReportTool } from "../../tools/handlers/meta-state-report-tool.js";
import { readRegistry, updateEntry } from "../../core/meta-state.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("meta_state_sweep does not emit stale-ref follow-up (Phase 3 read-only)", () => {
  const originalEnv = process.env.GATE_ROOT;

  test("read-only: surfaces derived stale-view, zero follow-ups in registry", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-no-stale-ref-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "An entry for the no-stale-ref-follow-up regression test",
      });
      const id = JSON.parse(report.content[0].text).id;

      // Backdate created_at so isStaleView returns true.
      const entries = readRegistry(tempDir);
      const entry = entries.find((e) => e.id === id);
      entry.created_at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      await updateEntry(tempDir, id, { created_at: entry.created_at });

      const sweepResult = await metaStateSweepTool.handler({});
      const sweepText = JSON.parse(sweepResult.content[0].text);

      // Phase 3: sweep is read-only — swept=false, dry_run=true, read_only=true.
      assert.strictEqual(sweepText.swept, false);
      assert.strictEqual(sweepText.dry_run, true);
      assert.strictEqual(sweepText.read_only, true);
      assert.ok(sweepText.stale_view_count >= 1, "backdated entry should surface in derived view");

      // No entry in the registry reopens the original (stale-ref follow-up shape).
      const after = readRegistry(tempDir);
      const followUps = after.filter((e) => e.reopens?.includes(id));
      assert.deepStrictEqual(
        followUps,
        [],
        `registry must not contain stale-ref follow-ups re-opening ${id}; got ${followUps.map((f) => f.id).join(", ")}`
      );
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        if (originalEnv === undefined) {
          delete process.env.GATE_ROOT;
        } else {
          process.env.GATE_ROOT = originalEnv;
        }
      }
    }
  });

  test("dry-run: registry size unchanged after a sweep call", async () => {
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
      entry.created_at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      await updateEntry(tempDir, id, { created_at: entry.created_at });

      const beforeCount = readRegistry(tempDir).length;
      const sweepResult = await metaStateSweepTool.handler({});
      const sweepText = JSON.parse(sweepResult.content[0].text);

      assert.strictEqual(sweepText.swept, false);
      assert.strictEqual(sweepText.dry_run, true);
      assert.deepStrictEqual(sweepText.stale_reports ?? [], []);

      const afterCount = readRegistry(tempDir).length;
      assert.strictEqual(afterCount, beforeCount, "dry-run must not mutate registry");
    } finally {
      if (originalEnv === undefined) {
        delete process.env.GATE_ROOT;
      } else {
        if (originalEnv === undefined) {
          delete process.env.GATE_ROOT;
        } else {
          process.env.GATE_ROOT = originalEnv;
        }
      }
    }
  });
});