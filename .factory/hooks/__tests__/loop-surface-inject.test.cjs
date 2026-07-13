const assert = require("node:assert");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const hook = require("../loop-surface-inject.cjs");

describe("loop-surface-inject SessionStart hook", () => {
  function setupTempDir(prefix) {
    return mkdtempSync(join(tmpdir(), prefix));
  }

  function teardownTempDir(dir) {
    try { rmSync(dir, { recursive: true }); } catch { /* ignore */ }
  }

  test("exits silently when project has no .mcp.json", async () => {
    const tempDir = setupTempDir("hook-no-mcp-");
    try {
      const input = { hook_event_name: "SessionStart", source: "startup", cwd: tempDir };
      const result = await hook.main(input, {});
      assert.strictEqual(result, null);
    } finally {
      teardownTempDir(tempDir);
    }
  });

  test("exits silently when .mcp.json lacks learning-loop-mcp entry", async () => {
    const tempDir = setupTempDir("hook-other-server-");
    try {
      writeFileSync(
        join(tempDir, ".mcp.json"),
        JSON.stringify({ mcpServers: { "other-server": { command: "node", args: ["other.js"] } } }, null, 2)
      );
      const input = { hook_event_name: "SessionStart", source: "startup", cwd: tempDir };
      const result = await hook.main(input, {});
      assert.strictEqual(result, null);
    } finally {
      teardownTempDir(tempDir);
    }
  });

  test("prints formatted block when project matches and MCP call succeeds", async () => {
    const tempDir = setupTempDir("hook-match-");
    try {
      writeFileSync(
        join(tempDir, ".mcp.json"),
        JSON.stringify({ mcpServers: { "learning-loop": { command: "node", args: ["server.js"] } } }, null, 2)
      );
      const input = { hook_event_name: "SessionStart", source: "startup", cwd: tempDir };
      const mockSummary = { tool_count: 36, record_type_count: 8, rule_count: 1, active_finding_count: 12 };
      const mockSpawn = async () => mockSummary;

      const result = await hook.main(input, {}, mockSpawn);
      assert.ok(result.includes("=== loop surface (auto-injected at session start) ==="));
      assert.ok(result.includes("tools: 36"));
      assert.ok(result.includes("active findings: 12"));
      assert.ok(result.includes("Do not invoke ck:use-mcp"));
    } finally {
      teardownTempDir(tempDir);
    }
  });

  test("honors LL_DISABLE_LOOP_SURFACE_INJECTION=1 escape hatch", async () => {
    const tempDir = setupTempDir("hook-disabled-");
    try {
      writeFileSync(
        join(tempDir, ".mcp.json"),
        JSON.stringify({ mcpServers: { "learning-loop": { command: "node", args: ["server.js"] } } }, null, 2)
      );
      const input = { hook_event_name: "SessionStart", source: "startup", cwd: tempDir };
      const mockSummary = { tool_count: 36, record_type_count: 8, rule_count: 1, active_finding_count: 12 };
      const mockSpawn = async () => mockSummary;

      const result = await hook.main(input, { LL_DISABLE_LOOP_SURFACE_INJECTION: "1" }, mockSpawn);
      assert.strictEqual(result, null);
    } finally {
      teardownTempDir(tempDir);
    }
  });

  test("exits silently for non-SessionStart events", async () => {
    const tempDir = setupTempDir("hook-wrong-event-");
    try {
      writeFileSync(
        join(tempDir, ".mcp.json"),
        JSON.stringify({ mcpServers: { "learning-loop": { command: "node", args: ["server.js"] } } }, null, 2)
      );
      const input = { hook_event_name: "UserPromptSubmit", source: "startup", cwd: tempDir };
      const mockSpawn = async () => ({ tool_count: 1 });

      const result = await hook.main(input, {}, mockSpawn);
      assert.strictEqual(result, null);
    } finally {
      teardownTempDir(tempDir);
    }
  });

  test("exits silently for non-startup source", async () => {
    const tempDir = setupTempDir("hook-wrong-source-");
    try {
      writeFileSync(
        join(tempDir, ".mcp.json"),
        JSON.stringify({ mcpServers: { "learning-loop": { command: "node", args: ["server.js"] } } }, null, 2)
      );
      const input = { hook_event_name: "SessionStart", source: "resume", cwd: tempDir };
      const mockSpawn = async () => ({ tool_count: 1 });

      const result = await hook.main(input, {}, mockSpawn);
      assert.strictEqual(result, null);
    } finally {
      teardownTempDir(tempDir);
    }
  });
});
