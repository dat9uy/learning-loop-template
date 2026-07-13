import { describe, test } from "vitest";
import assert from "node:assert";
import { metaStateReportTool } from "../../tools/handlers/meta-state-report-tool.js";
import {
  metaStateFindingEntrySchema,
  metaStateChangeEntrySchema,
  metaStateEntrySchema,
  readRegistry,
  filterEntries,
} from "../../core/meta-state.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("meta-state schema regression", () => {
  test("existing gate-logic-bug category validates", () => {
    const result = metaStateFindingEntrySchema.safeParse({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Gate logic allows suspicious pattern through without matching",
    });
    assert.strictEqual(result.success, true);
  });

  test("invalid category is rejected", () => {
    const result = metaStateFindingEntrySchema.safeParse({
      category: "not-a-category",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Gate logic allows suspicious pattern through without matching",
    });
    assert.strictEqual(result.success, false);
  });

  test("entry without optional fields validates", () => {
    const result = metaStateFindingEntrySchema.safeParse({
      category: "budget-check",
      severity: "warning",
      affected_system: "vnstock_vendor",
      description: "Agent checked budget before vendor-api curl call.",
    });
    assert.strictEqual(result.success, true);
  });

  test("description shorter than 20 chars is rejected", () => {
    const result = metaStateFindingEntrySchema.safeParse({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "too short",
    });
    assert.strictEqual(result.success, false);
  });
});

describe("meta-state schema new behavior", () => {
  let tempDir;
  const originalEnv = process.env.GATE_ROOT;

  test("loop-anti-pattern category is accepted", () => {
    const result = metaStateFindingEntrySchema.safeParse({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Agent proposed a new artifact type which violates the no-new-artifact-types philosophy.",
    });
    assert.strictEqual(result.success, true);
  });

  test("loop-anti-pattern with subtype is accepted", () => {
    const result = metaStateFindingEntrySchema.safeParse({
      category: "loop-anti-pattern",
      subtype: "new-artifact-type",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Agent proposed a new artifact type which violates the no-new-artifact-types philosophy.",
    });
    assert.strictEqual(result.success, true);
  });

  test("subtype on non-loop-anti-pattern category is accepted (forward compat)", () => {
    const result = metaStateFindingEntrySchema.safeParse({
      category: "gate-logic-bug",
      subtype: "anything",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Some gate logic issue that also carries a subtype for future use.",
    });
    assert.strictEqual(result.success, true);
  });

  test("status reported is accepted", () => {
    const result = metaStateFindingEntrySchema.safeParse({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Valid description with enough length to pass.",
      status: "open",
    });
    assert.strictEqual(result.success, true);
  });

  test("status active is accepted (registry compatibility)", () => {
    const result = metaStateFindingEntrySchema.safeParse({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Valid description with enough length to pass.",
      status: "open",
    });
    assert.strictEqual(result.success, true);
  });

  test("status resolved is accepted (registry compatibility)", () => {
    const result = metaStateFindingEntrySchema.safeParse({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Valid description with enough length to pass.",
      status: "resolved",
    });
    assert.strictEqual(result.success, true);
  });

  test("finding schema accepts reopens field", () => {
    const result = metaStateFindingEntrySchema.safeParse({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "A finding that reopens a previously expired finding.",
      reopens: ["meta-260606T2202Z-original-id"],
    });
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.data.reopens, ["meta-260606T2202Z-original-id"]);
  });

  test("finding schema validates without reopens field (backward compat)", () => {
    const result = metaStateFindingEntrySchema.safeParse({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "A finding without the reopens field should still validate.",
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.reopens, undefined);
  });

  test("tool schema matches shared metaStateFindingEntrySchema shape", () => {
    const toolKeys = Object.keys(metaStateReportTool.schema).sort();
    const sharedKeys = Object.keys(metaStateFindingEntrySchema.shape).sort();
    assert.deepStrictEqual(toolKeys, sharedKeys, "Tool schema keys must match shared schema keys");
    for (const key of toolKeys) {
      assert.ok(
        metaStateFindingEntrySchema.shape[key],
        `Shared schema missing key: ${key}`
      );
    }
  });

  test("handler ignores promoted_to_rule in input", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-schema-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        subtype: "escape-hatch-abuse",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Agent proposed a new artifact type which violates the philosophy.",
        promoted_to_rule: {
          rule_id: "should-be-ignored",
          enforcement: "gate",
          pattern_type: "regex",
          pattern: "new schema",
          promoted_at: new Date().toISOString(),
          promoted_by: "agent",
        },
      });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.reported, true);

      const entries = readRegistry(tempDir);
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].category, "loop-anti-pattern");
      assert.strictEqual(entries[0].subtype, "escape-hatch-abuse");
      assert.strictEqual(entries[0].promoted_to_rule, undefined);
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

  test("change-log schema accepts top-level evidence_code_ref", () => {
    const result = metaStateChangeEntrySchema.safeParse({
      entry_kind: "change-log",
      change_dimension: "semantic",
      change_target: "core/meta-state.js",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "Change-log schema now accepts top-level evidence_code_ref per dual-field unification.",
      status: "active",
      created_at: new Date().toISOString(),
      evidence_code_ref: "core/meta-state.js:55",
    });
    assert.strictEqual(result.success, true);
  });

  test("change-log schema rejects nested evidence.code_ref", () => {
    const result = metaStateChangeEntrySchema.safeParse({
      entry_kind: "change-log",
      change_dimension: "semantic",
      change_target: "core/meta-state.js",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "Nested evidence.code_ref is no longer accepted after schema flatten.",
      status: "active",
      created_at: new Date().toISOString(),
      evidence: { code_ref: "core/meta-state.js:55" },
    });
    assert.strictEqual(result.success, false);
  });

  test("3 of 3 applicable union branches expose evidence_code_ref top-level (loop-design exempt)", () => {
    const stub = { evidence_code_ref: "x.js" };

    const finding = metaStateFindingEntrySchema.safeParse({
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "gate-logic",
      description: "A test finding for evidence coverage test",
      ...stub,
    });
    assert.ok(finding.success, "finding schema accepts evidence_code_ref");

    const changeLog = metaStateChangeEntrySchema.safeParse({
      entry_kind: "change-log",
      change_dimension: "semantic",
      change_target: "test",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "A test change-log for evidence coverage test",
      status: "active",
      created_at: new Date().toISOString(),
      ...stub,
    });
    assert.ok(changeLog.success, "change-log schema accepts evidence_code_ref");

    const rule = metaStateEntrySchema.safeParse({
      entry_kind: "rule",
      id: "rule-test-evidence-coverage",
      origin: "meta-260607T0008Z-dual-field-schema-risk",
      enforcement: "agent",
      pattern_type: "regex",
      pattern: "test",
      description: "A test rule for evidence coverage test",
      promoted_at: new Date().toISOString(),
      promoted_by: "test",
      ...stub,
    });
    assert.ok(rule.success, "rule schema accepts evidence_code_ref");
  });
});

