import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");

function readLoopEnv(configPath) {
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  return config.mcpServers?.["learning-loop"]?.env ?? {};
}

test("only the .claude runtime opts out of MCP reads", () => {
  const claudeEnv = readLoopEnv(join(PROJECT_ROOT, ".mcp.json"));
  const factoryEnv = readLoopEnv(join(PROJECT_ROOT, ".factory", "mcp.json"));
  const mastracodeEnv = readLoopEnv(join(PROJECT_ROOT, ".mastracode", "mcp.json"));

  assert.strictEqual(claudeEnv.LOOP_SURFACE, ".claude");
  assert.strictEqual(claudeEnv.LOOP_READS_VIA_CLI, "1");
  assert.ok(!Object.hasOwn(factoryEnv, "LOOP_READS_VIA_CLI"));
  assert.ok(!Object.hasOwn(mastracodeEnv, "LOOP_READS_VIA_CLI"));
});
