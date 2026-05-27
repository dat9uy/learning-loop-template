#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, "learning-loop-mcp", "server.js");

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER],
  });
  const client = new Client({ name: "generate-capabilities-cli", version: "0.1.0" });
  await client.connect(transport);

  const result = await client.callTool({
    name: "capability_generate",
    arguments: { dry_run: dryRun },
  });

  const text = result.content[0].text;
  const parsed = JSON.parse(text);

  if (dryRun) {
    console.log(text);
    const code = parsed.drift ? 1 : 0;
    await transport.close();
    process.exit(code);
  }

  if (parsed.error) {
    console.error(parsed.message);
    await transport.close();
    process.exit(1);
  }

  console.log("Capabilities generated.");
  await transport.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("MCP client error:", err.message);
  process.exit(1);
});
