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
const WORKFLOW_MANIFEST = JSON.parse(
  readFileSync(join(__dirname, "workflows-manifest.json"), "utf8"),
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

const workflows = {};
for (const { file, export: exportName } of WORKFLOW_MANIFEST) {
  const mod = await import(`./${file}`);
  const wf = mod[exportName];
  if (!wf) {
    console.error(`skipped ${file} (missing export "${exportName}")`);
    continue;
  }
  workflows[wf.id] = wf;
}

console.error(`learning-loop-mastra: registered ${Object.keys(tools).length} tools and ${Object.keys(workflows).length} workflows`);

const server = new MCPServer({
  id: "learning-loop-mastra",
  name: "learning-loop-mastra",
  version: "0.1.0",
  description:
    "Mastra-based canonical MCP server for the learning loop (Phase D Plan 1). 31 tools + 8 workflows across 5 groups. Single server post-cut-over.",
  tools,
  workflows,
});

await server.startStdio();
