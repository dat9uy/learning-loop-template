// Probe 2: Test whether the _zod.toJSONSchema override propagates through
// MCPServer's standardSchemaToJSONSchema path for ALL the shapes the migration uses.
// This is the crux of the Q3 finding — if the override works in production
// (as the e2e test shows), then we need to understand WHY.

const path = require("node:path");
const { mkdtempSync, mkdirSync, readdirSync, copyFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const PROJECT_ROOT = "/home/datguy/codingProjects/learning-loop-template";
const SERVER_ENTRY = join(PROJECT_ROOT, "tools/learning-loop-mastra/server.js");

async function main() {
  const tempRoot = mkdtempSync(join(tmpdir(), "q3-probe2-"));
  mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });
  const schemasSrc = join(PROJECT_ROOT, "schemas");
  const schemasDst = join(tempRoot, "schemas");
  mkdirSync(schemasDst, { recursive: true });
  for (const f of readdirSync(schemasSrc)) {
    if (f.endsWith(".schema.json")) {
      copyFileSync(join(schemasSrc, f), join(schemasDst, f));
    }
  }

  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/stdio.js"
  );

  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_ENTRY],
    env: { ...process.env, GATE_ROOT: tempRoot },
  });

  const client = new Client({ name: "q3-probe2", version: "1.0.0" });
  await client.connect(transport);

  try {
    const result = await client.listTools();
    const tools = result.tools;

    // Check if any inputSchema lacks the expected parity properties
    const problemTools = [];
    for (const tool of tools) {
      const schema = tool.inputSchema;
      // Migration cases to check:
      // 1. Schema with optional array of strings (preprocess envelope stripper)
      // 2. Schema with optional boolean (guarded-boolean union)
      const hasCandidates = !!schema.properties?.candidates;
      const hasEntryKind = !!schema.properties?.entry_kind;
      const hasApply = !!schema.properties?.apply;
      const hasOverride = !!schema.properties?.override;

      // For meta_state_archive (which uses preprocess envelope):
      if (tool.name === "mastra_meta_state_archive") {
        console.log(`# ${tool.name}:`);
        console.log(`  inputSchema: ${JSON.stringify(schema).slice(0, 800)}`);
        problemTools.push({ name: tool.name, schema: JSON.stringify(schema) });
      }
      if (tool.name === "mastra_meta_state_resolve") {
        console.log(`# ${tool.name} (has cascade_from + entry_kinds + id):`);
        console.log(`  inputSchema: ${JSON.stringify(schema).slice(0, 800)}`);
        problemTools.push({ name: tool.name, schema: JSON.stringify(schema) });
      }
      if (tool.name === "mastra_meta_state_sweep") {
        console.log(`# ${tool.name} (has apply:boolean):`);
        console.log(`  inputSchema: ${JSON.stringify(schema).slice(0, 800)}`);
        problemTools.push({ name: tool.name, schema: JSON.stringify(schema) });
      }
      if (tool.name === "mastra_meta_state_promote_rule") {
        console.log(`# ${tool.name} (has preview:boolean — guarded union):`);
        console.log(`  inputSchema: ${JSON.stringify(schema).slice(0, 800)}`);
        problemTools.push({ name: tool.name, schema: JSON.stringify(schema) });
      }
    }

    // Save full inspection
    const fs = require("node:fs");
    fs.writeFileSync(
      join(__dirname, "override-introspection-output.json"),
      JSON.stringify(problemTools, null, 2),
    );
    console.log(`\n# Saved to override-introspection-output.json`);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error("PROBE ERROR:", e);
  process.exit(1);
});
