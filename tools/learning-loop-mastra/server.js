import { MCPServer } from "@mastra/mcp";
import { createLoopTool } from "./create-loop-tool.js";
import {
  metaStateProposeDesignTool,
  metaStatePatchTool,
  metaStateReportTool,
} from "./schemas.js";
import { adaptLegacyHandler } from "./legacy-handler-adapter.js";

// Phase 1 stub: 3 tools to prove the createLoopTool factory against all 4
// wire-format regression test files. Phase 2 expands this to the full 29-tool
// data-driven register loop.
const tools = {
  mastra_meta_state_propose_design: createLoopTool({
    id: "mastra_meta_state_propose_design",
    description: metaStateProposeDesignTool.description,
    inputSchema: metaStateProposeDesignTool.schema,
    execute: adaptLegacyHandler(metaStateProposeDesignTool),
  }),
  mastra_meta_state_patch: createLoopTool({
    id: "mastra_meta_state_patch",
    description: metaStatePatchTool.description,
    inputSchema: metaStatePatchTool.schema,
    execute: adaptLegacyHandler(metaStatePatchTool),
  }),
  mastra_meta_state_report: createLoopTool({
    id: "mastra_meta_state_report",
    description: metaStateReportTool.description,
    inputSchema: metaStateReportTool.schema,
    execute: adaptLegacyHandler(metaStateReportTool),
  }),
};

const server = new MCPServer({
  id: "learning-loop-mastra",
  name: "learning-loop-mastra",
  version: "0.1.0",
  description: "Mastra-based peer MCP server for the learning loop (Phase C Plan 1)",
  tools,
});

await server.startStdio();
