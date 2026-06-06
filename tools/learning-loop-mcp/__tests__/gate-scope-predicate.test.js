import { describe, test } from "node:test";
import assert from "node:assert";
import { loadPromotedRules, applyPromotedRules, globMatch } from "../core/gate-logic.js";
import { metaStateReportTool } from "../tools/meta-state-report-tool.js";
import { metaStatePromoteRuleTool } from "../tools/meta-state-promote-rule-tool.js";
import { readRegistry } from "../core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("globMatch brace expansion", () => {
  test("expands simple braces and matches each alternative", () => {
    assert.ok(globMatch(".factory/skills/{use-mcp,find-skills}/**", ".factory/skills/use-mcp/test.js"));
    assert.ok(globMatch(".factory/skills/{use-mcp,find-skills}/**", ".factory/skills/find-skills/script.js"));
    assert.ok(!globMatch(".factory/skills/{use-mcp,find-skills}/**", ".factory/skills/other/test.js"));
  });

  test("nested braces are expanded", () => {
    assert.ok(globMatch("{a,b}/{c,d}", "a/c"));
    assert.ok(globMatch("{a,b}/{c,d}", "b/d"));
    assert.ok(!globMatch("{a,b}/{c,d}", "a/x"));
  });

  test("patterns without braces still work", () => {
    assert.ok(globMatch("tools/**/*.js", "tools/lib/foo.js"));
    assert.ok(!globMatch("tools/**/*.js", "docs/lib/foo.js"));
  });
});

