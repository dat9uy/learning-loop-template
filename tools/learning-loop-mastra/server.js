import { MCPServer } from "@mastra/mcp";
import { createLoopTool } from "./create-loop-tool.js";
import { adaptLegacyHandler } from "./legacy-handler-adapter.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST = JSON.parse(
  readFileSync(join(__dirname, "tools", "manifest.json"), "utf8"),
);

const PREFIX = "mastra_";
const tools = {};

for (const { file, export: exportName } of MANIFEST) {
  const mod = await import(`#mcp/${file}`);
  const legacy = mod[exportName];
  if (!legacy) {
    console.error(`skipped ${file} (missing export "${exportName}")`);
    continue;
  }
  const prefixed = PREFIX + legacy.name;
  tools[prefixed] = createLoopTool({
    id: prefixed,
    description: legacy.description,
    inputSchema: legacy.schema,
    execute: adaptLegacyHandler(legacy),
  });
}

console.error(`learning-loop-mastra: registered ${Object.keys(tools).length} of ${MANIFEST.length} tools`);

const server = new MCPServer({
  id: "learning-loop-mastra",
  name: "learning-loop-mastra",
  version: "0.1.0",
  description:
    "Mastra-based peer MCP server for the learning loop (Phase C Plan 1). 29 deterministic meta-surface tools (workflow tools excluded per Phase D).",
  tools,
});

await server.startStdio();
