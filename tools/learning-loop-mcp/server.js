import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTool, safeImport, installWireFormatCoercion } from "./tool-registry.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolveRoot();
const __dirname = dirname(fileURLToPath(import.meta.url));

const MANIFEST_PATH = join(__dirname, "tools", "manifest.json");

function loadManifest() {
  try {
    const raw = readFileSync(MANIFEST_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

const TOOL_MODULES = loadManifest();

const server = new McpServer({
  name: "learning-loop-mcp",
  version: "1.0.0",
});

installWireFormatCoercion(server, root);

let registered = 0;
let failed = 0;

for (const mod of TOOL_MODULES) {
  const imported = await safeImport(mod.file, root);
  if (imported && imported[mod.export]) {
    registerTool(server, imported[mod.export], root);
    registered++;
  } else {
    console.error(`safeImport: skipped ${mod.file} (missing export "${mod.export}")`);
    failed++;
  }
}

console.error(`learning-loop-mcp: registered ${registered} of ${TOOL_MODULES.length} tools${failed > 0 ? ` (${failed} failed)` : ""}`);

const transport = new StdioServerTransport();
await server.connect(transport);

// Expose the live server handle for in-process reload. The
// meta_state_refresh_tools admin tool reads this to call
// `clearRegistrations(server)` and re-register tools after on-disk edits.
// Background: server.js does a one-shot import of all manifest modules at
// startup; once running, stdio child process holds handlers in memory and
// editing a tool file has zero effect on a live server. The reloader
// reaches into server._registeredTools to wipe state, then re-imports
// modules with ESM cache-bust query strings. See finding
// meta-260609T1028Z-mcp-server-tools-learning-loop-mcp-server-js-does-a-one-shot
// (subtype: mcp-server-stale-code, category: loop-anti-pattern).
globalThis.__loopMcpServer = server;

console.error("learning-loop-mcp MCP server started");
