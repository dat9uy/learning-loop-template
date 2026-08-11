import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..", "..");

// Each runtime's mcp.json sets env.LOOP_SURFACE so the harness passes the
// surface to the spawned server.js, where pinRuntimeIdAtBoot() reads it at boot.
// No runtime carries a LOOP_*_VIA_CLI key: the CLI is the single record surface
// in every config and MCP registers only the residue unconditionally.
const EXPECTED_ENV = {
  ".mcp.json": { LOOP_SURFACE: ".claude" },
  ".factory/mcp.json": { LOOP_SURFACE: ".factory" },
  ".mastracode/mcp.json": { LOOP_SURFACE: ".mastracode" },
  ".hermes/mcp.json": { LOOP_SURFACE: ".hermes" },
};

for (const [file, expectedEnv] of Object.entries(EXPECTED_ENV)) {
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

  test(`${file} mastra entry points at server.js with env.LOOP_SURFACE=${expectedEnv.LOOP_SURFACE}`, () => {
    const config = JSON.parse(readFileSync(join(projectRoot, file), "utf8"));
    assert.deepEqual(config.mcpServers["learning-loop"], {
      command: "node",
      args: ["tools/learning-loop-mastra/mastra/server.js"],
      env: expectedEnv,
    });
  });
}