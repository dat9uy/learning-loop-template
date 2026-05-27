#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, "learning-loop-mcp", "server.js");

const args = process.argv.slice(2);

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const capability = getArg("--capability");
const dimension = getArg("--dimension");
const status = getArg("--status");
const json = args.includes("--json");

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER],
  });
  const client = new Client({ name: "search-index-cli", version: "0.1.0" });
  await client.connect(transport);

  const result = await client.callTool({
    name: "index_search",
    arguments: { capability, dimension, status },
  });

  const text = result.content[0].text;
  const parsed = JSON.parse(text);

  if (json) {
    console.log(JSON.stringify(parsed, null, 2));
  } else {
    for (const r of parsed.results) {
      console.log(r.id);
    }
  }

  await transport.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("MCP client error:", err.message);
  process.exit(1);
});
