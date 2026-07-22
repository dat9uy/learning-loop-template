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
    assert.ok(bytes <= 50_000, `manifest tool wire is ${bytes} bytes`);
  });
});
