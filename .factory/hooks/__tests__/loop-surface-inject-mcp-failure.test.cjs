// Phase 4 tests: extend the existing loop-surface-inject SessionStart hook
// to log a meta_state_report finding on MCP probe failure (instead of
// silently exiting). Also surfaces an operator-friendly banner.
//
// TDD: this file is created BEFORE the implementation. All 3 tests are
// initially RED (failing) and turn GREEN after the hook is extended.

const { describe, test } = require("node:test");
const assert = require("node:assert");
const {
  mkdtempSync,
  writeFileSync,
  rmSync,
  readFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const hook = require("../loop-surface-inject.cjs");

function setupTempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function teardownTempDir(dir) {
  try { rmSync(dir, { recursive: true }); } catch { /* ignore */ }
}

describe("loop-surface-inject MCP failure reporting", () => {
  // Test 1: hook logs finding on failure
  test("logs a meta_state_report finding when probe fails (spawn throws)", async () => {
    const tempDir = setupTempDir("hook-mcp-fail-");
    try {
      writeFileSync(
        join(tempDir, ".mcp.json"),
        JSON.stringify({ mcpServers: { "learning-loop-mastra": { command: "node", args: ["server.js"] } } }, null, 2)
      );
      const input = {
        hook_event_name: "SessionStart",
        source: "startup",
        cwd: tempDir,
        session_id: "droid-test-session-001",
      };
      const failingSpawn = async () => { throw new Error("spawn failed"); };

      const result = await hook.main(input, {}, failingSpawn);
      // The hook should still return null (no block) on failure
      assert.strictEqual(result, null);

      // The meta-state registry should have a new finding
      const registryPath = join(tempDir, "meta-state.jsonl");
      assert.ok(readFileSync(registryPath, "utf8").length > 0, "registry should be created");
      const entries = readFileSync(registryPath, "utf8")
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => JSON.parse(l));
      const finding = entries.find((e) => e.subtype === "mcp-connection" && e.category === "mcp-tool-missing");
      assert.ok(finding, "expected a meta_state_report finding with subtype=mcp-connection");
      assert.strictEqual(finding.session_id, "droid-test-session-001");
      assert.strictEqual(finding.affected_system, "mcp-tools");
      assert.ok(finding.description.includes("MCP server probe failed"));
    } finally {
      teardownTempDir(tempDir);
    }
  });

  // Test 2: hook no-ops on success (regression guard)
  test("does NOT log a finding when probe succeeds (regression guard)", async () => {
    const tempDir = setupTempDir("hook-mcp-success-");
    try {
      writeFileSync(
        join(tempDir, ".mcp.json"),
        JSON.stringify({ mcpServers: { "learning-loop-mastra": { command: "node", args: ["server.js"] } } }, null, 2)
      );
      const input = {
        hook_event_name: "SessionStart",
        source: "startup",
        cwd: tempDir,
        session_id: "droid-test-session-002",
      };
      const successSpawn = async () => ({
        tool_count: 36,
        record_type_count: 8,
        rule_count: 1,
        active_finding_count: 12,
      });

      const result = await hook.main(input, {}, successSpawn);
      assert.ok(result.includes("=== loop surface (auto-injected at session start) ==="));

      // No finding should be logged
      const registryPath = join(tempDir, "meta-state.jsonl");
      let entries = [];
      try {
        entries = readFileSync(registryPath, "utf8")
          .split("\n")
          .filter((l) => l.trim() !== "")
          .map((l) => JSON.parse(l));
      } catch {
        // file doesn't exist — that's fine, no finding was logged
      }
      const finding = entries.find((e) => e.subtype === "mcp-connection");
      assert.strictEqual(finding, undefined, "no MCP-connection finding should be logged on success");
    } finally {
      teardownTempDir(tempDir);
    }
  });

  // Test 3: end-to-end — failure creates a finding that survives a second call (idempotent)
  test("idempotent: a second failure in the same session does NOT log a duplicate finding", async () => {
    const tempDir = setupTempDir("hook-mcp-idem-");
    try {
      writeFileSync(
        join(tempDir, ".mcp.json"),
        JSON.stringify({ mcpServers: { "learning-loop-mastra": { command: "node", args: ["server.js"] } } }, null, 2)
      );
      const input = {
        hook_event_name: "SessionStart",
        source: "startup",
        cwd: tempDir,
        session_id: "droid-test-session-003",
      };
      const failingSpawn = async () => { throw new Error("spawn failed"); };

      // First call: should log a finding
      await hook.main(input, {}, failingSpawn);
      const registryPath = join(tempDir, "meta-state.jsonl");
      const after1 = readFileSync(registryPath, "utf8")
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => JSON.parse(l));
      const mcpFindings1 = after1.filter((e) => e.subtype === "mcp-connection");
      assert.strictEqual(mcpFindings1.length, 1, "first call should log exactly 1 finding");

      // Second call (same session): should be idempotent — no duplicate
      await hook.main(input, {}, failingSpawn);
      const after2 = readFileSync(registryPath, "utf8")
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => JSON.parse(l));
      const mcpFindings2 = after2.filter((e) => e.subtype === "mcp-connection");
      assert.strictEqual(mcpFindings2.length, 1, "second call in same session must NOT log a duplicate");
    } finally {
      teardownTempDir(tempDir);
    }
  });
});
