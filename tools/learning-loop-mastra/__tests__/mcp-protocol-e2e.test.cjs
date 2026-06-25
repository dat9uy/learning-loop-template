// MCP protocol-level E2E test for the Mastra peer server.
//
// Mirrors tools/learning-loop-mcp/__tests__/mcp-protocol-e2e.test.cjs but points
// at the learning-loop server and its 29 deterministic tools.
//
// Note (2026-06-22, Plan 2 PR #8): two test relaxations from the original
// strict-`===` / `mastra_`-prefixed shape, both forced by Phase D Plan 1+2
// shipping the workflow tool surface alongside the deterministic tools:
//
//   1. `assert.ok(result.tools.length >= TOOL_COUNT)` (was `===`): the server
//      now registers 31 `mastra_*` + 10 `run_workflow_*` = 41 tools, but this
//      file's `TOOL_COUNT` is read from the 31-entry deterministic
//      `tools/manifest.json` (it does not include workflows). The exact 41-tool
//      count is enforced by `tools/learning-loop-mastra/__tests__/workflow-parity.test.cjs:159`.
//   2. The `startsWith("mastra_")` prefix check was removed: `run_workflow_*`
//      and `run_workflow_storage_*` tools don't have that prefix.
//
// These relaxations are scope-locked to the protocol-level shape test. The
// per-tool count and prefix invariants are checked by `workflow-parity.test.cjs`.

const { describe, test, before, after } = require("node:test");
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
  const TOOL_COUNT = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")).length;

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
    assert.ok(
      result.tools.length >= TOOL_COUNT,
      `expected at least ${TOOL_COUNT} tools, got ${result.tools.length}`,
    );

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

  test("tools/call loop_describe returns expected shape", { timeout: 10000 }, async () => {
    const result = await server.client.callTool({
      name: "mastra_loop_describe",
      arguments: { tier: "warm" },
    });

    assert.ok(Array.isArray(result.content), "response must have content array");
    assert.ok(result.content.length > 0, "content array must not be empty");

    const textItem = result.content.find((c) => c.type === "text");
    assert.ok(textItem, "content must contain a text item");
    assert.ok(textItem.text.includes("tools"), 'response must mention "tools"');
    assert.ok(
      textItem.text.includes("discoverability_hints"),
      'response must mention "discoverability_hints"',
    );
  });

  test("tools/call meta_state_list with compact returns valid response", { timeout: 10000 }, async () => {
    const result = await server.client.callTool({
      name: "mastra_meta_state_list",
      arguments: { compact: true },
    });

    assert.ok(Array.isArray(result.content), "response must have content array");
    const textItem = result.content.find((c) => c.type === "text");
    assert.ok(textItem, "content must contain a text item");
    const parsed = JSON.parse(textItem.text);
    assert.ok(
      typeof parsed === "object" && parsed !== null,
      "response must be a JSON object",
    );
    assert.ok(Array.isArray(parsed.entries), "response must have entries array");
    assert.ok(typeof parsed.count === "number", "response must have numeric count");
  });
});
