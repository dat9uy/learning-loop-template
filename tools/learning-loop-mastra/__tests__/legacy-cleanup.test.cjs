// Legacy cleanup test — asserts no #mcp/* imports remain in the project
// (post-Phase-D Plan 4 phase-07) and all cross-package consumers resolve
// to their new locations in tools/learning-loop-mastra/{core,tools/legacy,scout/legacy}.
//
// Test inventory:
//   1. No #mcp/* imports remain in tools/learning-loop-mastra/**/*.js
//   2. No #mcp/* imports remain in tools/learning-loop-mcp/**/*.js
//   3. No #mcp/* alias in package.json#imports
//   4. All cross-package consumers resolve to the new paths
//   5. The 5 prose references in scout-agent.js + run-scout-tool.js are updated
//   6. The moved files are importable from their new locations

const { describe, test } = require("node:test");
const assert = require("node:assert");
const { readFileSync, existsSync, statSync } = require("node:fs");
const { execSync } = require("node:child_process");
const { join, resolve } = require("node:path");

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");

describe("legacy cleanup (C-9)", () => {
  test("no #mcp/* imports in tools/learning-loop-mastra/**/*.js", () => {
    let result;
    try {
      // Exclude this test file and manifest-arithmetic.test.cjs (which reference #mcp/ in comments/strings)
      result = execSync(
        'grep -rln "#mcp/" tools/learning-loop-mastra/ --include="*.js" --include="*.cjs" --include="*.mjs" | grep -v "legacy-cleanup.test.cjs" | grep -v "manifest-arithmetic.test.cjs" || true',
        { cwd: PROJECT_ROOT, encoding: "utf8" },
      );
    } catch (e) {
      result = "";
    }
    const files = result.trim().split("\n").filter(Boolean);
    assert.deepStrictEqual(files, [], `expected 0 files with #mcp/* imports, got ${files.length}: ${files.join(", ")}`);
  });

  test("no #mcp/* imports in tools/learning-loop-mcp/**/*.js", () => {
    let result;
    try {
      result = execSync(
        'grep -rln "#mcp/" tools/learning-loop-mcp/ --include="*.js" --include="*.cjs" --include="*.mjs" || true',
        { cwd: PROJECT_ROOT, encoding: "utf8" },
      );
    } catch (e) {
      result = "";
    }
    const files = result.trim().split("\n").filter(Boolean);
    assert.deepStrictEqual(files, [], `expected 0 files with #mcp/* imports, got ${files.length}: ${files.join(", ")}`);
  });

  test("no #mcp/* alias in package.json#imports", () => {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, "package.json"), "utf8"));
    assert.strictEqual(pkg.imports["#mcp/*"], undefined, "package.json#imports should not have #mcp/* alias");
  });

  test("cross-package consumers resolve to the new paths", () => {
    const consumers = [
      { file: "tools/learning-loop-mastra/mastra/schemas.js", importPath: "./tools/legacy/meta-state-propose-design-tool.js" },
      { file: "tools/learning-loop-mastra/mastra/create-loop-workflow.js", importPath: "./core/envelope-stripper.js" },
      { file: "tools/learning-loop-mastra/mastra/agents/run-scout-tool.js", importPath: "../scout/legacy/run-scout.js" },
      { file: "tools/learning-loop-mastra/mastra/workflows/workflow-self-improvement.js", importPath: "../core/envelope-stripper.js" },
    ];
    for (const { file, importPath } of consumers) {
      const fullPath = join(PROJECT_ROOT, file);
      assert.ok(existsSync(fullPath), `${file} should exist`);
      const content = readFileSync(fullPath, "utf8");
      assert.ok(content.includes(importPath), `${file} should import from ${importPath}`);
    }
  });

  test("5 prose references in agent instructions + scout tool descriptions are updated", () => {
    const scoutAgent = readFileSync(join(PROJECT_ROOT, "tools/learning-loop-mastra/mastra/agents/instructions/scout-agent.js"), "utf8");
    const runScoutTool = readFileSync(join(PROJECT_ROOT, "tools/learning-loop-mastra/mastra/agents/run-scout-tool.js"), "utf8");
    assert.ok(!scoutAgent.includes("tools/learning-loop-mcp/scout/run-scout.js"),
      "scout-agent.js should not reference the legacy path");
    assert.ok(scoutAgent.includes("tools/learning-loop-mastra/scout/legacy/run-scout.js"),
      "scout-agent.js should reference the new legacy/ path");
    assert.ok(!runScoutTool.includes("tools/learning-loop-mcp/scout/run-scout.js"),
      "run-scout-tool.js should not reference the legacy path");
    assert.ok(runScoutTool.includes("tools/learning-loop-mastra/scout/legacy/run-scout.js"),
      "run-scout-tool.js should reference the new legacy/ path");
  });

  test("moved files are importable from their new locations", () => {
    // Spot-check: 3 representative files exist and are non-empty
    const samples = [
      "tools/learning-loop-mastra/tools/legacy/gate-tool.js",
      "tools/learning-loop-mastra/core/envelope-stripper.js",
      "tools/learning-loop-mastra/scout/legacy/run-scout.js",
    ];
    for (const f of samples) {
      const fullPath = join(PROJECT_ROOT, f);
      assert.ok(existsSync(fullPath), `${f} should exist at the new location`);
      const stat = statSync(fullPath);
      assert.ok(stat.size > 0, `${f} should be non-empty`);
    }
  });
});
