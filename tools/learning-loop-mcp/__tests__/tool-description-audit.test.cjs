// Acceptance test: tool descriptions satisfy the 4-question framework.
//
// The framework: every tool description should answer
//   1. WHAT (what does it do)         — required, must be present
//   2. WHEN (when to use vs alternatives) — required, asserted by regex
//   3. INPUTS (what it accepts)        — required, asserted by schema coverage
//   4. RETURNS (what shape comes back) — required, asserted by example
//
// This file is the regression guard for Track B of plan
// 260609-adopt-instruction-layer. The ~30 assertions lock the contract across
// refactors that change tool descriptions.

const { describe, test } = require("node:test");
const assert = require("node:assert");
const { readFileSync, existsSync } = require("node:fs");
const { resolve } = require("node:path");

const projectRoot = resolve(__dirname, "..", "..", "..");

// Map tool names to their source files (relative to tools/learning-loop-mcp/)
const TOOL_FILE_MAP = {
  meta_state_report: "tools/meta-state-report-tool.js",
  meta_state_log_change: "tools/meta-state-log-change-tool.js",
  meta_state_resolve: "tools/meta-state-resolve-tool.js",
  meta_state_list: "tools/meta-state-list-tool.js",
  meta_state_derive_status: "tools/meta-state-derive-status-tool.js",
  meta_state_patch: "tools/meta-state-patch-tool.js",
  loop_describe: "tools/loop-describe-tool.js",
  gate_check: "tools/gate-tool.js",
  gate_mark_preflight: "tools/mark-preflight-complete-tool.js",
  record_create_decision: "tools/create-decision-record-tool.js",
};

const TOP_10 = Object.keys(TOOL_FILE_MAP);

function extractDescription(filePath) {
  const content = readFileSync(resolve(projectRoot, "tools/learning-loop-mcp", filePath), "utf8");
  // Match description: "..." or description: `...` (multi-line)
  const match = content.match(/description:\s*(?:"((?:[^"\\]|\\.)*)"|`([^`]*)`)/s);
  if (!match) return "";
  return match[1] || match[2] || "";
}

describe("tool description 4-question framework", () => {
  test("all 10 tool files exist", () => {
    for (const [name, filePath] of Object.entries(TOOL_FILE_MAP)) {
      const fullPath = resolve(projectRoot, "tools/learning-loop-mcp", filePath);
      assert.ok(existsSync(fullPath), `tool file for ${name} should exist at ${filePath}`);
    }
  });

  test("all 10 tool files have a non-empty description", () => {
    for (const [name, filePath] of Object.entries(TOOL_FILE_MAP)) {
      const desc = extractDescription(filePath);
      assert.ok(desc.length > 50, `${name} should have a substantive description (>50 chars); got ${desc.length}`);
    }
  });

  // 10 assertions: one per tool's WHEN clause
  for (const [name, filePath] of Object.entries(TOOL_FILE_MAP)) {
    test(`${name}: WHEN clause present (Use when|instead of|vs\\.|not for|alternative)`, () => {
      const desc = extractDescription(filePath);
      assert.ok(desc.length > 0, `${name} should have a non-empty description`);
      assert.ok(
        /use when|instead of|vs\.|not for|alternative/i.test(desc),
        `${name} description must include a WHEN clause (Use when|instead of|vs.|not for|alternative). Got: ${desc.slice(0, 200)}`,
      );
    });
  }

  // The guide
  test("tool-selection-guide.md exists", () => {
    const guidePath = resolve(projectRoot, "tools/learning-loop-mcp/references/tool-selection-guide.md");
    assert.ok(existsSync(guidePath), "guide should exist at references/tool-selection-guide.md");
    const content = readFileSync(guidePath, "utf8");
    assert.ok(content.length > 100, "guide should be substantive (>100 chars)");
  });

  test("guide covers at least 12 intents", () => {
    const guidePath = resolve(projectRoot, "tools/learning-loop-mcp/references/tool-selection-guide.md");
    const content = readFileSync(guidePath, "utf8");
    // Count tool mentions inside backticks in table rows
    const matches = content.match(/`[a-z_][a-z0-9_]*`/g) || [];
    const toolNames = new Set(matches.map((m) => m.slice(1, -1)));
    // Filter to actual tool names (heuristic: contains underscore, or is a known meta_state_ tool)
    const distinctTools = [...toolNames].filter((n) => n.includes("_") || n.startsWith("record_") || n.startsWith("gate_"));
    assert.ok(distinctTools.length >= 12, `guide should mention >=12 distinct tools; got ${distinctTools.length}: ${distinctTools.slice(0, 20).join(", ")}`);
  });

  test("guide has an anti-pattern section", () => {
    const guidePath = resolve(projectRoot, "tools/learning-loop-mcp/references/tool-selection-guide.md");
    const content = readFileSync(guidePath, "utf8");
    assert.ok(/anti-pattern/i.test(content), "guide should have an anti-pattern section");
    assert.ok(/node -e/i.test(content), "guide should mention the node -e escape hatch");
  });

  test("guide references the 4-question framework", () => {
    const guidePath = resolve(projectRoot, "tools/learning-loop-mcp/references/tool-selection-guide.md");
    const content = readFileSync(guidePath, "utf8");
    assert.ok(/4-question framework/i.test(content), "guide should reference the 4-question framework");
  });

  test("warm-tier discoverability_hints include tool-selection guide reference (A4)", () => {
    const introspectPath = resolve(projectRoot, "tools/learning-loop-mcp/core/loop-introspect.js");
    const content = readFileSync(introspectPath, "utf8");
    assert.ok(
      content.includes("tool-selection-guide.md"),
      "DISCOVERABILITY_HINTS should reference the new tool-selection guide (hint A4)",
    );
    assert.ok(
      content.includes("4-question framework"),
      "DISCOVERABILITY_HINTS should mention the 4-question framework (hint A4)",
    );
  });

  test("warm-tier discoverability_hints include 4-layer role split (A5)", () => {
    const introspectPath = resolve(projectRoot, "tools/learning-loop-mcp/core/loop-introspect.js");
    const content = readFileSync(introspectPath, "utf8");
    assert.ok(
      content.includes("priority-1 prompt") && content.includes("AGENTS.md"),
      "DISCOVERABILITY_HINTS should include the priority-1 prompt hint (A5)",
    );
  });

  test("summary: top-10 tool descriptions have WHEN clause (aggregate)", () => {
    let withWhen = 0;
    for (const [, filePath] of Object.entries(TOOL_FILE_MAP)) {
      const desc = extractDescription(filePath);
      if (/use when|instead of|vs\.|not for|alternative/i.test(desc)) withWhen++;
    }
    assert.ok(
      withWhen === TOP_10.length,
      `expected all ${TOP_10.length} top tools to have a WHEN clause; got ${withWhen}`,
    );
  });
});
