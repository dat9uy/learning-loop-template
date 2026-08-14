// Manifest arithmetic test — cross-walks the 4 manifest files in the mastra
// package and asserts the total-tools + group count + workflow-tools size.
// Catches future drift between the source-of-truth files.
//
// Expected sizes are centralised in ./helpers/manifest-constants.cjs (single
// source of truth shared with cold-session-enumerate-mastra and the
// integration/cold-session-discoverability plus current MCP E2E coverage
// tests — all of which were previously drifting independently).
//
// Test inventory:
//   1. tools/manifest.json has TOOLS_MANIFEST_ENTRIES entries (was 31; meta_state_ship_loop_design added in plan 260712-0724 Fix A)
//   2. workflows-manifest.json has 8 entries
//   3. agents-manifest.json has 3 entries
//   4. agent-manifest.json#groups totals AGENT_MANIFEST_TOTAL_TOOLS
//   5. agent-manifest.json#workflow.tools has WORKFLOW_GROUP_TOOLS entries (6 run + 3 mastra + 2 storage)
//   6. agent-manifest.json has AGENT_MANIFEST_GROUPS groups
//   7. Cross-walk: every entry in tools/manifest.json is in agent-manifest.json#groups
//   8. Cross-walk: every run_<id> from workflows-manifest.json is in agent-manifest.json#workflow
//   9. Cross-walk: every ask_<id> from agents-manifest.json is in agent-manifest.json#agent

const assert = require("node:assert");
const { readFileSync, existsSync } = require("node:fs");
const { join, resolve } = require("node:path");
const {
  AGENT_MANIFEST_TOTAL_TOOLS,
  AGENT_MANIFEST_GROUPS,
  TOOLS_MANIFEST_ENTRIES,
  WORKFLOW_GROUP_TOOLS,
  CLI_TOTAL_TOOLS,
} = require("./helpers/manifest-constants.cjs");

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
  test(`tools/manifest.json has ${TOOLS_MANIFEST_ENTRIES} entries (was 31; meta_state_ship_loop_design added in plan 260712-0724 Fix A)`, () => {
    assert.strictEqual(tools.length, TOOLS_MANIFEST_ENTRIES);
  });

  test("workflows-manifest.json has 2 entries", () => {
    assert.strictEqual(workflows.length, 2);
  });

  test("agents-manifest.json has 3 entries", () => {
    assert.strictEqual(Object.keys(agents.agents).length, 3);
  });

  test(`agent-manifest.json#groups totals ${AGENT_MANIFEST_TOTAL_TOOLS} (was 43; meta_state_ship_loop_design added in plan 260712-0724 Fix A)`, () => {
    const total = Object.values(agentManifest.groups).reduce(
      (sum, g) => sum + g.tools.length,
      0,
    );
    assert.strictEqual(total, AGENT_MANIFEST_TOTAL_TOOLS,
      `expected ${AGENT_MANIFEST_TOTAL_TOOLS} total, got ${total}`);
  });

  test(`agent-manifest.json#workflow.tools has ${WORKFLOW_GROUP_TOOLS} entries`, () => {
    assert.strictEqual(agentManifest.groups.workflow.tools.length, WORKFLOW_GROUP_TOOLS);
  });

  test(`agent-manifest.json has ${AGENT_MANIFEST_GROUPS} groups`, () => {
    assert.strictEqual(Object.keys(agentManifest.groups).length, AGENT_MANIFEST_GROUPS);
  });

  test("every tools/manifest.json file exists in mastra legacy package", () => {
    // The tool files live in tools/learning-loop-mastra/tools/handlers/ (post-Phase-D move).
    // The mastra server loads them via direct relative paths (server.js:25-27).
    // Verify each file exists; the MCP name derivation is tested by the
    // server's own tool registration (cold-session tests).
    const legacyToolsDir = resolve(PKG, "tools", "handlers");
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
      // The workflow_id is the file basename minus .js (e.g., workflow-classify-prompt).
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

  // Computed crosswalk (not literal): 44 handler-manifest entries = 42 CLI
  // tools + 2 manifest-only residue handlers. The 50-entry agent declaration
  // is a SEPARATE contract — it includes workflows + agents + allowlist etc.
  test(`handler manifest partitions into ${CLI_TOTAL_TOOLS} CLI tools + 2 manifest-only residue (44 total)`, async () => {
    const { CLI_TOOLS } = await import("../core/cli-tools.js");
    assert.strictEqual(CLI_TOOLS.size, CLI_TOTAL_TOOLS,
      `CLI_TOOLS must have ${CLI_TOTAL_TOOLS} entries, got ${CLI_TOOLS.size}`);
    const { resolveToolImportUrl } = await import("../core/manifest-loader.js");
    let manifestResidue = 0;
    for (const entry of tools) {
      const mod = await import(resolveToolImportUrl(entry.file));
      const tool = mod[entry.export];
      if (tool?.name && !CLI_TOOLS.has(tool.name)) manifestResidue++;
    }
    assert.strictEqual(
      manifestResidue,
      2,
      `exactly 2 manifest-only residue handlers may be outside CLI_TOOLS (check_runtime_agnostic, workflow_generate_prompt), got ${manifestResidue}`,
    );
    assert.strictEqual(
      tools.length,
      CLI_TOOLS.size + manifestResidue,
      `44 manifest entries must equal ${CLI_TOOLS.size} CLI + ${manifestResidue} residue`,
    );
  });
});
