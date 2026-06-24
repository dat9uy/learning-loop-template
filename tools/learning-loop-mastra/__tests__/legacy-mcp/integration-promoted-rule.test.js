import { describe, test } from "node:test";
import assert from "node:assert";
import { metaStateReportTool } from "../../tools/legacy/meta-state-report-tool.js";
import { metaStatePromoteRuleTool } from "../../tools/legacy/meta-state-promote-rule-tool.js";
import { metaStateListTool } from "../../tools/legacy/meta-state-list-tool.js";
import { loopDescribeTool } from "../../tools/legacy/loop-describe-tool.js";
import { loadPromotedRules, applyPromotedRules } from "../../core/legacy/gate-logic.js";
import { readRegistry, updateEntry } from "../../core/legacy/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("integration: promoted rule end-to-end", () => {
  let tempDir;
  const originalEnv = process.env.GATE_ROOT;
  const originalOperatorMode = process.env.OPERATOR_MODE;

  test("migration idempotency: running twice produces same state", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "integration-migration-"));
    process.env.GATE_ROOT = tempDir;
    assert.strictEqual(resolveRoot(), tempDir);
    try {
      // Seed an entry
      await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Test entry for idempotency check with enough length",
      });

      // Manually migrate it
      const entries1 = readRegistry(tempDir);
      await updateEntry(tempDir, entries1[0].id, {
        category: "loop-anti-pattern",
        subtype: "gate-bug",
      });

      const afterFirst = readRegistry(tempDir);

      // Run same update again
      await updateEntry(tempDir, entries1[0].id, {
        category: "loop-anti-pattern",
        subtype: "gate-bug",
      });

      const afterSecond = readRegistry(tempDir);
      assert.deepStrictEqual(afterFirst[0].category, afterSecond[0].category);
      assert.deepStrictEqual(afterFirst[0].subtype, afterSecond[0].subtype);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperatorMode;
    }
  });

  test("gate escalates on command matching promoted rule", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "integration-gate-"));
    process.env.GATE_ROOT = tempDir;
    assert.strictEqual(resolveRoot(), tempDir);
    try {
      // Create and promote a rule
      const report = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        subtype: "new-artifact-type",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Agent proposed a new artifact type which violates philosophy.",
      });
      const reportText = JSON.parse(report.content[0].text);

      process.env.OPERATOR_MODE = "1";
      await metaStatePromoteRuleTool.handler({
        id: reportText.id,
        rule_id: "rule-test-new-artifact",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: "new\\s+schema",
      });

      // Gate should escalate
      const rules = loadPromotedRules(tempDir);
      assert.strictEqual(rules.length, 1);

      const gateResult = applyPromotedRules("I want to new schema for data", null, rules);
      assert.strictEqual(gateResult.decision, "escalate");
      assert.strictEqual(gateResult.rule_id, "rule-test-new-artifact");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperatorMode;
    }
  });

  test("gate returns ok for non-matching command", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "integration-gate-ok-"));
    process.env.GATE_ROOT = tempDir;
    assert.strictEqual(resolveRoot(), tempDir);
    try {
      const report = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        subtype: "new-artifact-type",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Agent proposed a new artifact type which violates philosophy.",
      });
      const reportText = JSON.parse(report.content[0].text);

      process.env.OPERATOR_MODE = "1";
      await metaStatePromoteRuleTool.handler({
        id: reportText.id,
        rule_id: "rule-test-new-artifact",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: "new\\s+schema",
      });

      const rules = loadPromotedRules(tempDir);
      const gateResult = applyPromotedRules("ls -la", null, rules);
      assert.strictEqual(gateResult.decision, "ok");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperatorMode;
    }
  });

  test("meta_state_list returns promoted rule", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "integration-list-"));
    process.env.GATE_ROOT = tempDir;
    assert.strictEqual(resolveRoot(), tempDir);
    try {
      const report = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        subtype: "escape-hatch-abuse",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Agent proposed a new artifact type which violates philosophy.",
      });
      const reportText = JSON.parse(report.content[0].text);

      process.env.OPERATOR_MODE = "1";
      await metaStatePromoteRuleTool.handler({
        id: reportText.id,
        rule_id: "rule-test-list",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: "test",
      });

      const listResult = await metaStateListTool.handler({
        status: "active",
        category: "loop-anti-pattern",
      });
      const listText = JSON.parse(listResult.content[0].text);
      assert.strictEqual(listText.count, 1);
      // After Phase 2 migration, promoted_to_rule is no longer written on findings.
      // The rule entry's origin field is the canonical inverse reference.
      const entries = readRegistry(tempDir);
      const ruleEntry = entries.find((e) => e.entry_kind === "rule" && e.id === "rule-test-list");
      assert.ok(ruleEntry, "Rule entry should exist in registry");
      assert.strictEqual(ruleEntry.origin, listText.entries[0].id);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperatorMode;
    }
  });

  test("loop_describe hot tier returns promoted rule", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "integration-describe-"));
    process.env.GATE_ROOT = tempDir;
    assert.strictEqual(resolveRoot(), tempDir);
    try {
      const report = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        subtype: "new-artifact-type",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Agent proposed a new artifact type which violates philosophy.",
      });
      const reportText = JSON.parse(report.content[0].text);

      process.env.OPERATOR_MODE = "1";
      await metaStatePromoteRuleTool.handler({
        id: reportText.id,
        rule_id: "rule-test-describe",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: "test",
      });

      const result = await loopDescribeTool.handler({ tier: "hot" });
      const text = JSON.parse(result.content[0].text);
      assert.ok(Array.isArray(text.rules));
      assert.strictEqual(text.rules.length, 1);
      assert.strictEqual(text.rules[0].rule_id, "rule-test-describe");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperatorMode;
    }
  });

  test("recovery flow: disabled status short-circuits rule", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "integration-recovery-"));
    process.env.GATE_ROOT = tempDir;
    assert.strictEqual(resolveRoot(), tempDir);
    try {
      const report = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        subtype: "new-artifact-type",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Agent proposed a new artifact type which violates philosophy.",
      });
      const reportText = JSON.parse(report.content[0].text);

      process.env.OPERATOR_MODE = "1";
      await metaStatePromoteRuleTool.handler({
        id: reportText.id,
        rule_id: "rule-test-recovery",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: ".*",
      });

      // Verify rule is active
      let rules = loadPromotedRules(tempDir);
      assert.strictEqual(rules.length, 1);

      // Disable the rule (Phase 1: rule is now a separate entry_kind: "rule" entry)
      await updateEntry(tempDir, "rule-test-recovery", { status: "inactive" });

      // Verify rule is no longer loaded
      rules = loadPromotedRules(tempDir);
      assert.strictEqual(rules.length, 0);

      // Gate should return ok when fed the inactive rule directly
      const gateResult = applyPromotedRules("anything", null, [
        { ...readRegistry(tempDir)[0], status: "inactive" },
      ]);
      assert.strictEqual(gateResult.decision, "ok");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperatorMode;
    }
  });

  test("other meta-state entries preserved after migration", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "integration-preserve-"));
    process.env.GATE_ROOT = tempDir;
    assert.strictEqual(resolveRoot(), tempDir);
    try {
      await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "First entry for preservation test with enough chars.",
      });
      await metaStateReportTool.handler({
        category: "mcp-tool-missing",
        severity: "warning",
        affected_system: "mcp-tools",
        description: "Second entry for preservation test with enough chars.",
      });

      const before = readRegistry(tempDir);
      assert.strictEqual(before.length, 2);

      // Migrate first entry
      await updateEntry(tempDir, before[0].id, {
        category: "loop-anti-pattern",
        subtype: "gate-bug",
      });

      const after = readRegistry(tempDir);
      assert.strictEqual(after.length, 2);
      assert.strictEqual(after[0].category, "loop-anti-pattern");
      assert.strictEqual(after[1].category, "mcp-tool-missing");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperatorMode;
    }
  });

  test("loop_describe warm tier legacy fallback empty after migration", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "integration-legacy-"));
    process.env.GATE_ROOT = tempDir;
    assert.strictEqual(resolveRoot(), tempDir);
    try {
      // Create a legacy-category entry and migrate it
      await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Legacy entry that will be migrated to loop-anti-pattern.",
      });

      const entries = readRegistry(tempDir);
      await updateEntry(tempDir, entries[0].id, {
        category: "loop-anti-pattern",
        subtype: "gate-bug",
      });

      // warm tier should NOT show legacy fallback since all entries are loop-anti-pattern
      const result = await loopDescribeTool.handler({ tier: "warm" });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.legacy_findings, undefined);
      assert.ok(text.active_findings.length > 0);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperatorMode;
    }
  });

  test("promote_rule preview mode returns sample matches without activating", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "integration-preview-"));
    process.env.GATE_ROOT = tempDir;
    assert.strictEqual(resolveRoot(), tempDir);
    try {
      const report = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        subtype: "new-artifact-type",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Preview test entry with enough characters to pass.",
      });
      const reportText = JSON.parse(report.content[0].text);

      const previewResult = await metaStatePromoteRuleTool.handler({
        id: reportText.id,
        rule_id: "rule-preview",
        enforcement: "gate",
        pattern_type: "regex",
        pattern: "new\\s+schema",
        preview: true,
        sample_commands: ["I want to new schema", "hello world"],
      });

      const previewText = JSON.parse(previewResult.content[0].text);
      assert.strictEqual(previewText.preview, true);
      assert.strictEqual(previewText.sample_matches.length, 2);
      assert.strictEqual(previewText.sample_matches[0].matched, true);
      assert.strictEqual(previewText.sample_matches[1].matched, false);

      // Entry should still be reported, not active
      const entries = readRegistry(tempDir);
      assert.strictEqual(entries[0].status, "reported");
      assert.strictEqual(entries[0].promoted_to_rule, undefined);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperatorMode;
    }
  });
});
