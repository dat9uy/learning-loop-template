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

// CLI_READ_TOOLS widened by plans/260722-2147 Phase 3: 7 original + 6
// reclassified (workflow_generate_prompt + 5 aux-read-ish). Reason
// taxonomy per docs/runtime-contract.md § "Transport capability".
const EXPECTED_READ_TOOLS = [
  "loop_describe",
  "loop_get_instruction",
  "meta_state_list",
  "meta_state_relationships",
  "meta_state_derive_status",
  "meta_state_check_grounding",
  "runtime_state_read",
  "workflow_generate_prompt",
  "gate_check",
  "gate_check_recurrence",
  "meta_state_sweep",
  "meta_state_query_drift",
  "meta_state_relationship_validate",
];

test("CLI read allowlist is the exact expected read contract", () => {
  assert.ok(CLI_READ_TOOLS instanceof Set, "CLI_READ_TOOLS must be a Set");
  assert.deepStrictEqual(
    [...CLI_READ_TOOLS].sort(),
    [...EXPECTED_READ_TOOLS].sort(),
    "CLI_READ_TOOLS must equal the enumerated read tool list (7 + workflow_generate_prompt + 5 aux-read-ish)",
  );
});

test("CLI list surfaces the full CLI_TOOLS set (reads + writes)", () => {
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

test("LOOP_READS_VIA_CLI=1 excludes only the 13 read tools (R backward compat)", { timeout: 30000 }, async () => {
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

    assert.strictEqual(defaultMastraNames.length, 36, "default MCP surface must retain all 36 mastra tools");
    assert.strictEqual(
      optedMastraNames.length,
      defaultMastraNames.length - EXPECTED_READ_TOOLS.length,
      `reads-only opted MCP surface must remove exactly ${EXPECTED_READ_TOOLS.length} read tools`,
    );

    const excluded = defaultNames.filter((name) => !optedNames.includes(name));
    const expectedExcluded = EXPECTED_READ_TOOLS.map((name) => `${PREFIX}${name}`).sort();
    assert.deepStrictEqual(excluded, expectedExcluded, "only CLI read tools may be excluded under reads-only opt-out");

    for (const name of optedNames) {
      assert.ok(defaultNames.includes(name), `opted surface introduced unexpected tool ${name}`);
    }
    assert.ok(
      optedNames.includes("mastra_update_r2_allowlist"),
      "server-state allowlist mutation must remain on MCP under reads-only opt-out",
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
  // Phase 3 widened CLI_TOOLS by 8 (3 workflow helpers + 5 aux-read-ish).
  // Default mastra_* surface stays at 36; under LOOP_RECORDS_VIA_CLI=1 the
  // residue shrinks from 10 to 2 — update_r2_allowlist (server-state) +
  // check_runtime_agnostic (agent-facing). Workflow residue (8 tools)
  // lives in a separate namespace (`run_*`) and is asserted by
  // cli-write-tool-set-drift.test.js.
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
    // Irreducible residue under LOOP_RECORDS_VIA_CLI=1 — both stayed MCP
    // for declared reasons (server-state / agent-facing). The 8
    // workflow residue (run_<wf.id>) is asserted in
    // cli-write-tool-set-drift.test.js (separate namespace, separate guard).
    const MCP_RESIDUE = [
      "mastra_update_r2_allowlist",
      "mastra_check_runtime_agnostic",
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
