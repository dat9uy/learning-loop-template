// MCP protocol-level E2E test.
//
// Exercises the actual MCP wire protocol (JSON-RPC over stdio) using the
// @modelcontextprotocol/sdk Client. This replaces the flaky hand-rolled
// JSON-RPC test that was eliminated in the 260614 rewrite.
//
// Single-surface contract: MCP registers only the 8-tool residue. The protocol
// shape assertions below exercise residue tools only (check_runtime_agnostic).
//
// Test inventory:
//   1. Server starts and responds to initialize — spawn server as child process,
//      connect via StdioClientTransport, assert successful handshake.
//   2. tools/list returns the residue with valid name/description/inputSchema.
//   3. tools/call check_runtime_agnostic returns expected shape.

const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

// Test file lives 4 levels deep under tools/learning-loop-mastra/__tests__/e2e/,
// so 4 `..` steps up from __dirname land at the repo root (matches ci-registry-deltas.test.cjs).
const PROJECT_ROOT = resolve(__dirname, "..", "..", "..", "..");
const SERVER_ENTRY = join(PROJECT_ROOT, "tools/learning-loop-mastra/mastra/server.js");
const MANIFEST_PATH = join(PROJECT_ROOT, "tools/learning-loop-mastra/tools/manifest.json");

/** Spawn the MCP server and return a connected Client + cleanup handle. */
async function spawnServer() {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");

  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_ENTRY],
    // Plan 5-Lite Phase 1: pass LOOP_SURFACE so server.js can pin the runtime
    // identity at boot (the SDK default env inheritance omits it).
    env: { ...process.env, LOOP_SURFACE: process.env.LOOP_SURFACE || ".claude" },
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
  // manifest.json is JSONC (line-start `//` comments per tools/manifest.json
  // header). Strip them before JSON.parse so this test stays in sync with the
  // 7 production consumers in core/loop-introspect.js, mastra/server.js, etc.
  const TOOL_COUNT = JSON.parse(
    readFileSync(MANIFEST_PATH, "utf8").replace(/^\s*\/\/.*$/gm, ""),
  ).length;

  // Server init in beforeAll() — if this fails, all tests abort at suite level.
  beforeAll(async () => {
    server = await spawnServer();
  });

  afterAll(async () => {
    if (server) await server.cleanup();
  });

  test("server starts and responds to initialize", { timeout: 10000 }, async () => {
    assert.ok(server.client, "client must be defined after connect");
  });

  test("tools/list returns the 8-tool residue with valid metadata", { timeout: 10000 }, async () => {
    const result = await server.client.listTools();

    assert.ok(Array.isArray(result.tools), "result.tools must be an array");
    // Exact 8-name residue asserted by cli-optout-wiring / cli-write-tool-set-drift.
    assert.ok(result.tools.length > 0, "tools/list must return at least the residue");

    for (const tool of result.tools) {
      assert.strictEqual(typeof tool.name, "string", `tool must have string name`);
      assert.ok(tool.name.length > 0, `tool name must be non-empty`);
      assert.strictEqual(typeof tool.description, "string", `tool "${tool.name}" must have string description`);
      assert.ok(tool.description.length > 0, `tool "${tool.name}" description must be non-empty`);
      assert.ok(typeof tool.inputSchema === "object" && tool.inputSchema !== null,
        `tool "${tool.name}" must have object inputSchema`);
    }
  });

  test("tools/call check_runtime_agnostic returns expected shape", { timeout: 10000 }, async () => {
    // Residue tool: exercises the MCP protocol envelope (JSON-RPC over stdio)
    // for a registered tool. check_runtime_agnostic takes a feature_path
    // relative to the project root.
    const result = await server.client.callTool({
      name: "mastra_check_runtime_agnostic",
      arguments: { feature_path: "tools/learning-loop-mastra/mastra/server.js" },
    });

    assert.ok(Array.isArray(result.content), "response must have content array");
    assert.ok(result.content.length > 0, "content array must not be empty");

    // The first content item should be text containing valid JSON.
    const textItem = result.content.find((c) => c.type === "text");
    assert.ok(textItem, "content must contain a text item");
    const parsed = JSON.parse(textItem.text);
    assert.ok(typeof parsed === "object" && parsed !== null, "response must be a JSON object");
  });
});
