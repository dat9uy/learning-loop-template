import { describe, test } from "node:test";
import assert from "node:assert";
import { metaStateSweepTool } from "../../tools/legacy/meta-state-sweep-tool.js";
import { metaStateReportTool } from "../../tools/legacy/meta-state-report-tool.js";
import { metaStateResolveTool } from "../../tools/legacy/meta-state-resolve-tool.js";
import { readRegistry, updateEntry } from "../../core/meta-state.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Plan 260707-0812 Phase 3: sweep is read-only (no apply mode, no session-mode
// gate). The previous apply:true tests are gone; the remaining tests assert the
// read-only contract, the no-mutation invariant, and the terminal-skip behavior.

describe("meta_state_sweep (read-only, Phase 3)", () => {
  const originalEnv = process.env.GATE_ROOT;

  test("returns the derived stale set + dry-run flag, no registry mutation", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-dry-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "A reported entry for sweep testing",
      });
      const id = JSON.parse(report.content[0].text).id;

      // Backdate `created_at` so isStaleView returns true (the entry's age > window).
      const entries = readRegistry(tempDir);
      const entry = entries.find((e) => e.id === id);
      entry.created_at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      await updateEntry(tempDir, id, { created_at: entry.created_at });

      const sweepResult = await metaStateSweepTool.handler({});
      const text = JSON.parse(sweepResult.content[0].text);

      assert.strictEqual(text.swept, false, "swept stays false (read-only)");
      assert.strictEqual(text.dry_run, true);
      assert.strictEqual(text.read_only, true);
      assert.ok(text.stale_view_count >= 1, "stale_view_count reflects derived view");

      // Registry unchanged (entry still `open`)
      const after = readRegistry(tempDir);
      assert.strictEqual(after.find((e) => e.id === id).status, "open", "sweep must not mutate");
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

  test("empty registry returns empty derived stale set", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-empty-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await metaStateSweepTool.handler({});
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.swept, false);
      assert.strictEqual(text.dry_run, true);
      assert.strictEqual(text.stale_view_count, 0);
      assert.deepStrictEqual(text.findings, []);
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

  test("terminal entries are skipped (resolved/superseded/archived)", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "meta-sweep-term-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const report = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Terminal entry should not appear in stale view",
      });
      const id = JSON.parse(report.content[0].text).id;

      // Resolve to make the entry terminal
      await metaStateResolveTool.handler({ id, resolution: "test terminal" });

      // Backdate created_at — terminal entries are still excluded
      const entries = readRegistry(tempDir);
      const entry = entries.find((e) => e.id === id);
      entry.created_at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      await updateEntry(tempDir, id, { created_at: entry.created_at });

      const result = await metaStateSweepTool.handler({});
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.stale_view_count, 0, "resolved entry must not be in stale view");
      assert.deepStrictEqual(text.findings, []);
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