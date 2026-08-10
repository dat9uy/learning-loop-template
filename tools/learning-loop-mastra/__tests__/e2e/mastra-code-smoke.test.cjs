/**
 * tools/learning-loop-mastra/__tests__/e2e/mastra-code-smoke.test.cjs
 *
 * Phase E Plan 4 — Mastra Code smoke test wrapper.
 *
 * Spawns `scripts/probe-mastracode.cjs` as a child process and asserts:
 *   1. exit code 0
 *   2. stdout JSON parses
 *   3. `ok === true` (live mode against installed `mastracode` package)
 *   4. MCP server `learning-loop` is connected (transport: stdio)
 *   5. 8 MCP tools exposed — the residue surface: the wired
 *      .mastracode/mcp.json sets LOOP_RECORDS_VIA_CLI=1, so the full record
 *      surface (reads + writes, incl. loop_describe) rides the stateless CLI
 *      and MCP keeps only workflow/storage/allowlist/audit + agent wrappers
 *   6. tool namespacing is `<serverName>_<tool>` (e.g. `learning-loop_mastra_<tool>`)
 *   7. round-trip via `learning-loop_mastra_check_runtime_agnostic` succeeds
 *   8. hook wire-format is compatible (universal bash-gate parses synthetic Mastra-Code-shaped payload)
 *
 * If the `mastracode` package isn't installed, the probe returns ok=false with
 * `status: "install-blocked"` and the test reports an installation gap. This
 * is acceptable behavior (the probe is designed to fail gracefully); the test
 * itself only fails if the probe script exits non-zero or its JSON is malformed.
 */
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { resolve, join } = require("node:path");
const { MCP_RESIDUE_TOTAL_TOOLS } = require("../helpers/manifest-constants.cjs");

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..", "..");
const PROBE_PATH = join(PROJECT_ROOT, "scripts", "probe-mastracode.cjs");

test("smoke:mastracode probe exits 0", { timeout: 60000 }, () => {
  const result = spawnSync("node", [PROBE_PATH], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout: 60000,
  });
  assert.equal(result.status, 0, `probe must exit 0; got ${result.status}. stderr: ${result.stderr?.slice(0, 500)}`);
});

test("smoke:mastracode stdout is valid JSON", { timeout: 60000 }, () => {
  const result = spawnSync("node", [PROBE_PATH], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout: 60000,
  });
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (err) {
    assert.fail(`probe stdout is not valid JSON: ${err.message}; first 500 chars: ${result.stdout?.slice(0, 500)}`);
  }
  assert.equal(typeof parsed, "object");
  assert.ok("ok" in parsed, "probe output must have `ok` field");
  assert.ok("status" in parsed, "probe output must have `status` field");
});

test(`smoke:mastracode live branch: MCP server connected + ${MCP_RESIDUE_TOTAL_TOOLS} residue tools`, { timeout: 60000 }, () => {
  const result = spawnSync("node", [PROBE_PATH], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout: 60000,
  });
  const parsed = JSON.parse(result.stdout);
  if (parsed.status !== "live") {
    assert.fail(`probe not in live mode (likely install-blocked): status=${parsed.status}, error=${parsed.error}`);
  }
  assert.equal(parsed.ok, true);
  assert.ok(Array.isArray(parsed.mcp_servers), "mcp_servers must be an array");
  assert.equal(parsed.mcp_servers.length, 1, "exactly 1 MCP server expected (learning-loop)");
  assert.equal(parsed.mcp_servers[0].name, "learning-loop");
  assert.equal(parsed.mcp_servers[0].connected, true, "learning-loop server must be connected");
  assert.equal(parsed.mcp_servers[0].transport, "stdio", "transport must be stdio");
  assert.equal(parsed.mcp_tool_names.length, MCP_RESIDUE_TOTAL_TOOLS,
    `expected ${MCP_RESIDUE_TOTAL_TOOLS} MCP residue tools (record surface rides the CLI under LOOP_RECORDS_VIA_CLI=1), got ${parsed.mcp_tool_names.length}`);
});

test("smoke:mastracode tool namespacing: learning-loop_<primitive|agent|workflow>", { timeout: 60000 }, () => {
  const result = spawnSync("node", [PROBE_PATH], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout: 60000,
  });
  const parsed = JSON.parse(result.stdout);
  if (parsed.status !== "live") return; // skip in non-live mode
  // MCP tool namespacing is `<serverName>_<tool>` per @mastra/mcp client (verified live).
  // Residue surface (LOOP_RECORDS_VIA_CLI=1) keeps three patterns:
  //   1. Primitives:   `learning-loop_mastra_<tool>` (workflow_generate_prompt,
  //      check_runtime_agnostic, update_r2_allowlist)
  //   2. Agent wrappers: `learning-loop_ask_<agent>` (intake, scout, self_improvement)
  //   3. Workflow runners: `learning-loop_run_workflow_<workflow>` (storage round-trip/read)
  const expectedPrefixes = ["learning-loop_mastra_", "learning-loop_ask_", "learning-loop_run_workflow_"];
  for (const name of parsed.mcp_tool_names) {
    const ok = expectedPrefixes.some((p) => name.startsWith(p));
    assert.ok(ok, `tool name must start with one of [${expectedPrefixes.join(", ")}]; got: ${name}`);
  }
  // Verify the canonical residue tools are present; record-surface tools are absent
  assert.ok(parsed.mcp_tool_names.includes("learning-loop_mastra_check_runtime_agnostic"), "check_runtime_agnostic must be present");
  assert.ok(parsed.mcp_tool_names.includes("learning-loop_run_workflow_storage_read"), "run_workflow_storage_read must be present");
  assert.ok(!parsed.mcp_tool_names.includes("learning-loop_mastra_loop_describe"), "loop_describe must be absent (rides the CLI)");
  assert.ok(!parsed.mcp_tool_names.includes("learning-loop_mastra_meta_state_list"), "meta_state_list must be absent (rides the CLI)");
});

test("smoke:mastracode round-trip: check_runtime_agnostic returns a result", { timeout: 60000 }, () => {
  const result = spawnSync("node", [PROBE_PATH], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout: 60000,
  });
  const parsed = JSON.parse(result.stdout);
  if (parsed.status !== "live") return; // skip in non-live mode
  assert.ok(parsed.roundtrip, "roundtrip field must be present");
  assert.equal(parsed.roundtrip.tool, "learning-loop_mastra_check_runtime_agnostic");
  assert.equal(parsed.roundtrip.ok, true, `roundtrip must succeed; got error: ${parsed.roundtrip.error}`);
  assert.ok(parsed.roundtrip.response_shape, "response_shape must be present");
});

test("smoke:mastracode hook wire-format is compatible", { timeout: 60000 }, () => {
  const result = spawnSync("node", [PROBE_PATH], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout: 60000,
  });
  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.wire_format_probe, "wire_format_probe must be present");
  // Universal bash-gate parses synthetic Mastra-Code-shaped payload (exit 0)
  assert.equal(parsed.wire_format_probe.exit_code, 0, "universal bash-gate must parse Mastra-Code-shaped payload");
});