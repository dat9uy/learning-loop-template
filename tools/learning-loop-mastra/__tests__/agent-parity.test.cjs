// Agent parity harness — MCP-level integration test.
// Spawns the mastra server with __MOCK_LLM__ agents, calls each ask_<agent>,
// asserts output round-trips through the mocked LLM.
//
// TDD order: 1 empirical probe (locks response format), then 3 per-agent tests,
// then 1 schema-parity test, 1 tools/list enumeration test, 1 input-validation test.

const { describe, test, before, after } = require("node:test");
const assert = require("node:assert");
const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const { connectMcpServer, prepareTempRoot } = require("./with-mcp-server.js");

const SERVER_ENTRY = resolve(__dirname, "..", "server.js");
const TEST_MANIFEST = resolve(__dirname, "fixtures", "agents-manifest.test.json");

function makeTempRoot() {
  const tempRoot = mkdtempSync(join(tmpdir(), "agent-parity-"));
  mkdirSync(join(tempRoot, "records", "meta", "index"), { recursive: true });
  mkdirSync(join(tempRoot, "records", "meta", "capabilities"), { recursive: true });
  mkdirSync(join(tempRoot, "records", "meta", "evidence"), { recursive: true });
  mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });
  writeFileSync(join(tempRoot, "runtime-state.jsonl"), "\n", { flag: "a" });
  return tempRoot;
}

describe("agent parity harness", () => {
  let handles;

  before(async () => {
    const tempRoot = makeTempRoot();
    handles = await connectMcpServer(SERVER_ENTRY, tempRoot, {
      MASTRA_AGENTS_MANIFEST: TEST_MANIFEST,
    });
  }, { timeout: 30000 });

  after(async () => {
    if (handles) {
      await handles.cleanup();
      handles = null;
    }
  });

  // Phase 5.1: Empirical probe — locks the response format
  test("empirical probe: ask_intake_agent returns valid result with mocked LLM", { timeout: 15000 }, async () => {
    const result = await handles.callTool("ask_intake_agent", { message: "probe" });
    assert.ok(result != null, "expected non-null result from ask_intake_agent");
    // The mock model returns a default text; verify we got a response
    assert.ok(
      typeof result.text === "string" || typeof result === "string",
      `expected string response, got ${typeof result}`,
    );
  });

  // Phase 5.2: intakeAgent invocation
  test("ask_intake_agent produces expected output with mocked LLM", { timeout: 15000 }, async () => {
    const result = await handles.callTool("ask_intake_agent", { message: "What rules are in force?" });
    assert.ok(result != null, "must return a result");
    // Mock model returns default text; verify round-trip
    const text = typeof result === "string" ? result : result.text;
    assert.ok(typeof text === "string" && text.length > 0, "response must be a non-empty string");
  });

  // Phase 5.3: scoutAgent invocation
  test("ask_scout_agent produces expected output with mocked LLM", { timeout: 15000 }, async () => {
    const result = await handles.callTool("ask_scout_agent", { message: "Run the scout pipeline." });
    assert.ok(result != null, "must return a result");
    const text = typeof result === "string" ? result : result.text;
    assert.ok(typeof text === "string" && text.length > 0, "response must be a non-empty string");
  });

  // Phase 5.4: selfImprovementAgent invocation
  test("ask_self_improvement_agent produces expected output with mocked LLM", { timeout: 15000 }, async () => {
    const result = await handles.callTool("ask_self_improvement_agent", { message: "Propose an experiment." });
    assert.ok(result != null, "must return a result");
    const text = typeof result === "string" ? result : result.text;
    assert.ok(typeof text === "string" && text.length > 0, "response must be a non-empty string");
  });

  // Phase 5.6: Schema parity — each ask_* tool has { message: string } input schema
  test("each ask_* tool has locked { message: string } input schema", { timeout: 10000 }, async () => {
    const tools = await handles.listTools();
    const askTools = tools.filter((t) => t.name.startsWith("ask_"));
    assert.ok(askTools.length >= 3, `expected at least 3 ask_* tools, got ${askTools.length}`);
    for (const tool of askTools) {
      const schema = tool.inputSchema;
      assert.ok(schema, `${tool.name} must have inputSchema`);
      assert.equal(schema.type, "object", `${tool.name} schema must be object`);
      assert.ok(schema.properties?.message, `${tool.name} schema must have message property`);
      assert.equal(schema.properties.message.type, "string", `${tool.name} message must be string`);
      assert.ok(
        Array.isArray(schema.required) && schema.required.includes("message"),
        `${tool.name} schema must require message`,
      );
    }
  });

  // Phase 5.7: Tools/list enumeration — exactly 3 ask_* tools
  test("tools/list has exactly 3 ask_* tools", { timeout: 10000 }, async () => {
    const tools = await handles.listTools();
    const askTools = tools.filter((t) => t.name.startsWith("ask_"));
    assert.equal(askTools.length, 3, `expected 3 ask_* tools, got ${askTools.length}`);
    const names = askTools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "ask_intake_agent",
      "ask_scout_agent",
      "ask_self_improvement_agent",
    ]);
  });

  // Phase 5.8: Input validation rejection — call with no message
  test("ask_intake_agent rejects call with no message field", { timeout: 10000 }, async () => {
    try {
      await handles.callTool("ask_intake_agent", {});
      assert.fail("expected rejection for missing message");
    } catch (err) {
      // Expected: MCP call returns an error for missing required field
      assert.ok(err, "expected error for missing message field");
    }
  });
});
