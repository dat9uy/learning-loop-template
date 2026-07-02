import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");

// Each runtime's mcp.json sets env.LOOP_SURFACE so the harness passes the
// surface to the spawned server.js, where pinRuntimeIdAtBoot() reads it at boot.
const EXPECTED_ENV = {
  ".mcp.json": ".claude",
  ".factory/mcp.json": ".factory",
  ".mastracode/mcp.json": ".mastracode",
};

for (const [file, surface] of Object.entries(EXPECTED_ENV)) {
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

  test(`${file} mastra entry points at server.js with env.LOOP_SURFACE=${surface}`, () => {
    const config = JSON.parse(readFileSync(join(projectRoot, file), "utf8"));
    assert.deepEqual(config.mcpServers["learning-loop"], {
      command: "node",
      args: ["tools/learning-loop-mastra/mastra/server.js"],
      env: { LOOP_SURFACE: surface },
    });
  });
}