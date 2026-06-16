import { MCPServer } from "@mastra/mcp";
import { createTool } from "@mastra/core/tools";

const stubTool = createTool({
  id: "mastra_stub",
  description: "Stub tool for Phase 0 boot verification. Replaced in Phase 2.",
  inputSchema: { type: "object", properties: {} },
  execute: async () => ({ ok: true }),
});

const server = new MCPServer({
  id: "learning-loop-mastra",
  name: "learning-loop-mastra",
  version: "0.1.0",
  description: "Mastra-based peer MCP server for the learning loop (Phase C Plan 1)",
  tools: { mastra_stub: stubTool },
});

await server.startStdio();
