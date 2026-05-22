import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function createTmpDir() {
  return mkdtempSync(join(tmpdir(), "preflight-mcp-test-"));
}

async function startServer(root) {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["tools/constraint-gate/server.js"],
    env: { ...process.env, GATE_ROOT: root },
  });
  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(transport);
  return { client, transport };
}

describe("mark_preflight_complete MCP tool", () => {
  const tmp = createTmpDir();
  let client, transport;

  before(async () => {
    mkdirSync(join(tmp, "records", "observations"), { recursive: true });
    mkdirSync(join(tmp, ".claude", "coordination"), { recursive: true });
    const server = await startServer(tmp);
    client = server.client;
    transport = server.transport;
  });

  after(async () => {
    await transport.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it("creates a preflight marker file on disk", async () => {
    const result = await client.callTool({
      name: "mark_preflight_complete",
      arguments: { surface: "product" },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.marked, true);
    assert.equal(parsed.surface, "product");
    assert.ok(parsed.completed_at);

    // Verify marker file exists
    const markerPath = join(tmp, ".claude", "coordination", ".loop-preflight-product");
    assert.ok(existsSync(markerPath), "marker file should exist on disk");

    // Verify content
    const content = JSON.parse(readFileSync(markerPath, "utf8"));
    assert.equal(content.surface, "product");
    assert.ok(content.completed_at);
  });

  it("returns ttl_minutes of 30 in response", async () => {
    const result = await client.callTool({
      name: "mark_preflight_complete",
      arguments: { surface: "product" },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.ttl_minutes, 30);
  });

  it("refreshes marker on repeated calls", async () => {
    const first = await client.callTool({
      name: "mark_preflight_complete",
      arguments: { surface: "product" },
    });
    const firstParsed = JSON.parse(first.content[0].text);
    const firstTime = new Date(firstParsed.completed_at).getTime();

    // Small delay
    await new Promise((r) => setTimeout(r, 50));

    const second = await client.callTool({
      name: "mark_preflight_complete",
      arguments: { surface: "product" },
    });
    const secondParsed = JSON.parse(second.content[0].text);
    const secondTime = new Date(secondParsed.completed_at).getTime();

    assert.ok(secondTime >= firstTime, "refreshed marker should have same or newer timestamp");
  });

  it("server lists 32 tools including mark_preflight_complete", async () => {
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    assert.ok(names.includes("mark_preflight_complete"), "Missing mark_preflight_complete");
    assert.equal(names.length, 32, `Expected 32 tools, got ${names.length}`);
  });

  it("supports different surfaces independently", async () => {
    await client.callTool({
      name: "mark_preflight_complete",
      arguments: { surface: "api" },
    });

    const markerPath = join(tmp, ".claude", "coordination", ".loop-preflight-api");
    assert.ok(existsSync(markerPath), "api marker file should exist");

    const content = JSON.parse(readFileSync(markerPath, "utf8"));
    assert.equal(content.surface, "api");

    // Product marker should still exist from earlier test
    const productMarkerPath = join(tmp, ".claude", "coordination", ".loop-preflight-product");
    assert.ok(existsSync(productMarkerPath), "product marker should still exist");
  });
});
