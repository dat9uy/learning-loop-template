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
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER],
  });
  const client = new Client({ name: "extract-index-cli", version: "0.1.0" });
  await client.connect(transport);

  const result = await client.callTool({
    name: "index_extract",
    arguments: { capability, dry_run: dryRun, verbose },
  });

  const text = result.content[0].text;
  const parsed = JSON.parse(text);

  const stats = parsed.stats || {};
  console.log(`Processed ${stats.filesProcessed || 0} evidence files`);
  console.log(`${stats.filesWithFindings || 0} files had ## Findings`);
  console.log(`${stats.entriesProduced || 0} index entries produced`);
  console.log(`${stats.written || 0} written, ${stats.unchanged || 0} unchanged`);

  if (verbose && parsed.skipped && parsed.skipped.length) {
    for (const s of parsed.skipped) console.warn(`Skipped: ${s}`);
  }

  if (parsed.errors && parsed.errors.length) {
    for (const err of parsed.errors) console.error(`Error: ${err}`);
    process.exit(1);
  }

  await transport.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("MCP client error:", err.message);
  process.exit(1);
});
