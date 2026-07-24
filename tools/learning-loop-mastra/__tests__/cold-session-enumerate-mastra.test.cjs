// Cold-session enumeration test — verifies that every tool declared in
// tools/learning-loop-mastra/agent-manifest.json is registered by the
// mastra MCP server, with valid name/description/inputSchema.
//
// This is the canonical cold-session discoverability test post-Phase-D.
// The legacy equivalent in tools/learning-loop-mcp/__tests__/cold-session-
// discoverability.test.cjs tests the same property but reads the wrong
// manifest; Phase 6 fixes it to read agent-manifest.json.

const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const {
  AGENT_MANIFEST_TOTAL_TOOLS,
  AGENT_MANIFEST_GROUPS,
} = require("./helpers/manifest-constants.cjs");

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const AGENT_MANIFEST_PATH = join(PROJECT_ROOT, "tools/learning-loop-mastra/agent-manifest.json");
const SERVER_ENTRY = join(PROJECT_ROOT, "tools/learning-loop-mastra/mastra/server.js");

/** Spawn the MCP server and return a connected Client + cleanup handle. */
async function spawnServer() {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");

  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_ENTRY],
    // Plan 5-Lite Phase 1: server.js pins LOOP_SURFACE at boot; the SDK's
    // default env inheritance is a safe subset that omits LOOP_SURFACE, so we
    // pass the full parent env explicitly.
    env: { ...process.env, LOOP_SURFACE: process.env.LOOP_SURFACE || ".claude" },
  });

  const client = new Client({ name: "cold-session-enumerate-mastra", version: "1.0.0" });
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

describe("cold-session enumerate mastra manifest", () => {
  let server;
  let tools;
  let byName;

  beforeAll(async () => {
    server = await spawnServer();
    const result = await server.client.listTools();
    tools = Array.isArray(result) ? result : result.tools;
    byName = new Map(tools.map((t) => [t.name, t]));
  }, 15000);

  afterAll(async () => {
    if (server) await server.cleanup();
  });

  const agentManifest = JSON.parse(readFileSync(AGENT_MANIFEST_PATH, "utf8"));
  const declaredTools = [];
  for (const [groupName, group] of Object.entries(agentManifest.groups)) {
    for (const name of group.tools) {
      declaredTools.push({ name, group: groupName });
    }
  }

  test(`agent-manifest.json declares ${AGENT_MANIFEST_TOTAL_TOOLS} tools across ${AGENT_MANIFEST_GROUPS} groups (was 44; runtime_state_pause/resume/stop added for the in-band tracking lifecycle)`, () => {
    assert.strictEqual(declaredTools.length, AGENT_MANIFEST_TOTAL_TOOLS,
      `expected ${AGENT_MANIFEST_TOTAL_TOOLS} tools in agent-manifest.json, got ${declaredTools.length}`);
    assert.strictEqual(Object.keys(agentManifest.groups).length, AGENT_MANIFEST_GROUPS,
      `expected ${AGENT_MANIFEST_GROUPS} groups in agent-manifest.json, got ${Object.keys(agentManifest.groups).length}`);
  });

  test(`server registers all ${AGENT_MANIFEST_TOTAL_TOOLS} declared tools`, () => {
    assert.strictEqual(tools.length, AGENT_MANIFEST_TOTAL_TOOLS,
      `server should expose ${AGENT_MANIFEST_TOTAL_TOOLS} tools, got ${tools.length}`);
  });

  test("every declared tool is registered", () => {
    for (const { name } of declaredTools) {
      assert.ok(byName.has(name),
        `MCP server does not register ${name} (declared in agent-manifest.json)`);
    }
  });

  test("no extra tools beyond declared", () => {
    const declared = new Set(declaredTools.map((t) => t.name));
    for (const t of tools) {
      assert.ok(declared.has(t.name),
        `MCP server exposes ${t.name} but it is not in agent-manifest.json`);
    }
  });

  test("every tool has valid name + description + inputSchema", () => {
    for (const t of tools) {
      assert.strictEqual(typeof t.name, "string", `${t.name}: name must be string`);
      assert.ok(t.name.length > 0, `tool name must be non-empty`);
      assert.strictEqual(typeof t.description, "string", `${t.name}: description must be string`);
      assert.ok(t.description.length > 0, `${t.name}: description must be non-empty`);
      // Backward-compat: accept both `inputSchema` (Mastra convention) and
      // `schema` (legacy convention). The existing cold-session test at
      // tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs
      // lines 91-94 uses this same dual check.
      const hasSchema = (typeof t.inputSchema === "object" && t.inputSchema !== null)
        || (typeof t.schema === "object" && t.schema !== null);
      assert.ok(hasSchema, `${t.name}: inputSchema or schema must be object`);
    }
  });
});