describe("meta-state change-log schema", () => {
  test("metaStateChangeEntrySchema accepts valid change-log input", () => {
    const result = metaStateChangeEntrySchema.safeParse({
      entry_kind: "change-log",
      change_dimension: "semantic",
      change_target: "core/meta-state.js",
      change_diff: { added: ["entry_kind"], removed: [], changed: [] },
      reason: "SP0 introduces a discriminated union to support change-log entries alongside findings.",
      status: "active",
      created_at: new Date().toISOString(),
    });
    assert.strictEqual(result.success, true);
  });

  test("metaStateChangeEntrySchema rejects change_dimension outside the 3-bucket enum", () => {
    const result = metaStateChangeEntrySchema.safeParse({
      entry_kind: "change-log",
      change_dimension: "unknown",
      change_target: "core/meta-state.js",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "This change dimension does not exist in the schema.",
      status: "active",
      created_at: new Date().toISOString(),
    });
    assert.strictEqual(result.success, false);
  });

  test("metaStateChangeEntrySchema rejects change_target empty string", () => {
    const result = metaStateChangeEntrySchema.safeParse({
      entry_kind: "change-log",
      change_dimension: "mechanical",
      change_target: "",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "Empty target should be rejected by the schema.",
      status: "active",
      created_at: new Date().toISOString(),
    });
    assert.strictEqual(result.success, false);
  });

  test("metaStateChangeEntrySchema rejects reason shorter than 20 chars", () => {
    const result = metaStateChangeEntrySchema.safeParse({
      entry_kind: "change-log",
      change_dimension: "surface",
      change_target: "tools/manifest.json",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "too short",
      status: "active",
      created_at: new Date().toISOString(),
    });
    assert.strictEqual(result.success, false);
  });

  test("metaStateChangeEntrySchema accepts any change_target string (open)", () => {
    const targets = [
      "tools/learning-loop-mastra/core/meta-state.js",
      "rule-no-new-artifact-types",
      "https://example.com/design-doc",
    ];
    for (const target of targets) {
      const result = metaStateChangeEntrySchema.safeParse({
        entry_kind: "change-log",
        change_dimension: "semantic",
        change_target: target,
        change_diff: { added: [], removed: [], changed: [] },
        reason: `Testing open change_target with value: ${target}`,
        status: "active",
        created_at: new Date().toISOString(),
      });
      assert.strictEqual(result.success, true, `Expected target "${target}" to be valid`);
    }
  });

  test("metaStateChangeEntrySchema accepts applies_to with all optional sub-fields", () => {
    const result = metaStateChangeEntrySchema.safeParse({
      entry_kind: "change-log",
      change_dimension: "surface",
      change_target: "tools/meta-state-log-change-tool.js",
      change_diff: { added: ["meta_state_log_change"], removed: [], changed: [] },
      reason: "New tool for logging system changes is added to the MCP surface.",
      applies_to: {
        tools: ["meta_state_log_change", "meta_state_list"],
        surfaces: ["meta"],
        rules: ["rule-no-new-artifact-types"],
        statuses: ["active"],
        schemas: ["core/meta-state.js"],
      },
      status: "active",
      created_at: new Date().toISOString(),
    });
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.data.applies_to.tools, ["meta_state_log_change", "meta_state_list"]);
  });
});

