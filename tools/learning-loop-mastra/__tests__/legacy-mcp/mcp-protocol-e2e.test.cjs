// MCP protocol-level E2E test.
//
// Exercises the actual MCP wire protocol (JSON-RPC over stdio) using the
// @modelcontextprotocol/sdk Client. This replaces the flaky hand-rolled
// JSON-RPC test that was eliminated in the 260614 rewrite.
//
// Test inventory:
//   1. Server starts and responds to initialize — spawn server as child process,
//      connect via StdioClientTransport, assert successful handshake.
//   2. tools/list returns all manifest tools — verify count matches manifest.json,
//      each tool has name, description, inputSchema.
//   3. tools/call loop_describe returns expected shape — call with tier=warm,
//      assert response contains tools and discoverability_hints.
//   4. tools/call meta_state_list with compact returns valid response.

const { describe, test, before, after } = require("node:test");
const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const SERVER_ENTRY = join(PROJECT_ROOT, "tools/learning-loop-mastra/server.js");
const MANIFEST_PATH = join(PROJECT_ROOT, "tools/learning-loop-mastra/tools/manifest.json");

/** Spawn the MCP server and return a connected Client + cleanup handle. */
async function spawnServer() {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");

  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_ENTRY],
  });

  const client = new Client({ name: "e2e-test", version: "1.0.0" });
  await client.connect(transport);

  return {
    client,
    async cleanup() {
      try { await client.close(); } catch (e) {
        if (!e?.message?.includes("closed")) console.error("cleanup error:", e);
      }
    },
  };
}

describe("mcp protocol e2e", () => {
  // Shared server instance for all tests (avoids respawning per test).
  let server;
  const TOOL_COUNT = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")).length;

  // Server init in before() — if this fails, all tests abort at suite level.
  before(async () => {
    server = await spawnServer();
  });

  after(async () => {
    if (server) await server.cleanup();
  });

  test("server starts and responds to initialize", { timeout: 10000 }, async () => {
    assert.ok(server.client, "client must be defined after connect");
  });

  test("tools/list returns all manifest tools", { timeout: 10000 }, async () => {
    const result = await server.client.listTools();

    assert.ok(Array.isArray(result.tools), "result.tools must be an array");
    assert.ok(result.tools.length >= TOOL_COUNT,
      `expected >= ${TOOL_COUNT} tools, got ${result.tools.length} (workflow + agent additions OK)`);

    for (const tool of result.tools) {
      assert.strictEqual(typeof tool.name, "string", `tool must have string name`);
      assert.ok(tool.name.length > 0, `tool name must be non-empty`);
      assert.strictEqual(typeof tool.description, "string", `tool "${tool.name}" must have string description`);
      assert.ok(tool.description.length > 0, `tool "${tool.name}" description must be non-empty`);
      assert.ok(typeof tool.inputSchema === "object" && tool.inputSchema !== null,
        `tool "${tool.name}" must have object inputSchema`);
    }
  });

  test("tools/call loop_describe returns expected shape", { timeout: 10000 }, async () => {
    const result = await server.client.callTool({
      name: "mastra_loop_describe",
      arguments: { tier: "warm" },
    });

    assert.ok(Array.isArray(result.content), "response must have content array");
    assert.ok(result.content.length > 0, "content array must not be empty");

    // The first content item should be text containing key fields.
    const textItem = result.content.find((c) => c.type === "text");
    assert.ok(textItem, "content must contain a text item");
    assert.ok(textItem.text.includes("tools"), 'response must mention "tools"');
    assert.ok(textItem.text.includes("discoverability_hints"),
      'response must mention "discoverability_hints"');
  });

  test("tools/call meta_state_list with compact returns valid response", { timeout: 10000 }, async () => {
    const result = await server.client.callTool({
      name: "mastra_meta_state_list",
      arguments: { compact: true },
    });

    assert.ok(Array.isArray(result.content), "response must have content array");
    // meta_state_list returns JSON in a text item.
    const textItem = result.content.find((c) => c.type === "text");
    assert.ok(textItem, "content must contain a text item");
    // Should be valid JSON with entries array.
    const parsed = JSON.parse(textItem.text);
    assert.ok(typeof parsed === "object" && parsed !== null, "response must be a JSON object");
    assert.ok(Array.isArray(parsed.entries), "response must have entries array");
    assert.ok(typeof parsed.count === "number", "response must have numeric count");
  });
});
