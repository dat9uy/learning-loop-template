// Regression test: lock the end-to-end behavior of spawnAndCall against
// the real learning-loop-mcp server. Catches the chicken-and-egg deadlock
// where initialize was sent inside the child.stdout.on("data") handler
// (so the first stdout data — the response to initialize — could never
// trigger the send, and every probe timed out at 10s).
//
// This test spawns the real MCP server via Node and asserts that the
// loop_describe summary is returned within the 10-second probe window.

const assert = require("node:assert");
const { join } = require("node:path");

const { spawnAndCall } = require("../loop-surface-inject.cjs");

describe("loop-surface-inject real spawnAndCall (regression: chicken-and-egg)", () => {
  test("completes the MCP handshake and returns loop_describe summary", async () => {
    const projectRoot = process.cwd();
    const serverEntry = join(projectRoot, "tools/learning-loop-mastra/mastra/server.js");

    const serverCfg = { command: "node", args: ["tools/learning-loop-mastra/mastra/server.js"] };

    // Race the probe against a wall clock so a deadlock (the old bug)
    // fails this test loudly instead of stalling for the full 10s.
    const probe = spawnAndCall(serverCfg, projectRoot);
    const wall = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("wall_clock_exceeded_9s")), 9000),
    );

    const summary = await Promise.race([probe, wall]);

    assert.ok(summary && typeof summary === "object", "spawnAndCall should resolve with a summary object");
    assert.strictEqual(summary.tier, "summary", "summary should be at tier=summary");
    assert.ok(typeof summary.tool_count === "number" && summary.tool_count > 0,
      `summary.tool_count should be > 0 (got ${summary.tool_count})`);
    assert.ok(typeof summary.active_finding_count === "number",
      "summary.active_finding_count should be a number");
  });
});
