/**
 * tools/learning-loop-mastra/__tests__/legacy-mcp/mastra-code-smoke.test.cjs
 *
 * Phase E Plan 4 — Mastra Code smoke test wrapper.
 *
 * Spawns `scripts/probe-mastracode.cjs` as a child process and asserts:
 *   1. exit code 0
 *   2. stdout JSON parses
 *   3. `ok === true` (live mode against installed `mastracode` package)
 *   4. MCP server `learning-loop` is connected (transport: stdio)
 *   5. 44 MCP tools exposed
 *   6. tool namespacing is `learning-loop_mastra_<tool>` (NOT `learning-loop_<tool>` as prep report predicted)
 *   7. round-trip via `learning-loop_mastra_loop_describe` succeeds
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
const { AGENT_MANIFEST_TOTAL_TOOLS } = require("../helpers/manifest-constants.cjs");

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

test(`smoke:mastracode live branch: MCP server connected + ${AGENT_MANIFEST_TOTAL_TOOLS} tools`, { timeout: 60000 }, () => {
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
  assert.equal(parsed.mcp_tool_names.length, AGENT_MANIFEST_TOTAL_TOOLS,
    `expected ${AGENT_MANIFEST_TOTAL_TOOLS} MCP tools, got ${parsed.mcp_tool_names.length}`);
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
  // Three patterns observed in mastracode@0.26.0:
  //   1. Primitives (30 tools): `learning-loop_mastra_<tool>` (e.g., loop_describe, meta_state_list, gate_check)
  //   2. Agent wrappers:        `learning-loop_ask_<agent>` (e.g., ask_intake_agent)
  //   3. Workflow runners:      `learning-loop_run_workflow_<workflow>` (e.g., run_workflow_classify_prompt)
  const expectedPrefixes = ["learning-loop_mastra_", "learning-loop_ask_", "learning-loop_run_workflow_"];
  for (const name of parsed.mcp_tool_names) {
    const ok = expectedPrefixes.some((p) => name.startsWith(p));
    assert.ok(ok, `tool name must start with one of [${expectedPrefixes.join(", ")}]; got: ${name}`);
  }
  // Verify the canonical probe tools are present
  assert.ok(parsed.mcp_tool_names.includes("learning-loop_mastra_loop_describe"), "loop_describe must be present");
  assert.ok(parsed.mcp_tool_names.includes("learning-loop_mastra_meta_state_list"), "meta_state_list must be present");
});

test("smoke:mastracode round-trip: loop_describe returns manifest", { timeout: 60000 }, () => {
  const result = spawnSync("node", [PROBE_PATH], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout: 60000,
  });
  const parsed = JSON.parse(result.stdout);
  if (parsed.status !== "live") return; // skip in non-live mode
  assert.ok(parsed.roundtrip, "roundtrip field must be present");
  assert.equal(parsed.roundtrip.tool, "learning-loop_mastra_loop_describe");
  assert.equal(parsed.roundtrip.ok, true, `roundtrip must succeed; got error: ${parsed.roundtrip.error}`);
  // MCP response shape: { content: [{ type: "text", text: "..." }], isError: false }
  assert.ok(Array.isArray(parsed.roundtrip.response_shape), "response_shape must be an array of keys");
  assert.ok(parsed.roundtrip.response_shape.includes("content"), "response must have content[]");
  assert.ok(parsed.roundtrip.response_shape.includes("isError"), "response must have isError");
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