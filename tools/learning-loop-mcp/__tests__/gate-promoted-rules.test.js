import assert from "node:assert";
import { describe, test } from "node:test";
import {
  matchConstraintPattern,
  makeGateDecision,
  loadPromotedRules,
  applyPromotedRules,
} from "../core/gate-logic.js";
import { mkdtempSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("gate promoted rules regression", () => {
  test("existing constraint pattern still matches", () => {
    const result = matchConstraintPattern("pip install numpy");
    assert.strictEqual(result, "package-manager");
  });

  test("makeGateDecision blocks without observation", () => {
    const result = makeGateDecision("docker", { found: false });
    assert.strictEqual(result.decision, "block");
    assert.strictEqual(result.observation_required, true);
  });

  test("makeGateDecision ok with observation", () => {
    const result = makeGateDecision("docker", { found: true, observation: { id: "obs-1" } });
    assert.strictEqual(result.decision, "ok");
  });

  test("loadPromotedRules returns empty when meta-state.jsonl missing", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gate-promoted-"));
    const rules = loadPromotedRules(tempDir);
    assert.deepStrictEqual(rules, []);
  });

  test("loadPromotedRules returns empty when no loop-anti-pattern entries", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gate-promoted-"));
    const metaPath = join(tempDir, "meta-state.jsonl");
    writeFileSync(
      metaPath,
      JSON.stringify({
        id: "meta-test",
        category: "gate-logic-bug",
        status: "active",
        promoted_to_rule: { enforcement: "gate", pattern_type: "regex", pattern: "test" },
      }) + "\n"
    );
    const rules = loadPromotedRules(tempDir);
    assert.deepStrictEqual(rules, []);
  });
});

