import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { CLI_READ_TOOLS, CLI_TOOLS } from "../core/cli-tools.js";
import { connectMcpServer, prepareTempRoot } from "./with-mcp-server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const PKG_ROOT = resolve(__dirname, "..");
const LOOP_BIN = join(PKG_ROOT, "bin", "loop.mjs");
const SERVER_ENTRY = join(PKG_ROOT, "mastra", "server.js");

function readLoopEnv(configPath) {
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  return config.mcpServers?.["learning-loop"]?.env ?? {};
}

function readCodexConfig() {
  return readFileSync(join(PROJECT_ROOT, ".codex", "config.toml"), "utf8");
}

// The 12 read tools (7 record reads + 5 stateless aux-read-ish handlers).
const EXPECTED_READ_TOOLS = [
  "loop_describe",
  "loop_get_instruction",
  "meta_state_list",
  "meta_state_relationships",
  "meta_state_derive_status",
  "meta_state_check_grounding",
  "runtime_state_read",
  "gate_check",
  "gate_check_recurrence",
  "meta_state_sweep",
  "meta_state_query_drift",
  "meta_state_relationship_validate",
];

test("all current runtimes pin their identity (CLI is the single record surface)", () => {
  // Every current runtime pins its own identity; no runtime carries a
  // LOOP_*_VIA_CLI opt-out key — the CLI is unconditionally the record
  // transport and MCP carries only the residue.
  const claudeEnv = readLoopEnv(join(PROJECT_ROOT, ".mcp.json"));
  const hermesEnv = readLoopEnv(join(PROJECT_ROOT, ".hermes", "mcp.json"));
  const codexConfig = readCodexConfig();

  assert.strictEqual(claudeEnv.LOOP_SURFACE, ".claude");
  assert.strictEqual(hermesEnv.LOOP_SURFACE, ".hermes");
  assert.match(codexConfig, /RUNTIME_ID\s*=\s*"codex"/);
  assert.match(codexConfig, /LOOP_SURFACE\s*=\s*"\.codex"/);
});

test("CLI read allowlist is the exact expected read contract", () => {
  assert.ok(CLI_READ_TOOLS instanceof Set, "CLI_READ_TOOLS must be a Set");
  assert.deepStrictEqual(
    [...CLI_READ_TOOLS].sort(),
    [...EXPECTED_READ_TOOLS].sort(),
    "CLI_READ_TOOLS must equal the enumerated read tool list (7 record reads + 5 aux-read-ish)",
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

test("live MCP listTools exposes exactly the 8-tool residue (no flag changes it)", { timeout: 30000 }, async () => {
  const tempRoot = prepareTempRoot();
  const server = await connectMcpServer(SERVER_ENTRY, tempRoot, {});
  try {
    const names = (await server.listTools()).map((t) => t.name).sort();
    assert.deepStrictEqual(
      names,
      [
        "ask_intake_agent",
        "ask_scout_agent",
        "ask_self_improvement_agent",
        "mastra_check_runtime_agnostic",
        "mastra_update_r2_allowlist",
        "mastra_workflow_generate_prompt",
        "run_workflow_storage_read",
        "run_workflow_storage_round_trip",
      ],
      "live MCP surface must be exactly the 8-tool residue",
    );
  } finally {
    await server.cleanup();
  }
});
