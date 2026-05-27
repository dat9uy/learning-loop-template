#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, "learning-loop-mcp", "server.js");

const args = process.argv.slice(2);

const stackIndex = args.indexOf("--stack");
const stack = stackIndex >= 0 ? args[stackIndex + 1] : null;
const json = args.includes("--json");

async function main() {
  if (!stack) {
    console.error("Usage: node list-probes-cli.js --stack <api|web> [--json]");
    process.exit(1);
  }

  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER],
  });
  const client = new Client({ name: "list-probes-cli", version: "0.1.0" });
  await client.connect(transport);

  const result = await client.callTool({
    name: "capability_list_probes",
    arguments: { stack },
  });

  const text = result.content[0].text;
  const parsed = JSON.parse(text);

  if (json) {
    console.log(JSON.stringify(parsed, null, 2));
  } else {
    for (const r of parsed.probes || []) {
      console.log(r.path);
    }
  }

  await transport.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("MCP client error:", err.message);
  process.exit(1);
});
