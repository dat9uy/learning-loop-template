#!/usr/bin/env node
/**
 * Pre-closeout fingerprint refresh script.
 *
 * Calls meta_state_query_drift, then refreshes each hash_mismatch entry
 * via meta_state_refresh_fingerprint. Logs refreshed entries to stderr.
 * Exits 0 on success, 1 on MCP server unreachable.
 *
 * Usage: node tools/scripts/refresh-fingerprints-pre-closeout.mjs
 * Env: OPERATOR_MODE=1 (gated; script exits 1 if not set)
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, "..", "learning-loop-mastra", "mastra", "server.js");

async function main() {
  if (process.env.OPERATOR_MODE !== "1") {
    console.error("[refresh-fingerprints] OPERATOR_MODE=1 required");
    process.exit(1);
  }

  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_PATH],
    env: process.env,
  });
  const client = new Client({ name: "refresh-fingerprints", version: "1.0.0" }, { capabilities: {} });

  try {
    await client.connect(transport);
  } catch (err) {
    console.error(`[refresh-fingerprints] MCP server unreachable: ${err.message}`);
    process.exit(1);
  }

  try {
    const drift = await client.callTool({ name: "mastra_meta_state_query_drift", arguments: {} });
    const parsed = JSON.parse(drift.content[0].text);
    const entries = parsed.entries || [];
    const drifted = entries.filter((e) => e.drift_kind === "hash_mismatch");

    for (const entry of drifted) {
      await client.callTool({ name: "mastra_meta_state_refresh_fingerprint", arguments: { id: entry.id } });
      console.error(`[refresh] ${entry.id}`);
    }

    if (drifted.length === 0) {
      console.error("[refresh-fingerprints] no hash_mismatch entries to refresh");
    }
  } catch (err) {
    console.error(`[refresh-fingerprints] error: ${err.message}`);
    await client.close();
    process.exit(1);
  }

  await client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(`[refresh-fingerprints] fatal: ${err.message}`);
  process.exit(1);
});
