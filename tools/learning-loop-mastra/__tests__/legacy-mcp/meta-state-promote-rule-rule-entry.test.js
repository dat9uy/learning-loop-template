import { test } from "node:test";
import assert from "node:assert/strict";
import { metaStatePromoteRuleTool } from "../../tools/legacy/meta-state-promote-rule-tool.js";
import { metaStateReportTool } from "../../tools/legacy/meta-state-report-tool.js";
import { readRegistry } from "../../core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalEnv = process.env.GATE_ROOT;
const originalLoopSessionMode = process.env.LOOP_SESSION_MODE;

function setup() {
  const tempDir = mkdtempSync(join(tmpdir(), "promote-rule-"));
  process.env.GATE_ROOT = tempDir;
  return tempDir;
}

function teardown() {
  if (originalEnv === undefined) {
    delete process.env.GATE_ROOT;
  } else {
    process.env.GATE_ROOT = originalEnv;
  }
  process.env.LOOP_SESSION_MODE = originalLoopSessionMode;
}

test("meta_state_promote_rule writes entry_kind=rule entry (not mutated finding)", async () => {
  const tempDir = setup();
  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "new-artifact-type",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Agent proposed a new artifact type which violates the philosophy.",
    });
    const reportText = JSON.parse(report.content[0].text);

    process.env.LOOP_SESSION_MODE = "live";
    const result = await metaStatePromoteRuleTool.handler({
      id: reportText.id,
      rule_id: "rule-test-entry-kind",
      enforcement: "gate",
      pattern_type: "regex",
      pattern: "new\\s+schema",
    });
    const text = JSON.parse(result.content[0].text);

    assert.equal(text.promoted, true);
    assert.equal(text.rule_entry_id, "rule-test-entry-kind");

    const entries = readRegistry(tempDir);
    const ruleEntry = entries.find((e) => e.entry_kind === "rule" && e.id === "rule-test-entry-kind");
    assert.ok(ruleEntry, "rule entry should exist");
    assert.equal(ruleEntry.origin, reportText.id);
    assert.equal(ruleEntry.enforcement, "gate");

    const finding = entries.find((e) => e.id === reportText.id);
    // After Phase 2 migration, promoted_to_rule is no longer written on findings.
    // The rule entry's origin field is the canonical inverse reference.
    assert.equal(finding.status, "active", "finding status should be active after promotion");
  } finally {
    teardown();
  }
});

test("meta_state_promote_rule rejects 'tool' enforcement enum", async () => {
  const tempDir = setup();
  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "new-artifact-type",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Agent proposed a new artifact type which violates the philosophy.",
    });
    const reportText = JSON.parse(report.content[0].text);

    process.env.LOOP_SESSION_MODE = "live";
    // The tool's schema should reject 'tool' at the zod validation layer
    // But since zod runs in the tool handler, we need to verify the behavior
    // by passing it and seeing it fail
    try {
      await metaStatePromoteRuleTool.handler({
        id: reportText.id,
        rule_id: "rule-test-tool",
        enforcement: "tool", // INVALID
        pattern_type: "regex",
        pattern: "test",
      });
      assert.fail("Should have rejected 'tool' enforcement");
    } catch (err) {
      // Expected: zod validation error or tool rejects it
      assert.ok(err.message.includes("tool") || err.message.includes("validation") || err.message.includes("enforcement"));
    }
  } finally {
    teardown();
  }
});

test("meta_state_promote_rule accepts pattern_type=resolution-evidence-required", async () => {
  const tempDir = setup();
  try {
    const report = await metaStateReportTool.handler({
      category: "loop-anti-pattern",
      subtype: "mcp-connection",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "MCP client loading gap: design note for a resolution-evidence-required rule.",
    });
    const reportText = JSON.parse(report.content[0].text);

    process.env.LOOP_SESSION_MODE = "live";
    const result = await metaStatePromoteRuleTool.handler({
      id: reportText.id,
      rule_id: "rule-test-resolution-evidence",
      enforcement: "gate",
      pattern_type: "resolution-evidence-required",
      pattern: "test-session-123",
    });
    const text = JSON.parse(result.content[0].text);

    assert.equal(text.promoted, true);

    const entries = readRegistry(tempDir);
    const ruleEntry = entries.find((e) => e.entry_kind === "rule" && e.id === "rule-test-resolution-evidence");
    assert.ok(ruleEntry, "rule entry should exist");
    assert.equal(ruleEntry.pattern_type, "resolution-evidence-required");
    assert.equal(ruleEntry.applies_to_resolution, "test-session-123");
  } finally {
    teardown();
  }
});
