import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTool } from "./tool-registry.js";
import { gateTool } from "./tools/gate-tool.js";
import { recordObservationTool } from "./tools/record-observation-tool.js";
import { updateObservationTool } from "./tools/update-observation-tool.js";
import { notifyArtifactTool } from "./tools/notify-artifact-tool.js";
import { triggerWorkflowTool } from "./tools/trigger-workflow-tool.js";
import { validateRecordsTool } from "./tools/validate-records-tool.js";
import { updateClaimTool } from "./tools/update-claim-tool.js";
import { extractIndexTool } from "./tools/extract-index-tool.js";
import { searchIndexTool } from "./tools/search-index-tool.js";
import { generateCapabilitiesTool } from "./tools/generate-capabilities-tool.js";
import { listProbesTool } from "./tools/list-probes-tool.js";
import { listVerifiedTool } from "./tools/list-verified-tool.js";

const server = new McpServer({
  name: "constraint-gate",
  version: "1.0.0",
});

registerTool(server, gateTool);
registerTool(server, recordObservationTool);
registerTool(server, updateObservationTool);
registerTool(server, notifyArtifactTool);
registerTool(server, triggerWorkflowTool);
registerTool(server, validateRecordsTool);
registerTool(server, updateClaimTool);
registerTool(server, extractIndexTool);
registerTool(server, searchIndexTool);
registerTool(server, generateCapabilitiesTool);
registerTool(server, listProbesTool);
registerTool(server, listVerifiedTool);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("constraint-gate MCP server started");
