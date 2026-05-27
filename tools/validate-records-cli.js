#!/usr/bin/env node
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, "learning-loop-mcp", "server.js");

const allowDisallowed = process.argv.includes("--allow-disallowed-fixtures");
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER],
  });
  const client = new Client({ name: "validate-cli", version: "0.1.0" });
  await client.connect(transport);

  const result = await client.callTool("index_validate", {
    allow_disallowed_fixtures: allowDisallowed,
    include_negative_fixtures: true,
  });

  const text = result.content[0].text;
  const parsed = JSON.parse(text);

  if (dryRun) {
    console.log(text);
  } else {
    if (parsed.errors.length) {
      for (const error of parsed.errors) {
        console.error(`- ${error.record}: ${error.message}`);
      }
    }
    if (parsed.warnings.length) {
      for (const warning of parsed.warnings) {
        console.error(`Warning: ${warning.record}: ${warning.message}`);
      }
    }
    console.log(`Validated ${parsed.record_count} records.`);
  }

  await transport.close();
  process.exit(parsed.valid ? 0 : 1);
}

main().catch((err) => {
  console.error("MCP client error:", err.message);
  process.exit(1);
});
