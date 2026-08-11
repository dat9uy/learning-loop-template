// Re-anchorable residue measurement: boots the canonical MCP server with NO
// env flags and prints the live `listTools` count + all-tools bytes. The
// wire-budget ceiling (mcp-wire-budget.test.js) is anchored to this figure so
// the ceiling is reproducible instead of an unverifiable literal.
import { connectMcpServer, prepareTempRoot } from "../with-mcp-server.js";
import { resolve } from "node:path";

const tempRoot = prepareTempRoot();
const handles = await connectMcpServer(
  resolve("tools/learning-loop-mastra/mastra/server.js"),
  tempRoot,
  {},
);
const tools = await handles.listTools();
const names = tools.map((t) => t.name).sort();
const bytes = Buffer.byteLength(JSON.stringify(tools));
console.log(JSON.stringify({ count: names.length, allToolsBytes: bytes, names }, null, 2));
await handles.cleanup();
