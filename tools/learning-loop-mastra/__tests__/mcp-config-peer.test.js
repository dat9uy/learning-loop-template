import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");

for (const file of [".mcp.json", ".factory/mcp.json"]) {
  test(`${file} has 2 mcpServers entries (legacy + mastra peer)`, () => {
    const config = JSON.parse(readFileSync(join(projectRoot, file), "utf8"));
    assert.equal(Object.keys(config.mcpServers).length, 2);
    assert(config.mcpServers["learning-loop-mcp"], `${file}: legacy entry missing`);
    assert(config.mcpServers["learning-loop-mastra"], `${file}: mastra peer entry missing`);
  });

  test(`${file} legacy entry is unchanged`, () => {
    const config = JSON.parse(readFileSync(join(projectRoot, file), "utf8"));
    assert.deepEqual(config.mcpServers["learning-loop-mcp"], {
      command: "node",
      args: ["tools/learning-loop-mcp/server.js"],
    });
  });

  test(`${file} mastra peer entry points at tools/learning-loop-mastra/server.js`, () => {
    const config = JSON.parse(readFileSync(join(projectRoot, file), "utf8"));
    assert.deepEqual(config.mcpServers["learning-loop-mastra"], {
      command: "node",
      args: ["tools/learning-loop-mastra/server.js"],
    });
  });
}
