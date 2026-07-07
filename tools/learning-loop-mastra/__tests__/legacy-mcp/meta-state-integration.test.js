// Integration test for plan 260707-0812 (lifecycle-status-stale-mechanism).
//
// Replaces the legacy ack-based integration scenarios. The lifecycle flow
// now goes: report → list (open) → resolve/supersede → list (filtered).
// `meta_state_ack` is removed in Phase 2; engagement signals flow through
// resolve/promote/supersede/dispatch/re-verify.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateReportTool } from "../../tools/legacy/meta-state-report-tool.js";
import { metaStateResolveTool } from "../../tools/legacy/meta-state-resolve-tool.js";
import { metaStateListTool } from "../../tools/legacy/meta-state-list-tool.js";

const originalEnv = process.env.GATE_ROOT;

function setup() {
  const tempDir = mkdtempSync(join(tmpdir(), "meta-state-integration-"));
  process.env.GATE_ROOT = tempDir;
  return tempDir;
}

function teardown() {
  process.env.GATE_ROOT = originalEnv;
}

test("full lifecycle: report → list (open) → resolve → list (terminal)", async () => {
  setup();
  try {
    // 1. Report — writes status:"open" (Phase 2 canonical)
    const reportResult = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "MCP tool references a file that was deleted during refactoring",
      evidence_journal: "docs/journals/test.md",
    });
    const reportText = JSON.parse(reportResult.content[0].text);
    assert.strictEqual(reportText.reported, true);
    assert.strictEqual(reportText.status, "open", "Phase 2: report writes open");
    assert.ok(reportText.id);

    // 2. List default includes the new open finding
    const listResult1 = await metaStateListTool.handler({});
    const listText1 = JSON.parse(listResult1.content[0].text);
    assert.strictEqual(listText1.count, 1);
    assert.strictEqual(listText1.entries[0].status, "open");

    // 3. Resolve
    const resolveResult = await metaStateResolveTool.handler({
      id: reportText.id,
      resolution: "Fixed in PR #42",
      resolved_by: "operator",
    });
    const resolveText = JSON.parse(resolveResult.content[0].text);
    assert.strictEqual(resolveText.resolved, true);
    assert.strictEqual(resolveText.status, "resolved");

    // 4. List default excludes terminal entries
    const listResult2 = await metaStateListTool.handler({});
    const listText2 = JSON.parse(listResult2.content[0].text);
    assert.strictEqual(listText2.count, 0);

    // 5. List with status filter shows resolved
    const listResult3 = await metaStateListTool.handler({ status: "resolved" });
    const listText3 = JSON.parse(listResult3.content[0].text);
    assert.strictEqual(listText3.count, 1);
    assert.strictEqual(listText3.entries[0].status, "resolved");
  } finally {
    teardown();
  }
});

test("resolve rejects already-terminal entry", async () => {
  setup();
  try {
    const reportResult = await metaStateReportTool.handler({
      category: "mcp-tool-missing",
      severity: "warning",
      affected_system: "workflow-registry",
      description: "Workflow registry references a tool that was never registered in manifest",
    });
    const reportText = JSON.parse(reportResult.content[0].text);

    await metaStateResolveTool.handler({ id: reportText.id });

    const resolve2 = await metaStateResolveTool.handler({ id: reportText.id });
    const resolve2Text = JSON.parse(resolve2.content[0].text);
    assert.strictEqual(resolve2Text.resolved, false);
    assert.strictEqual(resolve2Text.reason, "already_terminal");
  } finally {
    teardown();
  }
});

test("list filters by category and status", async () => {
  setup();
  try {
    await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "First finding in mcp-tools category for filter test",
    });
    await metaStateReportTool.handler({
      category: "schema-drift",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Second finding in gate-logic category for filter test",
    });

    const filterResult = await metaStateListTool.handler({
      category: "loop-anti-pattern",
      status: "open",
    });
    const filterText = JSON.parse(filterResult.content[0].text);
    assert.strictEqual(filterText.count, 1);
    assert.strictEqual(filterText.entries[0].category, "loop-anti-pattern");
    assert.strictEqual(filterText.entries[0].status, "open");
  } finally {
    teardown();
  }
});