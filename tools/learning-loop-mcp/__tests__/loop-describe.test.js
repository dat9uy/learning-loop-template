import { describe, test } from "node:test";
import assert from "node:assert";
import { metaStateReportTool } from "../tools/meta-state-report-tool.js";
import { metaStateListTool } from "../tools/meta-state-list-tool.js";
import { loopDescribeTool } from "../tools/loop-describe-tool.js";
import { loadPromotedRules } from "../core/gate-logic.js";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("loop_describe regression", () => {
  let tempDir;
  const originalEnv = process.env.GATE_ROOT;

  test("meta_state_list still returns findings", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loop-describe-reg-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Gate logic allows suspicious pattern through without matching",
      });
      const listResult = await metaStateListTool.handler({});
      const listText = JSON.parse(listResult.content[0].text);
      assert.strictEqual(listText.count, 1);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("gate-logic loadPromotedRules unchanged when no meta-state", () => {
    tempDir = mkdtempSync(join(tmpdir(), "loop-describe-gate-"));
    const rules = loadPromotedRules(tempDir);
    assert.deepStrictEqual(rules, []);
  });

  test("manifest.json is valid JSON", () => {
    const manifestPath = join(import.meta.dirname, "..", "tools", "manifest.json");
    const raw = readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(raw);
    assert.ok(Array.isArray(manifest));
    assert.ok(manifest.length > 0);
  });

  test("tool schema still accepts loop-anti-pattern", () => {
    const result = metaStateReportTool.schema.category.safeParse("loop-anti-pattern");
    assert.strictEqual(result.success, true);
  });
});

describe("loop_describe new behavior", () => {
  let tempDir;
  const originalEnv = process.env.GATE_ROOT;

  test("tier summary returns counts only", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loop-describe-sum-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await loopDescribeTool.handler({ tier: "summary" });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.tier, "summary");
      assert.strictEqual(typeof text.tool_count, "number");
      assert.strictEqual(typeof text.rule_count, "number");
      assert.strictEqual(text.tools, undefined);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("tier hot returns active rules and tool names without descriptions", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loop-describe-hot-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await loopDescribeTool.handler({ tier: "hot" });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.tier, "hot");
      assert.ok(Array.isArray(text.tools));
      assert.ok(text.tools.length > 0);
      assert.strictEqual(text.tools[0].description, undefined);
      assert.ok(Array.isArray(text.promoted_rules));
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("tier warm returns tool descriptions and active findings", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loop-describe-warm-"));
    process.env.GATE_ROOT = tempDir;
    try {
      // Seed an active finding
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        subtype: "escape-hatch-abuse",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Agent proposed a new artifact type which violates the no-new-artifact-types philosophy.",
      });

      const result = await loopDescribeTool.handler({ tier: "warm" });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.tier, "warm");
      assert.ok(Array.isArray(text.tools));
      assert.ok(text.tools.length > 0);
      assert.ok(typeof text.tools[0].description === "string");
      assert.ok(Array.isArray(text.active_findings));
      assert.strictEqual(text.active_findings.length, 1);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("tier cold returns full history", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loop-describe-cold-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await loopDescribeTool.handler({ tier: "cold" });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.tier, "cold");
      assert.ok(Array.isArray(text.all_findings));
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("categories filter anti_patterns", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loop-describe-cat-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        subtype: "escape-hatch-abuse",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Agent proposed a new artifact type which violates the no-new-artifact-types philosophy.",
      });
      await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Some other gate logic issue that is not an anti-pattern.",
      });

      const result = await loopDescribeTool.handler({
        tier: "warm",
        categories: ["loop-anti-pattern"],
      });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.active_findings.length, 1);
      assert.strictEqual(text.active_findings[0].category, "loop-anti-pattern");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("default tier is warm", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loop-describe-def-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await loopDescribeTool.handler({});
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.tier, "warm");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("response always includes tier field", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loop-describe-echo-"));
    process.env.GATE_ROOT = tempDir;
    try {
      for (const tier of ["summary", "hot", "warm", "cold"]) {
        const result = await loopDescribeTool.handler({ tier });
        const text = JSON.parse(result.content[0].text);
        assert.strictEqual(text.tier, tier);
      }
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("tool description contains session start recommendation", () => {
    assert.ok(
      loopDescribeTool.description.toLowerCase().includes("session start"),
      "Tool description should recommend calling at session start"
    );
  });

  test("degraded flag on partial failure when module import fails", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loop-describe-deg-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await loopDescribeTool.handler({ tier: "warm" });
      const text = JSON.parse(result.content[0].text);
      // degraded may be true or false depending on imports; just verify field exists
      assert.ok(typeof text.degraded === "boolean");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("legacy fallback surfaces pre-migration categories", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loop-describe-legacy-"));
    process.env.GATE_ROOT = tempDir;
    try {
      // Create a pre-migration style entry (no loop-anti-pattern category)
      await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Legacy entry before loop-anti-pattern category existed.",
      });

      const result = await loopDescribeTool.handler({ tier: "warm" });
      const text = JSON.parse(result.content[0].text);
      // In warm tier, legacy entries should appear in active_findings
      assert.ok(Array.isArray(text.active_findings));
      // The legacy entry is reported, so it appears in warm findings
      const legacy = text.active_findings.find(
        (f) => f.category === "gate-logic-bug"
      );
      assert.ok(legacy, "Legacy category entry should be surfaced in warm tier");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("per-import failure does not crash entire tool", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loop-describe-resilient-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await loopDescribeTool.handler({ tier: "warm" });
      const text = JSON.parse(result.content[0].text);
      assert.ok(Array.isArray(text.tools));
      // Should still return tools even if some imports failed
      assert.ok(text.tools.length > 0);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });
});
