// Re-anchorable residue measurement. Boots the canonical MCP server with NO
// env flags, returns { count, allToolsBytes, names } for the live `listTools`
// residue. The wire-budget ceiling (mcp-wire-budget.test.js) is anchored to
// this figure so the ceiling is reproducible instead of an unverifiable
// literal. Run standalone to print the measurement:
//   node tools/learning-loop-mastra/__tests__/helpers/measure-residue.mjs
import { connectMcpServer, prepareTempRoot } from "../with-mcp-server.js";
import { resolve } from "node:path";

export async function measureResidue() {
  const tempRoot = prepareTempRoot();
  const handles = await connectMcpServer(
    resolve("tools/learning-loop-mastra/mastra/server.js"),
    tempRoot,
    {},
  );
  try {
    const tools = await handles.listTools();
    const names = tools.map((t) => t.name).sort();
    const allToolsBytes = Buffer.byteLength(JSON.stringify(tools));
    return { count: names.length, allToolsBytes, names };
  } finally {
    await handles.cleanup();
  }
}

// Standalone CLI entry (used by operators to re-anchor the ceiling).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const result = await measureResidue();
  console.log(JSON.stringify(result, null, 2));
}
