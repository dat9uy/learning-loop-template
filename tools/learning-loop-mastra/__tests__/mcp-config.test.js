import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");

for (const file of [".mcp.json", ".factory/mcp.json"]) {
  test(`${file} has exactly 1 mcpServers entry (learning-loop)`, () => {
    const config = JSON.parse(readFileSync(join(projectRoot, file), "utf8"));
    assert.equal(Object.keys(config.mcpServers).length, 1);
    assert(
      !("learning-loop-mcp" in config.mcpServers),
      `${file}: learning-loop-mcp should not be present post-cut-over`,
    );
    assert(
      "learning-loop" in config.mcpServers,
      `${file}: learning-loop must be the only server`,
    );
  });

  test(`${file} mastra entry points at tools/learning-loop-mastra/mastra/server.js`, () => {
    const config = JSON.parse(readFileSync(join(projectRoot, file), "utf8"));
    assert.deepEqual(config.mcpServers["learning-loop"], {
      command: "node",
      args: ["tools/learning-loop-mastra/mastra/server.js"],
    });
  });
}
