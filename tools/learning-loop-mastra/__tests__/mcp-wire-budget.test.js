import { test } from "vitest";
import assert from "node:assert/strict";
import { withMcpServer } from "./with-mcp-server.js";

test("production MCP residue stays within the context budget", async () => {
  await withMcpServer(async ({ listTools }) => {
    // The live MCP surface is the irreducible residue: 8 tools
    // (3 ask_* agents + 2 run_workflow_storage_* + update_r2_allowlist +
    // check_runtime_agnostic + workflow_generate_prompt). The CLI is the single
    // record surface; MCP never registers CLI_TOOLS. The exact 8-name contract
    // is asserted by cli-optout-wiring.test.js and cli-write-tool-set-drift.test.js.
    const tools = await listTools();
    const bytes = Buffer.byteLength(JSON.stringify(tools));
    // Ceiling anchored to the measured residue (4,563 all-tools bytes via
    // __tests__/helpers/measure-residue.mjs), with ~1.4 KB headroom. Further
    // residue growth pays down schema debt rather than raising this silently.
    // Re-anchor with: node __tests__/helpers/measure-residue.mjs
    assert.ok(bytes <= 6_000, `residue all-tools wire is ${bytes} bytes`);
  });
});
