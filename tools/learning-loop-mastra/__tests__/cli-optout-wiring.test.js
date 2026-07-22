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

test("only the .claude runtime opts out of MCP records (combined flag)", () => {
  // Plan 260722-1343 Phase 4: after T2 write-path evidence accrued, .claude
  // migrated from LOOP_READS_VIA_CLI=1 to LOOP_RECORDS_VIA_CLI=1. The
  // combined flag drops the full CLI_TOOLS set (reads + writes) from MCP.
  // .factory / .mastracode stay on the full MCP surface — they graduate
  // later via their own evidence.
  const claudeEnv = readLoopEnv(join(PROJECT_ROOT, ".mcp.json"));
  const factoryEnv = readLoopEnv(join(PROJECT_ROOT, ".factory", "mcp.json"));
  const mastracodeEnv = readLoopEnv(join(PROJECT_ROOT, ".mastracode", "mcp.json"));

  assert.strictEqual(claudeEnv.LOOP_SURFACE, ".claude");
  assert.strictEqual(claudeEnv.LOOP_RECORDS_VIA_CLI, "1");
  assert.ok(!Object.hasOwn(factoryEnv, "LOOP_RECORDS_VIA_CLI"));
  assert.ok(!Object.hasOwn(mastracodeEnv, "LOOP_RECORDS_VIA_CLI"));
});
