import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { withBothMcpServers } from "./with-both-mcp-servers.js";

describe("withBothMcpServers smoke", () => {
  test("both servers respond to tools/list with non-empty arrays", { timeout: 10000 }, async () => {
    await withBothMcpServers(async ({ listTools }) => {
      const legacyTools = await listTools({ server: "legacy" });
      const mastraTools = await listTools({ server: "mastra" });

      assert.ok(Array.isArray(legacyTools), "legacy tools/list must be an array");
      assert.ok(legacyTools.length > 0, "legacy tools/list must not be empty");

      assert.ok(Array.isArray(mastraTools), "mastra tools/list must be an array");
      assert.ok(mastraTools.length > 0, "mastra tools/list must not be empty");
    });
  });

  test("shared GATE_ROOT: legacy report is visible to mastra", { timeout: 10000 }, async () => {
    await withBothMcpServers(async ({ callTool, tempRoot }) => {
      const reportResult = await callTool("meta_state_report", {
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "mcp-tools",
        description:
          "Shared GATE_ROOT smoke test report (min 20 chars)",
        evidence_code_ref: "tools/test.js",
      }, { server: "legacy" });

      assert.ok(reportResult.reported, "legacy report should succeed");

      const listResult = await callTool("mastra_meta_state_list", {
        id: reportResult.id,
        compact: true,
      }, { server: "mastra" });

      assert.ok(Array.isArray(listResult.entries), "mastra list must return entries");
      assert.equal(listResult.entries.length, 1, "mastra should see the legacy report");
    });
  });
});
