import { test } from "vitest";
import assert from "node:assert/strict";
import { withMcpServer } from "./with-mcp-server.js";

const NON_MANIFEST_PREFIXES = ["run_", "ask_"];

function isManifestTool(tool) {
  return !NON_MANIFEST_PREFIXES.some((prefix) => tool.name.startsWith(prefix))
    && tool.name !== "mastra_update_r2_allowlist";
}

test("manifest tools stay within the context budget", async () => {
  await withMcpServer(async ({ listTools }) => {
    const tools = (await listTools()).filter(isManifestTool);
    const bytes = Buffer.byteLength(JSON.stringify(tools));
    // Budget tracks the manifest size with modest headroom for near-term tool
    // additions; raise deliberately, not by round number. Current wire is
    // ~49.3 KB after the portable-six unwrap moved 6 run_workflow_* tools onto
    // the manifest surface (+7.4 KB over the prior ~41.9 KB).
    assert.ok(bytes <= 52_000, `manifest tool wire is ${bytes} bytes`);
  });
});
