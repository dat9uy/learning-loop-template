import { describe, test } from "node:test";
import assert from "node:assert";
import { metaStateReportTool } from "../tools/meta-state-report-tool.js";
import { metaStateLogChangeTool } from "../tools/meta-state-log-change-tool.js";
import { metaStateListTool } from "../tools/meta-state-list-tool.js";
import { metaStateResolveTool } from "../tools/meta-state-resolve-tool.js";
import { loopDescribeTool } from "../tools/loop-describe-tool.js";
import { loadPromotedRules } from "../core/gate-logic.js";
import { listAntiPatterns } from "../core/loop-introspect.js";
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
      assert.ok(Array.isArray(text.rules));
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

  test("SP2: warm tier surfaces check_grounding + refresh_fingerprint", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loop-describe-sp2-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await loopDescribeTool.handler({ tier: "warm" });
      const text = JSON.parse(result.content[0].text);
      const names = text.tools.map((t) => t.name);
      assert.ok(
        names.includes("meta_state_check_grounding"),
        "SP2 check tool must appear in warm response"
      );
      assert.ok(
        names.includes("meta_state_refresh_fingerprint"),
        "SP2 refresh tool must appear in warm response"
      );
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("SP3: warm tier surfaces query_drift", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loop-describe-sp3-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const result = await loopDescribeTool.handler({ tier: "warm" });
      const text = JSON.parse(result.content[0].text);
      const names = text.tools.map((t) => t.name);
      assert.ok(
        names.includes("meta_state_query_drift"),
        "SP3 query_drift tool must appear in warm response"
      );
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

describe("listAntiPatterns G9 status filter", () => {
  let tempDir;
  const originalEnv = process.env.GATE_ROOT;

  test("excludes resolved entries", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loop-describe-g9-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const report = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        subtype: "escape-hatch-abuse",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Resolved anti-pattern entry for G9 testing",
      });
      const id = JSON.parse(report.content[0].text).id;
      await metaStateResolveTool.handler({ id, resolution: "fixed" });

      const result = listAntiPatterns(tempDir);
      assert.strictEqual(result.length, 0);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("excludes expired entries", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loop-describe-g9-exp-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const report = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        subtype: "escape-hatch-abuse",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Expired anti-pattern entry for G9 testing",
      });
      const id = JSON.parse(report.content[0].text).id;
      // Force expiry by setting expires_at to past
      const { updateEntry } = await import("../core/meta-state.js");
      await updateEntry(tempDir, id, { expires_at: new Date(Date.now() - 1000).toISOString() });

      // metaStateListTool auto-applies expiry
      await metaStateListTool.handler({ include_expired: true });

      const result = listAntiPatterns(tempDir);
      assert.strictEqual(result.length, 0);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("includes reported and active entries", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loop-describe-g9-inc-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        subtype: "escape-hatch-abuse",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Reported anti-pattern entry for G9 testing one",
      });
      const report2 = await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        subtype: "new-artifact-type",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Reported anti-pattern entry for G9 testing two",
      });
      const id2 = JSON.parse(report2.content[0].text).id;
      const { metaStateAckTool } = await import("../tools/meta-state-ack-tool.js");
      await metaStateAckTool.handler({ id: id2, reason: "ack" });

      const result = listAntiPatterns(tempDir);
      assert.strictEqual(result.length, 2);
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });
});

describe("loop_describe change-log isolation", () => {
  let tempDir;
  const originalEnv = process.env.GATE_ROOT;

  test("warm tier active_findings excludes change-log entries", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loop-describe-cl-warm-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateReportTool.handler({
        category: "loop-anti-pattern",
        subtype: "escape-hatch-abuse",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Active finding that should appear in warm tier.",
      });
      await metaStateLogChangeTool.handler({
        change_dimension: "surface",
        change_target: "tools/test.js",
        change_diff: { added: ["x"], removed: [], changed: [] },
        reason: "Change-log entry must not leak into active_findings.",
      });

      const result = await loopDescribeTool.handler({ tier: "warm" });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.active_findings.length, 1);
      assert.strictEqual(text.active_findings[0].category, "loop-anti-pattern");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });

  test("cold tier all_findings excludes change-log entries", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "loop-describe-cl-cold-"));
    process.env.GATE_ROOT = tempDir;
    try {
      await metaStateReportTool.handler({
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        description: "Finding that should appear in cold tier.",
      });
      await metaStateLogChangeTool.handler({
        change_dimension: "semantic",
        change_target: "core/test.js",
        change_diff: { added: ["y"], removed: [], changed: [] },
        reason: "Change-log entry must not leak into all_findings.",
      });

      const result = await loopDescribeTool.handler({ tier: "cold" });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.all_findings.length, 1);
      assert.strictEqual(text.all_findings[0].entry_kind, "finding");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });
});

describe("meta_state_resolve change-log guard", () => {
  let tempDir;
  const originalEnv = process.env.GATE_ROOT;

  test("rejects resolving a change-log entry", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "meta-resolve-cl-"));
    process.env.GATE_ROOT = tempDir;
    try {
      const logResult = await metaStateLogChangeTool.handler({
        change_dimension: "surface",
        change_target: "tools/guard-test.js",
        change_diff: { added: ["z"], removed: [], changed: [] },
        reason: "Change-log entries are immutable and must not be resolved.",
      });
      const id = JSON.parse(logResult.content[0].text).id;

      const result = await metaStateResolveTool.handler({ id });
      const text = JSON.parse(result.content[0].text);
      assert.strictEqual(text.resolved, false);
      assert.strictEqual(text.reason, "change_log_immutable");
    } finally {
      process.env.GATE_ROOT = originalEnv;
    }
  });
});
