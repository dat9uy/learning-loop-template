import { test } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CLI_READ_TOOLS, CLI_TOOLS } from "../core/cli-tools.js";
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
});

test("CLI list surfaces the full CLI_TOOLS set (reads + writes)", () => {
  // Plan 260722-1343 Phase 1 — `bin/loop.mjs list` must show every tool
  // the CLI accepts (CLI_READ_TOOLS ∪ CLI_WRITE_TOOLS). The MCP surface
  // continues to carry the rest.
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
  const expected = [...CLI_TOOLS].sort();
  assert.deepStrictEqual(listed.sort(), expected, "list output must equal CLI_TOOLS exactly");
});

test("LOOP_READS_VIA_CLI=1 excludes only the 7 read tools (R backward compat)", { timeout: 30000 }, async () => {
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

    assert.strictEqual(defaultMastraNames.length, 36, "default MCP surface must retain all 36 mastra tools (was 33; runtime_state_pause/resume/prune_surface added for per-surface tracking toggle + inbound-gate skip)");
    assert.strictEqual(optedMastraNames.length, 29, "reads-only opted MCP surface must remove exactly seven read tools");

    const excluded = defaultNames.filter((name) => !optedNames.includes(name));
    const expectedExcluded = EXPECTED_READ_TOOLS.map((name) => `${PREFIX}${name}`).sort();
    assert.deepStrictEqual(excluded, expectedExcluded, "only CLI read tools may be excluded under reads-only opt-out");

    for (const name of optedNames) {
      assert.ok(defaultNames.includes(name), `opted surface introduced unexpected tool ${name}`);
    }
    assert.ok(
      optedNames.includes("mastra_update_r2_allowlist"),
      "operator-only allowlist mutation must remain on MCP",
    );
    assert.ok(optedNames.includes("mastra_meta_state_report"), "writes must remain on MCP under reads-only opt-out");
    assert.ok(optedNames.includes("mastra_runtime_state_record"), "runtime writes must remain on MCP under reads-only opt-out");
    assert.ok(optedNames.includes("mastra_gate_mark_preflight"), "preflight writes must remain on MCP under reads-only opt-out");
  } finally {
    await defaultServer.cleanup();
    await optedServer.cleanup();
  }
});

test("LOOP_RECORDS_VIA_CLI=1 excludes the full CLI_TOOLS set (reads + writes)", { timeout: 30000 }, async () => {
  // Plan 260722-1343 Phase 1 — combined flag drops every CLI_TOOLS
  // member from the MCP surface; MCP keeps workflow / storage /
  // allowlist / audit + auxiliary read-ish tools. The default MCP
  // surface stays at 33; the records-via-cli surface drops 23 (the
  // 7 reads + 16 writes), leaving 10 MCP-residue tools.
  const defaultRoot = prepareTempRoot();
  const optedRoot = prepareTempRoot();
  const defaultServer = await connectMcpServer(SERVER_ENTRY, defaultRoot, {
    LOOP_RECORDS_VIA_CLI: "0",
  });
  const optedServer = await connectMcpServer(SERVER_ENTRY, optedRoot, {
    LOOP_RECORDS_VIA_CLI: "1",
  });

  try {
    const defaultNames = (await defaultServer.listTools()).map((tool) => tool.name).sort();
    const optedNames = (await optedServer.listTools()).map((tool) => tool.name).sort();
    const defaultMastraNames = defaultNames.filter((name) => name.startsWith(PREFIX));
    const optedMastraNames = optedNames.filter((name) => name.startsWith(PREFIX));

    assert.strictEqual(defaultMastraNames.length, 36, "default MCP surface must retain all 36 mastra tools");
    assert.strictEqual(
      optedMastraNames.length,
      36 - CLI_TOOLS.size,
      `records-via-cli opted MCP surface must remove exactly CLI_TOOLS.size (${CLI_TOOLS.size}) tools`,
    );

    const excluded = defaultNames.filter((name) => !optedNames.includes(name));
    const expectedExcluded = [...CLI_TOOLS].map((name) => `${PREFIX}${name}`).sort();
    assert.deepStrictEqual(excluded, expectedExcluded, "only CLI_TOOLS members may be excluded under records opt-out");

    for (const name of optedNames) {
      assert.ok(defaultNames.includes(name), `opted surface introduced unexpected tool ${name}`);
    }
    // Residue must stay on MCP — never dropped by the combined flag.
    const MCP_RESIDUE = [
      "mastra_update_r2_allowlist",
      "mastra_workflow_generate_prompt",
      "mastra_workflow_notify_artifact",
      "mastra_workflow_trigger",
      "mastra_check_runtime_agnostic",
      "mastra_gate_check",
      "mastra_gate_check_recurrence",
      "mastra_meta_state_sweep",
      "mastra_meta_state_query_drift",
      "mastra_meta_state_relationship_validate",
    ];
    for (const name of MCP_RESIDUE) {
      assert.ok(
        optedNames.includes(name),
        `MCP residue tool ${name} must remain on MCP under LOOP_RECORDS_VIA_CLI=1`,
      );
    }
  } finally {
    await defaultServer.cleanup();
    await optedServer.cleanup();
  }
});
