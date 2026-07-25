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

test("all wired runtimes opt out of MCP records (combined flag)", () => {
  // Every wired runtime sets LOOP_RECORDS_VIA_CLI=1 so the full CLI_TOOLS
  // set (reads + writes) drops from MCP and no runtime keeps a
  // server-lifetime ESM module cache over the record surface.
  const claudeEnv = readLoopEnv(join(PROJECT_ROOT, ".mcp.json"));
  const factoryEnv = readLoopEnv(join(PROJECT_ROOT, ".factory", "mcp.json"));
  const mastracodeEnv = readLoopEnv(join(PROJECT_ROOT, ".mastracode", "mcp.json"));

  assert.strictEqual(claudeEnv.LOOP_SURFACE, ".claude");
  assert.strictEqual(claudeEnv.LOOP_RECORDS_VIA_CLI, "1");
  assert.strictEqual(factoryEnv.LOOP_RECORDS_VIA_CLI, "1");
  assert.strictEqual(mastracodeEnv.LOOP_RECORDS_VIA_CLI, "1");
});
