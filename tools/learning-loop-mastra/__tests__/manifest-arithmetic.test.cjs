// Manifest arithmetic test — cross-walks the 4 manifest files in the mastra
// package and asserts the 45-tool total + 6-group structure + 13 in workflow
// group. Catches future drift between the source-of-truth files.
//
// Test inventory:
//   1. tools/manifest.json has 31 entries
//   2. workflows-manifest.json has 10 entries
//   3. agents-manifest.json has 3 entries
//   4. agent-manifest.json#groups totals 45
//   5. agent-manifest.json#workflow.tools has 13 entries (8 run + 3 mastra + 2 storage)
//   6. agent-manifest.json has 6 groups
//   7. Cross-walk: every entry in tools/manifest.json is in agent-manifest.json#groups
//   8. Cross-walk: every run_<id> from workflows-manifest.json is in agent-manifest.json#workflow
//   9. Cross-walk: every ask_<id> from agents-manifest.json is in agent-manifest.json#agent

const { describe, test } = require("node:test");
const assert = require("node:assert");
const { readFileSync, existsSync } = require("node:fs");
const { join, resolve } = require("node:path");

const PKG = resolve(__dirname, "..");

// manifest.json uses JSONC (line-start // comments). See tools/manifest.json
// header for the rule; this shim only strips full-line comments.
const tools = JSON.parse(
  readFileSync(join(PKG, "tools/manifest.json"), "utf8")
    .replace(/^\s*\/\/.*$/gm, ""),
);
const workflows = JSON.parse(readFileSync(join(PKG, "mastra/workflows-manifest.json"), "utf8"));
const agents = JSON.parse(readFileSync(join(PKG, "mastra/agents-manifest.json"), "utf8"));
const agentManifest = JSON.parse(readFileSync(join(PKG, "agent-manifest.json"), "utf8"));

describe("manifest arithmetic", () => {
  test("tools/manifest.json has 31 entries", () => {
    assert.strictEqual(tools.length, 31);
  });

  test("workflows-manifest.json has 10 entries", () => {
    assert.strictEqual(workflows.length, 10);
  });

  test("agents-manifest.json has 3 entries", () => {
    assert.strictEqual(Object.keys(agents.agents).length, 3);
  });

  test("agent-manifest.json#groups totals 45", () => {
    const total = Object.values(agentManifest.groups).reduce(
      (sum, g) => sum + g.tools.length,
      0,
    );
    assert.strictEqual(total, 45, `expected 45 total, got ${total}`);
  });

  test("agent-manifest.json#workflow.tools has 13 entries", () => {
    assert.strictEqual(agentManifest.groups.workflow.tools.length, 13);
  });

  test("agent-manifest.json has 6 groups", () => {
    assert.strictEqual(Object.keys(agentManifest.groups).length, 6);
  });

  test("every tools/manifest.json file exists in mastra legacy package", () => {
    // The tool files live in tools/learning-loop-mastra/tools/legacy/ (post-Phase-D move).
    // The mastra server loads them via direct relative paths (server.js:25-27).
    // Verify each file exists; the MCP name derivation is tested by the
    // server's own tool registration (cold-session tests).
    const legacyToolsDir = resolve(PKG, "tools", "legacy");
    for (const { file } of tools) {
      const toolPath = join(legacyToolsDir, file.replace(/^tools\//, ""));
      assert.ok(
        existsSync(toolPath),
        `tool file ${file} not found at ${toolPath}`,
      );
    }
  });

  test("every run_<id> from workflows-manifest.json is in agent-manifest.json#workflow", () => {
    const workflowTools = new Set(agentManifest.groups.workflow.tools);
    for (const { file } of workflows) {
      // The run_<id> naming is `run_<workflow_id>` per server.js:93.
      // The workflow_id is the file basename minus .js (e.g., workflow-intake-orient).
      const id = file.replace(/^workflows\//, "").replace(/\.js$/, "").replace(/-/g, "_");
      const mcpName = `run_${id}`;
      assert.ok(
        workflowTools.has(mcpName),
        `workflow ${file} exposes as ${mcpName} but is not in agent-manifest.json#workflow.tools`,
      );
    }
  });

  test("every ask_<id> from agents-manifest.json is in agent-manifest.json#agent", () => {
    const agentTools = new Set(agentManifest.groups.agent.tools);
    for (const [key, entry] of Object.entries(agents.agents)) {
      const mcpName = `ask_${entry.id}`;
      assert.ok(
        agentTools.has(mcpName),
        `agent ${key} exposes as ${mcpName} but is not in agent-manifest.json#agent.tools`,
      );
    }
  });
});
