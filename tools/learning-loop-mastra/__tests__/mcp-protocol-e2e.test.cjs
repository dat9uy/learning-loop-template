// MCP protocol-level E2E test for the Mastra peer server.
//
// Mirrors tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs but points
// at the learning-loop server and its residue surface.
//
// Single-surface contract: MCP registers only the 8-tool residue
// (3 ask_* agents + 2 run_workflow_storage_* + update_r2_allowlist +
// check_runtime_agnostic + workflow_generate_prompt). The CLI is the record
// surface. This file's protocol-shape assertions therefore exercise residue
// tools only; the 42-tool CLI allowlist, 44-entry handler manifest, and
// 50-entry agent declaration are separate contracts asserted elsewhere.

const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const SERVER_ENTRY = join(PROJECT_ROOT, "tools/learning-loop-mastra/mastra/server.js");
const MANIFEST_PATH = join(
  PROJECT_ROOT,
  "tools/learning-loop-mastra/tools/manifest.json",
);

/** Spawn the Mastra MCP server and return a connected Client + cleanup handle. */
async function spawnServer() {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/stdio.js"
  );

  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_ENTRY],
    // Plan 5-Lite Phase 1: server.js pins LOOP_SURFACE at boot; the SDK's
    // default env inheritance is a safe subset that omits LOOP_SURFACE, so we
    // pass the full parent env explicitly.
    env: { ...process.env, LOOP_SURFACE: process.env.LOOP_SURFACE || ".claude" },
  });

  const client = new Client({ name: "mastra-e2e-test", version: "1.0.0" });
  await client.connect(transport);

  return {
    client,
    async cleanup() {
      try {
        await client.close();
      } catch (e) {
        if (!e?.message?.includes("closed")) console.error("cleanup error:", e);
      }
    },
  };
}

describe("mastra mcp protocol e2e", () => {
  let server;
  // manifest.json uses JSONC (line-start // comments). See tools/manifest.json
  // header for the rule; this shim only strips full-line comments.
  const TOOL_COUNT = JSON.parse(
    readFileSync(MANIFEST_PATH, "utf8")
      .replace(/^\s*\/\/.*$/gm, ""),
  ).length;

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
    // The 8-tool residue is asserted exactly by cli-optout-wiring.test.js and
    // cli-write-tool-set-drift.test.js. Here we assert the protocol shape for
    // every registered tool (name/description/inputSchema) regardless of count.
    assert.ok(result.tools.length > 0, "tools/list must return at least the residue");

    for (const tool of result.tools) {
      assert.strictEqual(
        typeof tool.name,
        "string",
        `tool must have string name`,
      );
      assert.ok(tool.name.length > 0, `tool name must be non-empty`);
      assert.strictEqual(
        typeof tool.description,
        "string",
        `tool "${tool.name}" must have string description`,
      );
      assert.ok(
        tool.description.length > 0,
        `tool "${tool.name}" description must be non-empty`,
      );
      assert.ok(
        typeof tool.inputSchema === "object" && tool.inputSchema !== null,
        `tool "${tool.name}" must have object inputSchema`,
      );
    }
  });

  test("tools/list returns distinct tool names", { timeout: 10000 }, async () => {
    const result = await server.client.listTools();
    const names = result.tools.map((t) => t.name);
    assert.strictEqual(
      new Set(names).size,
      result.tools.length,
      "tool names must be distinct",
    );
  });

  test("tools/call check_runtime_agnostic returns expected protocol shape", { timeout: 10000 }, async () => {
    // check_runtime_agnostic is a residue tool; it exercises the MCP protocol
    // envelope (JSON-RPC over stdio) for a registered tool. Its schema takes a
    // feature_path relative to the project root.
    const result = await server.client.callTool({
      name: "mastra_check_runtime_agnostic",
      arguments: { feature_path: "tools/learning-loop-mastra/mastra/server.js" },
    });

    assert.ok(Array.isArray(result.content), "response must have content array");
    assert.ok(result.content.length > 0, "content array must not be empty");

    const textItem = result.content.find((c) => c.type === "text");
    assert.ok(textItem, "content must contain a text item");
    const parsed = JSON.parse(textItem.text);
    assert.ok(
      typeof parsed === "object" && parsed !== null,
      "response must be a JSON object",
    );
  });
});
