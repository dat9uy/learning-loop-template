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

function hasArg(flag) {
  return args.includes(flag);
}

function hasUpdateArgs() {
  return Boolean(
    hasArg("--apply") || getArg("--claim") || getArg("--dimension") || getArg("--status") || getArg("--reason")
  );
}

const claim = getArg("--claim");
const dimension = getArg("--dimension");
const status = getArg("--status");
const reason = getArg("--reason");
const scope = getArg("--scope");
const output = getArg("--output");
const apply = hasArg("--apply");

const proofRefs = [];
const decisionRefs = [];
const blockedActions = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--proof-ref" && i + 1 < args.length) proofRefs.push(args[++i]);
  if (args[i] === "--decision-ref" && i + 1 < args.length) decisionRefs.push(args[++i]);
  if (args[i] === "--blocked-action" && i + 1 < args.length) blockedActions.push(args[++i]);
}

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER],
  });
  const client = new Client({ name: "verify-claim-cli", version: "0.1.0" });
  await client.connect(transport);

  // Pre-validation
  const preResult = await client.callTool({
    name: "index_validate",
    arguments: { include_negative_fixtures: true },
  });
  const preParsed = JSON.parse(preResult.content[0].text);
  if (!preParsed.valid) {
    console.error("Pre-validation failed:");
    for (const err of preParsed.errors) console.error(`- ${err.record}: ${err.message}`);
    process.exit(1);
  }

  if (!hasUpdateArgs()) {
    console.log(`Validated ${preParsed.record_count} records.`);
    console.log("Dry run: no files changed");
    await transport.close();
    process.exit(0);
  }

  // Update claim
  const updateResult = await client.callTool({
    name: "index_update_claim",
    arguments: {
      claim_id: claim,
      dimension,
      status,
      reason,
      scope,
      output,
      proof_refs: proofRefs,
      decision_refs: decisionRefs,
      blocked_actions: blockedActions,
      apply,
    },
  });

  const updateParsed = JSON.parse(updateResult.content[0].text);
  console.log(updateParsed.preview || JSON.stringify(updateParsed, null, 2));

  // Post-validation
  const postResult = await client.callTool({
    name: "index_validate",
    arguments: { include_negative_fixtures: true },
  });
  const postParsed = JSON.parse(postResult.content[0].text);
  if (!postParsed.valid) {
    console.error("Post-validation failed:");
    for (const err of postParsed.errors) console.error(`- ${err.record}: ${err.message}`);
    process.exit(1);
  }

  await transport.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("MCP client error:", err.message);
  process.exit(1);
});
