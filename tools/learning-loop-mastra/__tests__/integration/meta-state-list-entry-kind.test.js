import { describe, test } from "vitest";
import assert from "node:assert";
import { metaStateListTool } from "../../tools/handlers/meta-state-list-tool.js";
import { metaStateLogChangeTool } from "../../tools/handlers/meta-state-log-change-tool.js";
import { metaStateReportTool } from "../../tools/handlers/meta-state-report-tool.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("meta_state_list entry_kind filter", () => {
  let tempDir;
  const originalEnv = process.env.GATE_ROOT;

  async function seedFinding() {
    await metaStateReportTool.handler({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Test finding entry for entry_kind filter validation.",
    });
  }

  async function seedChangeLog() {
    await metaStateLogChangeTool.handler({
      change_dimension: "surface",
      change_target: "tools/meta-state-list-tool.js",
      change_diff: { added: ["entry_kind filter"], removed: [], changed: [] },
      reason: "The list tool now supports filtering by entry_kind.",
    });
  }

  test("default meta_state_list returns both kinds", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-list-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await seedFinding();
      await seedChangeLog();
      const result = await metaStateListTool.handler({});
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.count, 2);
      const kinds = text.entries.map((e) => e.entry_kind);
      assert.ok(kinds.includes("finding"));
      assert.ok(kinds.includes("change-log"));
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

  test("meta_state_list({ entry_kind: finding }) returns only findings", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-list-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await seedFinding();
      await seedChangeLog();
      const result = await metaStateListTool.handler({ entry_kind: "finding" });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.count, 1);
      assert.strictEqual(text.entries[0].entry_kind, "finding");
      assert.strictEqual(text.entry_kind_filter, "finding");
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

  test("meta_state_list({ entry_kind: change-log }) returns only change-log entries", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-list-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await seedFinding();
      await seedChangeLog();
      const result = await metaStateListTool.handler({ entry_kind: "change-log" });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.count, 1);
      assert.strictEqual(text.entries[0].entry_kind, "change-log");
      assert.strictEqual(text.entry_kind_filter, "change-log");
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

  test("meta_state_list with entry_kind filter still excludes terminal findings", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-list-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Test finding entry that is reported and not terminal.",
      });
      await metaStateReportTool.handler({
        category: "schema-drift",
        severity: "warning",
        affected_system: "record-validation",
        description: "Test finding entry that will be marked auto-resolved.",
      });
      await seedChangeLog();

      // Manually resolve the second finding to make it terminal
      const { updateEntry, readRegistry } = await import("../../core/meta-state.js");
      const entries = readRegistry(tempDir);
      const resolvedEntry = entries.find((e) => e.category === "schema-drift");
      await updateEntry(tempDir, resolvedEntry.id, { status: "resolved", resolved_at: new Date().toISOString(), resolved_by: "operator" });

      const result = await metaStateListTool.handler({ entry_kind: "finding" });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.count, 1);
      assert.strictEqual(text.entries[0].entry_kind, "finding");
      assert.strictEqual(text.entries[0].status, "open");
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
