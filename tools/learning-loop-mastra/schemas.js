// Re-export legacy tool configs used by the Mastra peer server.
// These schemas are the single source of truth; the Mastra factory only wraps them.
//
// Plan 3 cut-over note (C6, deferred from F8 red-team adjudication 2026-06-16):
// when C6 replaces the legacy @modelcontextprotocol/sdk McpServer with the Mastra
// MCPServer, these re-exports are the seams to migrate first. Each tool in
// tools/learning-loop-mcp/tools/ keeps `schema` (zod) + `handler` (function) as the
// contract; the mastra server imports them via #mcp/* and wraps via createLoopTool.
export { metaStateProposeDesignTool } from "#mcp/tools/meta-state-propose-design-tool.js";
export { metaStatePatchTool } from "#mcp/tools/meta-state-patch-tool.js";
export { metaStateReportTool } from "#mcp/tools/meta-state-report-tool.js";