describe("gate scope predicate", () => {
  const originalEnv = process.env.GATE_ROOT;
  const originalOperatorMode = process.env.OPERATOR_MODE;
  const warnings = [];
  const originalWarn = console.warn;

  function setupTempDir(prefix) {
    return mkdtempSync(join(tmpdir(), prefix));
  }

  function teardownTempDir(dir) {
    try { rmSync(dir, { recursive: true }); } catch { /* ignore */ }
  }

  function writeMcpJson(dir, servers) {
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify({ mcpServers: servers || {} }, null, 2)
    );
  }

  test("loadPromotedRules returns rules with scope_predicate 'none' regardless of project config", () => {
    const tempDir = setupTempDir("scope-none-");
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify({
        id: "meta-test-none",
        category: "loop-anti-pattern",
        status: "active",
        promoted_to_rule: {
          rule_id: "rule-test-none",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: "test",
          scope_predicate: "none",
        },
      }) + "\n");

      const rules = loadPromotedRules(tempDir);
      assert.strictEqual(rules.length, 1);
      assert.strictEqual(rules[0].promoted_to_rule.rule_id, "rule-test-none");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      teardownTempDir(tempDir);
    }
  });

  test("loadPromotedRules returns scoped rules when project has .mcp.json + learning-loop-mcp entry", () => {
    const tempDir = setupTempDir("scope-match-");
    process.env.GATE_ROOT = tempDir;
    try {
      writeMcpJson(tempDir, { "learning-loop-mcp": { command: "node", args: ["server.js"] } });
      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify({
        id: "meta-test-match",
        category: "loop-anti-pattern",
        status: "active",
        promoted_to_rule: {
          rule_id: "rule-test-match",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: "test",
          scope_predicate: "project_has_learning_loop_mcp",
        },
      }) + "\n");

      const rules = loadPromotedRules(tempDir);
      assert.strictEqual(rules.length, 1);
      assert.strictEqual(rules[0].promoted_to_rule.rule_id, "rule-test-match");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      teardownTempDir(tempDir);
    }
  });

  test("loadPromotedRules filters out scoped rules when project has no .mcp.json", () => {
    const tempDir = setupTempDir("scope-no-mcp-");
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify({
        id: "meta-test-no-mcp",
        category: "loop-anti-pattern",
        status: "active",
        promoted_to_rule: {
          rule_id: "rule-test-no-mcp",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: "test",
          scope_predicate: "project_has_learning_loop_mcp",
        },
      }) + "\n");

      const rules = loadPromotedRules(tempDir);
      assert.strictEqual(rules.length, 0);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      teardownTempDir(tempDir);
    }
  });

  test("loadPromotedRules filters out scoped rules when .mcp.json lacks learning-loop-mcp entry", () => {
    const tempDir = setupTempDir("scope-other-server-");
    process.env.GATE_ROOT = tempDir;
    try {
      writeMcpJson(tempDir, { "other-server": { command: "node", args: ["other.js"] } });
      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify({
        id: "meta-test-other",
        category: "loop-anti-pattern",
        status: "active",
        promoted_to_rule: {
          rule_id: "rule-test-other",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: "test",
          scope_predicate: "project_has_learning_loop_mcp",
        },
      }) + "\n");

      const rules = loadPromotedRules(tempDir);
      assert.strictEqual(rules.length, 0);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      teardownTempDir(tempDir);
    }
  });

  test("loadPromotedRules filters out scoped rules when .mcp.json is malformed (fail-closed)", () => {
    const tempDir = setupTempDir("scope-bad-json-");
    process.env.GATE_ROOT = tempDir;
    try {
      writeFileSync(join(tempDir, ".mcp.json"), "not-json");
      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify({
        id: "meta-test-bad",
        category: "loop-anti-pattern",
        status: "active",
        promoted_to_rule: {
          rule_id: "rule-test-bad",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: "test",
          scope_predicate: "project_has_learning_loop_mcp",
        },
      }) + "\n");

      const rules = loadPromotedRules(tempDir);
      assert.strictEqual(rules.length, 0);
    } finally {
      process.env.GATE_ROOT = originalEnv;
      teardownTempDir(tempDir);
    }
  });

  test("loadPromotedRules logs warning for unknown predicate values", () => {
    const tempDir = setupTempDir("scope-unknown-");
    process.env.GATE_ROOT = tempDir;
    const captured = [];
    console.warn = (...args) => captured.push(args.join(" "));
    try {
      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify({
        id: "meta-test-unknown",
        category: "loop-anti-pattern",
        status: "active",
        promoted_to_rule: {
          rule_id: "rule-test-unknown",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: "test",
          scope_predicate: "unknown_predicate_value",
        },
      }) + "\n");

      loadPromotedRules(tempDir);
      assert.ok(
        captured.some((w) => w.includes("unknown_predicate_value")),
        `Expected warning about unknown predicate, got: ${JSON.stringify(captured)}`
      );
    } finally {
      console.warn = originalWarn;
      process.env.GATE_ROOT = originalEnv;
      teardownTempDir(tempDir);
    }
  });

  test("meta_state_promote_rule accepts scope_predicate and loadPromotedRules sees it", async () => {
    const tempDir = setupTempDir("scope-promote-");
    process.env.GATE_ROOT = tempDir;
    try {
      const report = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        subtype: "tool-misrouting",
        severity: "warning",
        affected_system: "agent-prompt",
        description: "Cross-project skill invocation from learning-loop project test entry.",
      });
      const reportText = JSON.parse(report.content[0].text);

      process.env.OPERATOR_MODE = "1";
      const promoteResult = await metaStatePromoteRuleTool.handler({
        id: reportText.id,
        rule_id: "rule-test-scope-promote",
        enforcement: "gate",
        pattern_type: "glob",
        pattern: "tools/**/*.test.js",
        scope_predicate: "project_has_learning_loop_mcp",
      });

      const promoteText = JSON.parse(promoteResult.content[0].text);
      assert.strictEqual(promoteText.promoted, true, `Promotion failed: ${JSON.stringify(promoteText)}`);

      // Verify persisted
      const entries = readRegistry(tempDir);
      const entry = entries.find((e) => e.id === reportText.id);
      assert.ok(entry, "Entry not found in registry");
      assert.strictEqual(entry.promoted_to_rule, "rule-test-scope-promote", "finding promoted_to_rule should be the rule id string");

      const ruleEntry = entries.find((e) => e.entry_kind === "rule" && e.id === "rule-test-scope-promote");
      assert.ok(ruleEntry, "Rule entry not found in registry");
      assert.strictEqual(ruleEntry.scope_predicate, "project_has_learning_loop_mcp");

      // Verify loadPromotedRules sees it in matching project
      writeMcpJson(tempDir, { "learning-loop-mcp": { command: "node", args: ["server.js"] } });
      const rules = loadPromotedRules(tempDir);
      assert.strictEqual(rules.length, 1);
      assert.strictEqual(rules[0].promoted_to_rule.scope_predicate, "project_has_learning_loop_mcp");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperatorMode;
      teardownTempDir(tempDir);
    }
  });

  test("meta_state_promote_rule refuses activation when pattern rejected by scope whitelist", async () => {
    const tempDir = setupTempDir("scope-whitelist-");
    process.env.GATE_ROOT = tempDir;
    try {
      const report = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        subtype: "tool-misrouting",
        severity: "warning",
        affected_system: "agent-prompt",
        description: "Whitelist test entry with enough chars.",
      });
      const reportText = JSON.parse(report.content[0].text);

      process.env.OPERATOR_MODE = "1";
      const promoteResult = await metaStatePromoteRuleTool.handler({
        id: reportText.id,
        rule_id: "rule-test-whitelist",
        enforcement: "gate",
        pattern_type: "glob",
        pattern: "**/*", // Over-broad, not whitelisted
        scope_predicate: "project_has_learning_loop_mcp",
      });

      const promoteText = JSON.parse(promoteResult.content[0].text);
      assert.strictEqual(promoteText.promoted, false);
      assert.strictEqual(promoteText.reason, "pattern_rejected_by_scope_whitelist");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperatorMode;
      teardownTempDir(tempDir);
    }
  });

  test("meta_state_promote_rule refuses activation when rule_id already active", async () => {
    const tempDir = setupTempDir("scope-duplicate-");
    process.env.GATE_ROOT = tempDir;
    try {
      const report1 = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        subtype: "tool-misrouting",
        severity: "warning",
        affected_system: "agent-prompt",
        description: "First duplicate test entry with enough chars.",
      });
      const report1Text = JSON.parse(report1.content[0].text);

      process.env.OPERATOR_MODE = "1";
      await metaStatePromoteRuleTool.handler({
        id: report1Text.id,
        rule_id: "rule-test-duplicate",
        enforcement: "gate",
        pattern_type: "glob",
        pattern: "tools/**/*.test.js",
      });

      const report2 = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        subtype: "tool-misrouting",
        severity: "warning",
        affected_system: "agent-prompt",
        description: "Second duplicate test entry with enough chars.",
      });
      const report2Text = JSON.parse(report2.content[0].text);

      const promoteResult = await metaStatePromoteRuleTool.handler({
        id: report2Text.id,
        rule_id: "rule-test-duplicate", // Same rule_id
        enforcement: "gate",
        pattern_type: "glob",
        pattern: "tools/**/*.test.js",
      });

      const promoteText = JSON.parse(promoteResult.content[0].text);
      assert.strictEqual(promoteText.promoted, false);
      assert.strictEqual(promoteText.reason, "rule_id_already_active");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      process.env.OPERATOR_MODE = originalOperatorMode;
      teardownTempDir(tempDir);
    }
  });

  test("end-to-end: rule-project-skill-boundary pattern escalates write to skill path in matching project", () => {
    const tempDir = setupTempDir("scope-e2e-");
    process.env.GATE_ROOT = tempDir;
    try {
      writeMcpJson(tempDir, { "learning-loop-mcp": { command: "node", args: ["server.js"] } });
      writeFileSync(join(tempDir, "meta-state.jsonl"), JSON.stringify({
        id: "meta-test-e2e",
        category: "loop-anti-pattern",
        status: "active",
        promoted_to_rule: {
          rule_id: "rule-project-skill-boundary",
          enforcement: "gate",
          pattern_type: "glob",
          pattern: ".factory/skills/{use-mcp,find-skills}/**",
          scope_predicate: "project_has_learning_loop_mcp",
        },
      }) + "\n");

      const rules = loadPromotedRules(tempDir);
      assert.strictEqual(rules.length, 1);

      const result = applyPromotedRules(null, ".factory/skills/use-mcp/test.sh", rules);
      assert.strictEqual(result.decision, "escalate");
      assert.strictEqual(result.rule_id, "rule-project-skill-boundary");

      const result2 = applyPromotedRules(null, ".factory/skills/find-skills/script.js", rules);
      assert.strictEqual(result2.decision, "escalate");

      const result3 = applyPromotedRules(null, ".factory/skills/other/test.sh", rules);
      assert.strictEqual(result3.decision, "ok");
    } finally {
      process.env.GATE_ROOT = originalEnv;
      teardownTempDir(tempDir);
    }
  });
});
