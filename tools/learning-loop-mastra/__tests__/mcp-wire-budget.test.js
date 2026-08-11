import { test } from "vitest";
import assert from "node:assert/strict";
import { withMcpServer } from "./with-mcp-server.js";
import { measureResidue } from "./helpers/measure-residue.mjs";

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

test("measure-residue helper reports the same residue the server exposes", async () => {
  // Consumes the committed measurement helper (keeps it a live dependency, not
  // a dead artifact) AND cross-checks that the standalone measurement matches
  // the in-test server boot — the ceiling anchor stays reproducible.
  const measured = await measureResidue();
  assert.strictEqual(measured.count, 8, "live residue must be exactly 8 tools");
  assert.ok(measured.allToolsBytes <= 6_000, `measured residue is ${measured.allToolsBytes} bytes`);
  await withMcpServer(async ({ listTools }) => {
    const live = (await listTools()).map((t) => t.name).sort();
    assert.deepStrictEqual(measured.names, live, "measure-residue must report the same names as the live server");
  });
});
