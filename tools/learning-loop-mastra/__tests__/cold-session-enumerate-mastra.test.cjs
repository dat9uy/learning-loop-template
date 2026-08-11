// Cold-session enumeration test — verifies the agent-manifest declaration.
//
// The 50-entry agent-manifest.json is a SEPARATE contract from the live MCP
// surface (8-tool residue) and the CLI allowlist (42). It is the full
// declaration of every tool/workflow/agent the loop offers; it does NOT
// assert that the MCP server registers all 50 at once — MCP registers only
// the irreducible residue and the CLI is the record surface.
//
// This file asserts the declaration contract (50 tools across 6 groups) and
// that the live MCP residue is a subset of that declaration.

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

  beforeAll(async () => {
    server = await spawnServer();
    const result = await server.client.listTools();
    tools = Array.isArray(result) ? result : result.tools;
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

  test(`live MCP residue is a subset of the ${AGENT_MANIFEST_TOTAL_TOOLS}-tool declaration`, () => {
    // MCP registers only the 8-tool residue (single-surface contract); the
    // declaration remains the full 50-entry contract. Every residue tool must
    // be declared in agent-manifest.json.
    const declared = new Set(declaredTools.map((t) => t.name));
    assert.ok(tools.length > 0, "live MCP surface must expose at least the residue");
    for (const t of tools) {
      assert.ok(declared.has(t.name),
        `MCP server exposes ${t.name} but it is not declared in agent-manifest.json`);
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
