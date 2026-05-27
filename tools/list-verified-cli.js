#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, "learning-loop-mcp", "server.js");

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER],
  });
  const client = new Client({ name: "list-verified-cli", version: "0.1.0" });
  await client.connect(transport);

  const result = await client.callTool({
    name: "capability_list_verified",
    arguments: {},
  });

  const text = result.content[0].text;
  const parsed = JSON.parse(text);

  console.log("=== Verified Claims ===");
  for (const claim of parsed.claims || []) {
    console.log(`${claim.id} | ${claim.subject} | [${(claim.verified_dimensions || []).join(",")}]`);
  }
  console.log("");
  console.log("=== Supporting Evidence ===");
  for (const ev of parsed.evidence || []) {
    console.log(`${ev.path} | ${ev.capability}/${ev.dimension}/${ev.scope} | ${ev.status}`);
  }

  await transport.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("MCP client error:", err.message);
  process.exit(1);
});
