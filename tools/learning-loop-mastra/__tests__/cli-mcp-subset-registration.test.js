import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CLI_READ_TOOLS } from "../core/cli-tools.js";
import { connectMcpServer, prepareTempRoot } from "./with-mcp-server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");
const SERVER_ENTRY = join(PKG_ROOT, "mastra", "server.js");
const LOOP_BIN = join(PKG_ROOT, "bin", "loop.mjs");
const PREFIX = "mastra_";

const EXPECTED_READ_TOOLS = [
  "loop_describe",
  "loop_get_instruction",
  "meta_state_list",
  "meta_state_relationships",
  "meta_state_derive_status",
  "meta_state_check_grounding",
  "runtime_state_read",
];

test("CLI read allowlist is the exact seven-tool contract", () => {
  assert.ok(CLI_READ_TOOLS instanceof Set, "CLI_READ_TOOLS must be a Set");
  assert.deepStrictEqual([...CLI_READ_TOOLS], EXPECTED_READ_TOOLS);

  const proc = spawnSync("node", [LOOP_BIN, "list"], {
    encoding: "utf8",
    timeout: 30000,
  });
  assert.strictEqual(proc.status, 0, `loop.mjs list failed: ${proc.stderr}`);
  const listed = proc.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split(/\s{2,}/)[0]);
  assert.deepStrictEqual(listed.sort(), [...EXPECTED_READ_TOOLS].sort());
});

test("MCP registration excludes only CLI read tools when opted in", { timeout: 30000 }, async () => {
  const defaultRoot = prepareTempRoot();
  const optedRoot = prepareTempRoot();
  const defaultServer = await connectMcpServer(SERVER_ENTRY, defaultRoot, {
    LOOP_READS_VIA_CLI: "0",
  });
  const optedServer = await connectMcpServer(SERVER_ENTRY, optedRoot, {
    LOOP_READS_VIA_CLI: "1",
  });

  try {
    const defaultNames = (await defaultServer.listTools()).map((tool) => tool.name).sort();
    const optedNames = (await optedServer.listTools()).map((tool) => tool.name).sort();
    const defaultMastraNames = defaultNames.filter((name) => name.startsWith(PREFIX));
    const optedMastraNames = optedNames.filter((name) => name.startsWith(PREFIX));

    assert.strictEqual(defaultMastraNames.length, 33, "default MCP surface must retain all 33 tools");
    assert.strictEqual(optedMastraNames.length, 26, "opted MCP surface must remove exactly seven tools");

    const excluded = defaultNames.filter((name) => !optedNames.includes(name));
    const expectedExcluded = EXPECTED_READ_TOOLS.map((name) => `${PREFIX}${name}`).sort();
    assert.deepStrictEqual(excluded, expectedExcluded, "only CLI read tools may be excluded");

    for (const name of optedNames) {
      assert.ok(defaultNames.includes(name), `opted surface introduced unexpected tool ${name}`);
    }
    assert.ok(
      optedNames.includes("mastra_update_r2_allowlist"),
      "operator-only allowlist mutation must remain on MCP",
    );
    assert.ok(optedNames.includes("mastra_meta_state_report"), "write tools must remain on MCP");
    assert.ok(optedNames.includes("mastra_runtime_state_record"), "runtime writes must remain on MCP");
    assert.ok(optedNames.includes("mastra_gate_mark_preflight"), "preflight writes must remain on MCP");
  } finally {
    await defaultServer.cleanup();
    await optedServer.cleanup();
  }
});
