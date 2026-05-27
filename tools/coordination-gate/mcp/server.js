import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTool, safeImport } from "./tool-registry.js";
import { resolveRoot } from "../../lib/resolve-root.js";
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
  name: "coordination-gate",
  version: "1.0.0",
});

let registered = 0;
let failed = 0;

for (const mod of TOOL_MODULES) {
  const imported = await safeImport(mod.file, root);
  if (imported && imported[mod.export]) {
    registerTool(server, imported[mod.export]);
    registered++;
  } else {
    console.error(`safeImport: skipped ${mod.file} (missing export "${mod.export}")`);
    failed++;
  }
}

console.error(`coordination-gate: registered ${registered} of ${TOOL_MODULES.length} tools${failed > 0 ? ` (${failed} failed)` : ""}`);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("coordination-gate MCP server started");
