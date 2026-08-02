// Workflow parity harness — MCP-level integration test.
// Spawns the mastra server and asserts the tools/list surface composition.
// The 6 portable workflows were unwrapped to manifest handlers (their
// behavior coverage lives in workflow-unwrap-parity.test.js); only the 2
// storage workflows remain on the run_workflow_* surface.

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

  test("tools/list enumerates 45 mastra_* + 2 run_workflow_* = 47 mastra-and-workflow total (6 portable run_workflow_* unwrapped to mastra_workflow_* manifest handlers; storage stays Mastra; +1 for meta_state_unarchive; +1 for meta_state_accept)", { timeout: 10000 }, async () => {
    const tools = await handles.listTools();
    const mastra = tools.filter((t) => t.name.startsWith("mastra_"));
    const runWorkflows = tools.filter((t) => t.name.startsWith("run_workflow_"));
    assert.equal(mastra.length, 45, `must have 45 mastra_* tools (37 prior + 6 unwrapped portable-six + 1 meta_state_unarchive + 1 meta_state_accept), got ${mastra.length}`);
    assert.equal(runWorkflows.length, 2, `must have 2 run_workflow_* tools (storage only), got ${runWorkflows.length}`);
    assert.equal(tools.length, 50, `total must be 50 (45 mastra_* + 2 run_workflow_* + 3 ask_*), got ${tools.length}`);

    for (const wf of runWorkflows) {
      assert.ok(wf.description && wf.description.length > 0, `${wf.name} must have non-empty description`);
      assert.ok(wf.inputSchema && wf.inputSchema.type === "object", `${wf.name} must have object inputSchema`);
    }
  });
});