describe("gate promoted rules new behavior", () => {
  test("regex rule matches command and returns escalate", () => {
    const rules = [
      {
        id: "meta-1",
        category: "loop-anti-pattern",
        status: "active",
        promoted_to_rule: {
          rule_id: "rule-no-docker",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: "docker\\s+run",
        },
      },
    ];
    const result = applyPromotedRules("docker run ubuntu", null, rules);
    assert.strictEqual(result.decision, "escalate");
    assert.strictEqual(result.rule_id, "rule-no-docker");
    assert.strictEqual(result.meta_state_id, "meta-1");
    assert.strictEqual(result.pattern_type, "regex");
  });

  test("glob rule matches file path and returns escalate", () => {
    const rules = [
      {
        id: "meta-2",
        category: "loop-anti-pattern",
        status: "active",
        promoted_to_rule: {
          rule_id: "rule-no-secrets",
          enforcement: "gate",
          pattern_type: "glob",
          pattern: "product/**/secrets/**",
        },
      },
    ];
    const result = applyPromotedRules(null, "product/api/secrets/config.yaml", rules);
    assert.strictEqual(result.decision, "escalate");
    assert.strictEqual(result.rule_id, "rule-no-secrets");
  });

  test("regex rule does not match returns ok", () => {
    const rules = [
      {
        id: "meta-1",
        category: "loop-anti-pattern",
        status: "active",
        promoted_to_rule: {
          rule_id: "rule-no-docker",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: "docker\\s+run",
        },
      },
    ];
    const result = applyPromotedRules("ls -la", null, rules);
    assert.strictEqual(result.decision, "ok");
  });

  test("glob rule does not match returns ok", () => {
    const rules = [
      {
        id: "meta-2",
        category: "loop-anti-pattern",
        status: "active",
        promoted_to_rule: {
          rule_id: "rule-no-secrets",
          enforcement: "gate",
          pattern_type: "glob",
          pattern: "product/**/secrets/**",
        },
      },
    ];
    const result = applyPromotedRules(null, "docs/readme.md", rules);
    assert.strictEqual(result.decision, "ok");
  });

  test("inactive rule status reported is ignored", () => {
    const rules = [
      {
        id: "meta-1",
        category: "loop-anti-pattern",
        status: "reported",
        promoted_to_rule: {
          rule_id: "rule-no-docker",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: "docker\\s+run",
        },
      },
    ];
    const result = applyPromotedRules("docker run ubuntu", null, rules);
    assert.strictEqual(result.decision, "ok");
  });

  test("non-gate enforcement agent is ignored", () => {
    const rules = [
      {
        id: "meta-1",
        category: "loop-anti-pattern",
        status: "active",
        promoted_to_rule: {
          rule_id: "rule-no-docker",
          enforcement: "agent",
          pattern_type: "regex",
          pattern: "docker\\s+run",
        },
      },
    ];
    const result = applyPromotedRules("docker run ubuntu", null, rules);
    assert.strictEqual(result.decision, "ok");
  });

  test("invalid regex is caught and skipped without crash", () => {
    const rules = [
      {
        id: "meta-1",
        category: "loop-anti-pattern",
        status: "active",
        promoted_to_rule: {
          rule_id: "rule-bad",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: "[invalid(",
        },
      },
    ];
    const result = applyPromotedRules("anything", null, rules);
    assert.strictEqual(result.decision, "ok");
  });

  test("multiple rules returns first match", () => {
    const rules = [
      {
        id: "meta-1",
        category: "loop-anti-pattern",
        status: "active",
        promoted_to_rule: {
          rule_id: "rule-first",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: ".*",
        },
      },
      {
        id: "meta-2",
        category: "loop-anti-pattern",
        status: "active",
        promoted_to_rule: {
          rule_id: "rule-second",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: ".*",
        },
      },
    ];
    const result = applyPromotedRules("test", null, rules);
    assert.strictEqual(result.decision, "escalate");
    assert.strictEqual(result.rule_id, "rule-first");
  });

  test("cache hit returns same reference without re-reading file", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gate-promoted-cache-"));
    const metaPath = join(tempDir, "meta-state.jsonl");
    writeFileSync(
      metaPath,
      JSON.stringify({
        id: "meta-1",
        category: "loop-anti-pattern",
        status: "active",
        promoted_to_rule: {
          rule_id: "rule-test",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: "test",
        },
      }) + "\n"
    );

    const rules1 = loadPromotedRules(tempDir);
    assert.strictEqual(rules1.length, 1);

    // Second call with unchanged file should return the same cached reference
    const rules2 = loadPromotedRules(tempDir);
    assert.strictEqual(rules2.length, 1);
    assert.strictEqual(rules1, rules2, "Cache hit must return the same array reference");
  });

  test("cache miss on mtime+size change triggers re-read", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gate-promoted-cache-"));
    const metaPath = join(tempDir, "meta-state.jsonl");
    writeFileSync(
      metaPath,
      JSON.stringify({
        id: "meta-1",
        category: "loop-anti-pattern",
        status: "active",
        promoted_to_rule: {
          rule_id: "rule-test",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: "test",
        },
      }) + "\n"
    );

    const rules1 = loadPromotedRules(tempDir);
    assert.strictEqual(rules1.length, 1);

    // Add a new entry (changes file size)
    writeFileSync(
      metaPath,
      JSON.stringify({
        id: "meta-1",
        category: "loop-anti-pattern",
        status: "active",
        promoted_to_rule: {
          rule_id: "rule-test",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: "test",
        },
      }) +
        "\n" +
        JSON.stringify({
          id: "meta-2",
          category: "loop-anti-pattern",
          status: "active",
          promoted_to_rule: {
            rule_id: "rule-second",
            enforcement: "gate",
            pattern_type: "regex",
            pattern: "second",
          },
        }) +
        "\n"
    );

    const rules2 = loadPromotedRules(tempDir);
    assert.strictEqual(rules2.length, 2);
  });

  test("high complexity regex pattern is rejected", () => {
    const rules = [
      {
        id: "meta-1",
        category: "loop-anti-pattern",
        status: "active",
        promoted_to_rule: {
          rule_id: "rule-redos",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: "(a+)+",
        },
      },
    ];
    const result = applyPromotedRules("aaaaaaaaaaaaaaaaaaaaaaaaaaaa!", null, rules);
    assert.strictEqual(result.decision, "ok");
  });

  test("glob outside scope whitelist is rejected", () => {
    const rules = [
      {
        id: "meta-1",
        category: "loop-anti-pattern",
        status: "active",
        promoted_to_rule: {
          rule_id: "rule-traversal",
          enforcement: "gate",
          pattern_type: "glob",
          pattern: "**/secrets/**",
        },
      },
    ];
    const result = applyPromotedRules(null, "product/api/secrets/config.yaml", rules);
    assert.strictEqual(result.decision, "ok");
  });

  test("status disabled rules are excluded", () => {
    const rules = [
      {
        id: "meta-1",
        category: "loop-anti-pattern",
        status: "disabled",
        promoted_to_rule: {
          rule_id: "rule-disabled",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: ".*",
        },
      },
    ];
    const result = applyPromotedRules("anything", null, rules);
    assert.strictEqual(result.decision, "ok");
  });

  test("loadPromotedRules excludes disabled and non-gate rules", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "gate-promoted-filter-"));
    const metaPath = join(tempDir, "meta-state.jsonl");
    writeFileSync(
      metaPath,
      JSON.stringify({
        id: "meta-active",
        category: "loop-anti-pattern",
        status: "active",
        promoted_to_rule: {
          rule_id: "rule-active",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: "active",
        },
      }) +
        "\n" +
        JSON.stringify({
          id: "meta-disabled",
          category: "loop-anti-pattern",
          status: "disabled",
          promoted_to_rule: {
            rule_id: "rule-disabled",
            enforcement: "gate",
            pattern_type: "regex",
            pattern: "disabled",
          },
        }) +
        "\n" +
        JSON.stringify({
          id: "meta-agent",
          category: "loop-anti-pattern",
          status: "active",
          promoted_to_rule: {
            rule_id: "rule-agent",
            enforcement: "agent",
            pattern_type: "regex",
            pattern: "agent",
          },
        }) +
        "\n"
    );

    const rules = loadPromotedRules(tempDir);
    assert.strictEqual(rules.length, 1);
    assert.strictEqual(rules[0].id, "meta-active");
  });
});
