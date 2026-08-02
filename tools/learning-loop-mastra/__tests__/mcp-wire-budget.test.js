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
    // additions; raise deliberately, not by round number. After the
    // portable-six unwrap moved 6 run_workflow_* tools onto the manifest
    // surface and `meta_state_accept` was added, the wire is ~50 KB; the
    // 53 KB ceiling leaves headroom for the next 1-2 tools.
    assert.ok(bytes <= 53_000, `manifest tool wire is ${bytes} bytes`);
  });
});
