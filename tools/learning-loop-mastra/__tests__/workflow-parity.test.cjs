// Workflow parity harness — MCP-level integration test.
// Spawns the mastra server and asserts the tools/list surface composition.
// The 6 portable workflows were unwrapped to manifest handlers (their
// behavior coverage lives in workflow-unwrap-parity.test.js); only the 2
// storage workflows remain on the run_workflow_* surface. Live MCP carries
// the 8-tool residue: 2 run_workflow_storage_* + 3 ask_* + 3 mastra residue
// (update_r2_allowlist, check_runtime_agnostic, workflow_generate_prompt).

const assert = require("node:assert");
const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const { connectMcpServer } = require("./with-mcp-server.js");

const SERVER_ENTRY = resolve(__dirname, "..", "mastra", "server.js");

function makeTempRoot() {
  const tempRoot = mkdtempSync(join(tmpdir(), "workflow-mcp-parity-"));
  mkdirSync(join(tempRoot, "records", "meta", "index"), { recursive: true });
  mkdirSync(join(tempRoot, "records", "meta", "capabilities"), { recursive: true });
  mkdirSync(join(tempRoot, "records", "meta", "evidence"), { recursive: true });
  mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });
  writeFileSync(join(tempRoot, "runtime-state.jsonl"), "\n", { flag: "a" });
  return tempRoot;
}

function writeYaml(root, path, data) {
  const fullPath = join(root, path);
  const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, JSON.stringify(data, null, 2));
}

// Locked 2026-06-19 from empirical probe. Mastra MCPServer returns workflow
// results wrapped in the standard MCP content envelope (same as createTool).
// The with-mcp-server.js callTool helper already parses JSON.parse(content[0].text).
function parseWorkflowResult(rawResult) {
  return rawResult;
}

describe("workflow parity harness", () => {
  let handles;

  beforeAll(async () => {
    const tempRoot = makeTempRoot();
    handles = await connectMcpServer(SERVER_ENTRY, tempRoot);
  }, 15000);

  afterAll(async () => {
    if (handles) {
      await handles.cleanup();
      handles = null;
    }
  });

  test("tools/list exposes the 8-tool residue (3 mastra residue + 2 run_workflow_storage_* + 3 ask_*)", { timeout: 10000 }, async () => {
    const tools = await handles.listTools();
    const mastra = tools.filter((t) => t.name.startsWith("mastra_"));
    const runWorkflows = tools.filter((t) => t.name.startsWith("run_workflow_"));
    const askAgents = tools.filter((t) => t.name.startsWith("ask_"));
    // Live MCP residue: 3 mastra residue (update_r2_allowlist,
    // check_runtime_agnostic, workflow_generate_prompt) + 2 storage workflows
    // + 3 ask_* agents = 8. The 42-tool CLI allowlist is asserted by
    // cli-optout-wiring.test.js (loop.mjs list); the 44-entry handler manifest
    // and 50-entry agent declaration are asserted by manifest-arithmetic and
    // cold-session-enumerate-mastra respectively.
    assert.equal(mastra.length, 3, `must have 3 mastra_* residue tools, got ${mastra.length}`);
    assert.equal(runWorkflows.length, 2, `must have 2 run_workflow_storage_* tools, got ${runWorkflows.length}`);
    assert.equal(askAgents.length, 3, `must have 3 ask_* agent tools, got ${askAgents.length}`);
    assert.equal(tools.length, 8, `total must be 8, got ${tools.length}`);

    for (const wf of runWorkflows) {
      assert.ok(wf.description && wf.description.length > 0, `${wf.name} must have non-empty description`);
      assert.ok(wf.inputSchema && wf.inputSchema.type === "object", `${wf.name} must have object inputSchema`);
    }
  });
});
