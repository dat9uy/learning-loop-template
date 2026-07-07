import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { metaStateSweepTool } from "../../tools/legacy/meta-state-sweep-tool.js";
import { metaStateReportTool } from "../../tools/legacy/meta-state-report-tool.js";
import { readRegistry, updateEntry } from "../../core/meta-state.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Plan 260707-0812 Phase 3: sweep is read-only (no apply mode). The previous
// tests in this file exercised the stale transition write paths that the
// read-only rework removed. The new tests assert the derived-stale view
// surfaces eligible entries and that the registry is never mutated by sweep.

describe("meta_state_sweep (read-only, Phase 3)", () => {
  const originalEnv = process.env.GATE_ROOT;

  test("S1: derived stale view surfaces an open entry past the staleness window", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-stale-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "A reported entry that should surface in the derived stale view",
      });
      const id = JSON.parse(report.content[0].text).id;

      // Backdate created_at so isStaleView returns true.
      const entries = readRegistry(tempDir);
      const entry = entries.find((e) => e.id === id);
      entry.created_at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      await updateEntry(tempDir, id, { created_at: entry.created_at });

      const sweepResult = await metaStateSweepTool.handler({});
      const text = JSON.parse(sweepResult.content[0].text);

      assert.strictEqual(text.swept, false);
      assert.strictEqual(text.dry_run, true);
      assert.strictEqual(text.read_only, true);
      assert.ok(text.stale_view_count >= 1, "stale_view_count must reflect derived view");
      assert.ok(text.findings.some((f) => f.id === id), "the backdated entry must surface");

      // Registry unchanged
      const after = readRegistry(tempDir);
      const updated = after.find((e) => e.id === id);
      assert.strictEqual(updated.status, "open", "sweep must not transition status");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("S2: dry-run is idempotent — calling sweep twice surfaces the same set", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-idem-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Idempotent sweep surface test",
      });
      const id = JSON.parse(report.content[0].text).id;

      const entries = readRegistry(tempDir);
      const entry = entries.find((e) => e.id === id);
      entry.created_at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      await updateEntry(tempDir, id, { created_at: entry.created_at });

      const r1 = await metaStateSweepTool.handler({});
      const r2 = await metaStateSweepTool.handler({});
      const t1 = JSON.parse(r1.content[0].text);
      const t2 = JSON.parse(r2.content[0].text);

      assert.strictEqual(t1.stale_view_count, t2.stale_view_count, "sweep must be idempotent");
      assert.deepStrictEqual(
        t1.findings.map((f) => f.id).sort(),
        t2.findings.map((f) => f.id).sort(),
        "sweep must surface the same ids on repeat"
      );
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("F1: stale-view entries do NOT emit stale-ref follow-ups", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-follow-up-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "An entry to verify sweep no longer emits stale-ref follow-ups",
      });
      const originalId = JSON.parse(report.content[0].text).id;

      const entries = readRegistry(tempDir);
      const entry = entries.find((e) => e.id === originalId);
      entry.created_at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      await updateEntry(tempDir, originalId, { created_at: entry.created_at });

      await metaStateSweepTool.handler({});

      // No follow-up entry exists in the registry re-opening the original.
      const after = readRegistry(tempDir);
      const followUps = after.filter((e) => e.reopens?.includes(originalId));
      assert.deepStrictEqual(followUps, [], `registry must not contain stale-ref follow-ups re-opening ${originalId}`);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("F3: sweep surfaces multiple stale-view entries in one call (no transitions)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-resilient-"));
    process.env.GATE_ROOT = tempDir;
    try {
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

      for (const id of ids) {
        const entries = readRegistry(tempDir);
        const entry = entries.find((e) => e.id === id);
        entry.created_at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
        await updateEntry(tempDir, id, { created_at: entry.created_at });
      }

      const text = JSON.parse((await metaStateSweepTool.handler({})).content[0].text);
      assert.strictEqual(text.swept, false);
      assert.ok(text.stale_view_count >= 3, "all 3 backdated entries should surface");

      // All originals stay `open` (sweep is read-only)
      const after = readRegistry(tempDir);
      for (const id of ids) {
        const original = after.find((e) => e.id === id);
        assert.strictEqual(original.status, "open", "sweep must not write status");
      }
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });
});