describe("meta-state discriminated union", () => {
  test("metaStateEntrySchema (union) picks finding branch and ignores change-log fields", () => {
    const result = metaStateEntrySchema.safeParse({
      id: "meta-test-finding-union",
      entry_kind: "finding",
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Mixing finding and change-log fields should not pollute result.",
      change_dimension: "semantic",
      change_target: "mixed",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "This is a mixed entry that should be parsed as finding.",
      created_at: new Date().toISOString(),
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.entry_kind, "finding");
    assert.strictEqual(result.data.change_dimension, undefined);
  });

  test("metaStateEntrySchema (union) picks change-log branch and ignores finding-only fields", () => {
    const result = metaStateEntrySchema.safeParse({
      id: "meta-test-change-log-union",
      entry_kind: "change-log",
      change_dimension: "semantic",
      change_target: "core/meta-state.js",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "Change-log entries must not carry finding-only fields like severity.",
      severity: "warning",
      affected_system: "gate-logic",
      status: "active",
      created_at: new Date().toISOString(),
    });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.entry_kind, "change-log");
    assert.strictEqual(result.data.severity, undefined);
    // affected_system is now a cross-cutting field (present on all entry kinds)
    assert.strictEqual(result.data.affected_system, "gate-logic");
  });
});

describe("meta-state readRegistry legacy coercion", () => {
  let tempDir;

  test("readRegistry coerces legacy entries to entry_kind: finding", () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-legacy-"));
    const legacy = {
      id: "meta-260601T0000Z-legacy-entry",
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Legacy entry without entry_kind field.",
      status: "open",
      created_at: "2026-06-01T00:00:00.000Z",
    };
    const path = join(tempDir, "meta-state.jsonl");
    writeFileSync(path, JSON.stringify(legacy) + "\n");
    const entries = readRegistry(tempDir);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].entry_kind, "finding");
    assert.strictEqual(entries[0].category, "gate-logic-bug");
  });

  test("readRegistry preserves entries with entry_kind: change-log", () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-state-changelog-"));
    const changeLog = {
      id: "meta-260602T0000Z-change-log-entry",
      entry_kind: "change-log",
      change_dimension: "semantic",
      change_target: "core/meta-state.js",
      change_diff: { added: ["entry_kind"], removed: [], changed: [] },
      reason: "Round-trip test for change-log entries.",
      status: "open",
      created_at: "2026-06-02T00:00:00.000Z",
    };
    const path = join(tempDir, "meta-state.jsonl");
    writeFileSync(path, JSON.stringify(changeLog) + "\n");
    const entries = readRegistry(tempDir);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].entry_kind, "change-log");
    assert.strictEqual(entries[0].change_dimension, "semantic");
  });
});

describe("meta-state filterEntries entry_kind", () => {

  test("filterEntries({ entry_kind: change-log }) returns only change-log entries", () => {
    const entries = [
      { id: "f1", entry_kind: "finding", category: "gate-logic-bug", status: "open" },
      { id: "c1", entry_kind: "change-log", change_dimension: "surface", change_target: "t1", status: "open" },
      { id: "f2", entry_kind: "finding", category: "schema-drift", status: "open" },
    ];
    const result = filterEntries(entries, { entry_kind: "change-log" });
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "c1");
  });

  test("filterEntries({ entry_kind: finding }) returns only finding entries", () => {
    const entries = [
      { id: "f1", entry_kind: "finding", category: "gate-logic-bug", status: "open" },
      { id: "c1", entry_kind: "change-log", change_dimension: "surface", change_target: "t1", status: "open" },
      { id: "f2", entry_kind: "finding", category: "schema-drift", status: "open" },
    ];
    const result = filterEntries(entries, { entry_kind: "finding" });
    assert.strictEqual(result.length, 2);
    assert.ok(result.every((e) => e.entry_kind === "finding"));
  });
});
