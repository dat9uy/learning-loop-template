import { describe, test } from "node:test";
import assert from "node:assert";
import { metaStateReportTool } from "../tools/meta-state-report-tool.js";
import { metaStateEntrySchema, readRegistry } from "../core/meta-state.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("meta-state schema regression", () => {
  test("existing gate-logic-bug category validates", () => {
    const result = metaStateEntrySchema.safeParse({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Gate logic allows suspicious pattern through without matching",
    });
    assert.strictEqual(result.success, true);
  });

  test("invalid category is rejected", () => {
    const result = metaStateEntrySchema.safeParse({
      category: "not-a-category",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Gate logic allows suspicious pattern through without matching",
    });
    assert.strictEqual(result.success, false);
  });

  test("entry without optional fields validates", () => {
    const result = metaStateEntrySchema.safeParse({
      category: "budget-check",
      severity: "warning",
      affected_system: "vnstock_vendor",
      description: "Agent checked budget before vendor-api curl call.",
    });
    assert.strictEqual(result.success, true);
  });

  test("description shorter than 20 chars is rejected", () => {
    const result = metaStateEntrySchema.safeParse({
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
    const result = metaStateEntrySchema.safeParse({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Agent proposed a new artifact type which violates the no-new-artifact-types philosophy.",
    });
    assert.strictEqual(result.success, true);
  });

  test("loop-anti-pattern with subtype is accepted", () => {
    const result = metaStateEntrySchema.safeParse({
      category: "loop-anti-pattern",
      subtype: "new-artifact-type",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Agent proposed a new artifact type which violates the no-new-artifact-types philosophy.",
    });
    assert.strictEqual(result.success, true);
  });

  test("subtype on non-loop-anti-pattern category is accepted (forward compat)", () => {
    const result = metaStateEntrySchema.safeParse({
      category: "gate-logic-bug",
      subtype: "anything",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Some gate logic issue that also carries a subtype for future use.",
    });
    assert.strictEqual(result.success, true);
  });

  test("status reported is accepted", () => {
    const result = metaStateEntrySchema.safeParse({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Valid description with enough length to pass.",
      status: "reported",
    });
    assert.strictEqual(result.success, true);
  });

  test("status active is rejected", () => {
    const result = metaStateEntrySchema.safeParse({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Valid description with enough length to pass.",
      status: "active",
    });
    assert.strictEqual(result.success, false);
  });

  test("status resolved is rejected", () => {
    const result = metaStateEntrySchema.safeParse({
      category: "gate-logic-bug",
      severity: "warning",
      affected_system: "gate-logic",
      description: "Valid description with enough length to pass.",
      status: "resolved",
    });
    assert.strictEqual(result.success, false);
  });

  test("tool schema matches shared metaStateEntrySchema shape", () => {
    const toolKeys = Object.keys(metaStateReportTool.schema).sort();
    const sharedKeys = Object.keys(metaStateEntrySchema.shape).sort();
    assert.deepStrictEqual(toolKeys, sharedKeys, "Tool schema keys must match shared schema keys");
    for (const key of toolKeys) {
      assert.ok(
        metaStateEntrySchema.shape[key],
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
      process.env.GATE_ROOT = originalEnv;
    }
  });
});
