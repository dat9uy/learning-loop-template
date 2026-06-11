import { describe, test } from "node:test";
import assert from "node:assert";
import { metaStateReportTool } from "../tools/meta-state-report-tool.js";
import { metaStateListTool } from "../tools/meta-state-list-tool.js";
import { metaStateAckTool } from "../tools/meta-state-ack-tool.js";
import { metaStateResolveTool } from "../tools/meta-state-resolve-tool.js";
import { readRegistry } from "../core/meta-state.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("meta-state end-to-end lifecycle", () => {
  let tempDir;
  const originalEnv = process.env.GATE_ROOT;

  test("report creates entry, list finds it, ack promotes, resolve terminates", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-e2e-"));
    process.env.GATE_ROOT = tempDir;
    try {
      // 1. Report
      const reportResult = await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Gate logic allows suspicious pattern through without matching",
        evidence_journal: "docs/journals/test.md",
      });
      const reportText = JSON.parse(reportResult.content[0].text);
      assert.strictEqual(reportText.reported, true);
      assert.strictEqual(reportText.status, "reported");
      assert.ok(reportText.id);
      assert.ok(reportText.expires_at);

      // 2. List default excludes nothing (reported is non-terminal)
      const listResult1 = await metaStateListTool.handler({});
      const listText1 = JSON.parse(listResult1.content[0].text);
      assert.strictEqual(listText1.count, 1);
      assert.strictEqual(listText1.entries[0].status, "reported");

      // 3. Ack
      const ackResult = await metaStateAckTool.handler({
        id: reportText.id,
        reason: "Confirmed by operator review",
      });
      const ackText = JSON.parse(ackResult.content[0].text);
      assert.strictEqual(ackText.acked, true);
      assert.strictEqual(ackText.status, "active");

      // 4. List sees active
      const listResult2 = await metaStateListTool.handler({});
      const listText2 = JSON.parse(listResult2.content[0].text);
      assert.strictEqual(listText2.count, 1);
      assert.strictEqual(listText2.entries[0].status, "active");
      assert.strictEqual(listText2.entries[0].expires_at, null);

      // 5. Resolve
      const resolveResult = await metaStateResolveTool.handler({
        id: reportText.id,
        resolution: "Fixed in PR #42",
        resolved_by: "operator",
      });
      const resolveText = JSON.parse(resolveResult.content[0].text);
      assert.strictEqual(resolveText.resolved, true);
      assert.strictEqual(resolveText.status, "resolved");

      // 6. List default excludes terminal
      const listResult3 = await metaStateListTool.handler({});
      const listText3 = JSON.parse(listResult3.content[0].text);
      assert.strictEqual(listText3.count, 0);

      // 7. List with status filter shows resolved (the include_expired param
      // was removed in plan 260611-1000-remove-expired-status phase 3; use
      // status filter to access terminal entries).
      const listResult4 = await metaStateListTool.handler({ status: "resolved" });
      const listText4 = JSON.parse(listResult4.content[0].text);
      assert.strictEqual(listText4.count, 1);
      assert.strictEqual(listText4.entries[0].status, "resolved");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("ack rejects already-active entry", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-ack-dup-"));
    process.env.GATE_ROOT = tempDir;

    const reportResult = await metaStateReportTool.handler({
      category: "stale-ref",
      severity: "escalate",
      affected_system: "mcp-tools",
      description: "MCP tool references a file that was deleted during refactoring",
    });
    const reportText = JSON.parse(reportResult.content[0].text);

    try {
      // First ack succeeds
      await metaStateAckTool.handler({ id: reportText.id });

      // Second ack fails
      const ack2 = await metaStateAckTool.handler({ id: reportText.id });
      const ack2Text = JSON.parse(ack2.content[0].text);
      assert.strictEqual(ack2Text.acked, false);
      assert.strictEqual(ack2Text.reason, "already_active_or_terminal");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("resolve rejects terminal entry", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-resolve-dup-"));
    process.env.GATE_ROOT = tempDir;

    const reportResult = await metaStateReportTool.handler({
      category: "mcp-tool-missing",
      severity: "warning",
      affected_system: "workflow-registry",
      description: "Workflow registry references a tool that was never registered in manifest",
    });
    const reportText = JSON.parse(reportResult.content[0].text);

    try {
      // Resolve once
      await metaStateResolveTool.handler({ id: reportText.id });

      // Resolve again fails
      const resolve2 = await metaStateResolveTool.handler({ id: reportText.id });
      const resolve2Text = JSON.parse(resolve2.content[0].text);
      assert.strictEqual(resolve2Text.resolved, false);
      assert.strictEqual(resolve2Text.reason, "already_terminal");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("list filters by category and status", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-filter-"));
    process.env.GATE_ROOT = tempDir;

    await metaStateReportTool.handler({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "First gate logic issue found during smoke test run",
    });
    await metaStateReportTool.handler({
      category: "schema-drift",
      severity: "warning",
      affected_system: "record-validation",
      description: "Schema drift in observation records after v2 migration",
    });
    const report3 = await metaStateReportTool.handler({
      category: "gate-logic-bug",
      severity: "escalate",
      affected_system: "gate-logic",
      description: "Second gate logic issue that causes silent bypass",
    });
    const report3Text = JSON.parse(report3.content[0].text);

    try {
      await metaStateAckTool.handler({ id: report3Text.id });

      // Filter by category
      const catResult = await metaStateListTool.handler({ category: "gate-logic-bug" });
      const catText = JSON.parse(catResult.content[0].text);
      assert.strictEqual(catText.count, 2);

      // Filter by status
      const statResult = await metaStateListTool.handler({ status: "active" });
      const statText = JSON.parse(statResult.content[0].text);
      assert.strictEqual(statText.count, 1);
      assert.strictEqual(statText.entries[0].status, "active");

      // Filter by both
      const bothResult = await metaStateListTool.handler({
        category: "gate-logic-bug",
        status: "reported",
      });
      const bothText = JSON.parse(bothResult.content[0].text);
      assert.strictEqual(bothText.count, 1);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("budget-check category and vnstock_vendor affected_system accepted", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-budget-"));
    process.env.GATE_ROOT = tempDir;

    const reportResult = await metaStateReportTool.handler({
      category: "budget-check",
      severity: "warning",
      affected_system: "vnstock_vendor",
      description: "Agent checked budget before vendor-api curl. Budget 1/1, fingerprint matches, proceeding.",
      evidence_code_ref: "records/observations/observation-vnstock-resource-budget.yaml",
    });
    const reportText = JSON.parse(reportResult.content[0].text);

    try {
      assert.strictEqual(reportText.reported, true);
      assert.ok(reportText.id);

      // Filter by budget-check category
      const listResult = await metaStateListTool.handler({ category: "budget-check" });
      const listText = JSON.parse(listResult.content[0].text);
      assert.strictEqual(listText.count, 1);
      assert.strictEqual(listText.entries[0].category, "budget-check");
      assert.strictEqual(listText.entries[0].affected_system, "vnstock_vendor");
      assert.strictEqual(listText.entries[0].status, "reported");
      assert.ok(listText.entries[0].id.startsWith("meta-"));
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });
});
