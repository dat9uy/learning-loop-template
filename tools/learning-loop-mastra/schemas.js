// Re-export legacy tool configs used by the Mastra peer server.
// These schemas are the single source of truth; the Mastra factory only wraps them.
export { metaStateProposeDesignTool } from "#mcp/tools/meta-state-propose-design-tool.js";
export { metaStatePatchTool } from "#mcp/tools/meta-state-patch-tool.js";
export { metaStateReportTool } from "#mcp/tools/meta-state-report-tool.js";
