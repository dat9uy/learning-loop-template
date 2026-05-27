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

const system = getArg("--system");
const resource = getArg("--resource");
const allowActiveWindow = args.includes("--allow-active-window");

if (!system || !resource) {
  console.error("Usage: node check-budget-cli.js --system <system> --resource <resource> [--allow-active-window]");
  process.exit(2);
}

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER],
  });
  const client = new Client({ name: "check-budget-cli", version: "0.1.0" });
  await client.connect(transport);

  const result = await client.callTool({
    name: "budget_check",
    arguments: { system, resource, allow_active_window: allowActiveWindow },
  });

  const text = result.content[0].text;
  const parsed = JSON.parse(text);

  if (parsed.error) {
    console.error(parsed.error);
    await transport.close();
    process.exit(parsed.code || 2);
  }

  console.log(JSON.stringify(parsed));
  await transport.close();
  process.exit(parsed.code || 0);
}

main().catch((err) => {
  console.error("MCP client error:", err.message);
  process.exit(1);
});
