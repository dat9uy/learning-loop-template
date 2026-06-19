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

// TODO(phase-d-plan-1-phase-4): re-enable as createWorkflow
const WORKFLOW_FILES = new Set([
  "tools/workflow-intake-orient-tool.js",
  "tools/workflow-intake-plan-tool.js",
  "tools/workflow-classify-prompt-tool.js",
  "tools/workflow-prepare-runtime-request-tool.js",
  "tools/workflow-self-improvement-tool.js",
  "tools/workflow-intentional-skip-tool.js",
  "tools/workflow-report-phase-status-tool.js",
  "tools/workflow-runtime-probe-tool.js",
]);

for (const { file, export: exportName } of MANIFEST) {
  if (WORKFLOW_FILES.has(file)) continue;
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
    "Mastra-based canonical MCP server for the learning loop (Phase C Plan 3). 40 tools (5 gate + 11 workflow + 20 meta_state + 3 introspection + 1 runtime_agnostic) across 5 groups. Single server post-cut-over.",
  tools,
});

await server.startStdio();
