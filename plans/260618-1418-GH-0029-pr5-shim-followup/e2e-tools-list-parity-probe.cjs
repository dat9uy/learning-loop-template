// E2E probe — Q3 finding verification.
// Spawns the production MCP server (tools/learning-loop-mastra/server.js) via stdio,
// sends `tools/list`, and inspects each tool's inputSchema. Asserts whether
// `_zod.toJSONSchema` override propagates through the MCPServer.convertSchema →
// standardSchemaToJSONSchema path.

const path = require("node:path");
const { mkdtempSync, mkdirSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const PROJECT_ROOT = "/home/datguy/codingProjects/learning-loop-template";
const SERVER_ENTRY = join(PROJECT_ROOT, "tools/learning-loop-mastra/server.js");

async function main() {
  const tempRoot = mkdtempSync(join(tmpdir(), "q3-probe-"));
  mkdirSync(join(tempRoot, "records", "meta", "decisions"), { recursive: true });
  // copy schemas from project
  const { readdirSync, copyFileSync } = require("node:fs");
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

  const client = new Client({ name: "q3-probe", version: "1.0.0" });
  await client.connect(transport);

  try {
    const result = await client.listTools();
    const tools = result.tools;

    console.log(`# tools/list returned ${tools.length} tools\n`);

    const summary = [];
    let brokenCount = 0;
    let okCount = 0;

    for (const tool of tools) {
      const inputSchema = tool.inputSchema;
      const keys = Object.keys(inputSchema || {});
      const isBroken =
        inputSchema &&
        typeof inputSchema === "object" &&
        (inputSchema.$ref === "#" ||
          (Object.keys(inputSchema).length === 1 && inputSchema.$ref === "#") ||
          // Refs without useful siblings
          (inputSchema.$ref &&
            !inputSchema.type &&
            !inputSchema.properties &&
            !inputSchema.anyOf &&
            !inputSchema.oneOf));

      // Detect missing critical fields
      const hasProperties = !!inputSchema?.properties;
      const hasType = !!inputSchema?.type;
      const isSelfRefOnly =
        inputSchema && Object.keys(inputSchema).length <= 1 && inputSchema.$ref === "#";

      if (isSelfRefOnly) {
        brokenCount++;
      } else {
        okCount++;
      }

      summary.push({
        name: tool.name,
        inputSchemaKeys: keys,
        isSelfRefOnly,
        hasProperties,
        hasType,
        preview: JSON.stringify(inputSchema).slice(0, 220),
      });
    }

    console.log(`## OK: ${okCount} | BROKEN: ${brokenCount}\n`);

    console.log(`## Per-tool inputSchema summary (first 10 tools):\n`);
    summary.slice(0, 10).forEach((s) => {
      console.log(`### ${s.name}`);
      console.log(`  keys: ${JSON.stringify(s.inputSchemaKeys)}`);
      console.log(`  hasProperties: ${s.hasProperties} | hasType: ${s.hasType}`);
      console.log(`  isSelfRefOnly: ${s.isSelfRefOnly}`);
      console.log(`  preview: ${s.preview}\n`);
    });

    if (brokenCount > 0) {
      console.log('\n## Tools with self-ref schema:\n');
      summary
        .filter((s) => s.isSelfRefOnly)
        .forEach((s) => {
          console.log(`  - ${s.name}: ${s.preview}`);
        });
    }

    // Save full JSON for the report
    const fs = require("node:fs");
    fs.writeFileSync(
      join(__dirname, "e2e-tools-list-output.json"),
      JSON.stringify(summary, null, 2),
    );

    console.log(`\nFull result saved to: e2e-tools-list-output.json`);
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error("PROBE ERROR:", e);
  process.exit(1);
});
