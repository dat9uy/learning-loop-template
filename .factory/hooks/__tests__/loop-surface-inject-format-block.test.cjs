const assert = require("node:assert");
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const hook = require("../loop-surface-inject.cjs");

describe("loop-surface-inject formatBlock", () => {
  function setupTempDir(prefix) {
    return mkdtempSync(join(tmpdir(), prefix));
  }

  function teardownTempDir(dir) {
    try { rmSync(dir, { recursive: true }); } catch { /* ignore */ }
  }

  test("formatBlock prints local discoverability hints section", async () => {
    const result = hook.formatBlock({
      tool_count: 36,
      record_type_count: 8,
      rule_count: 1,
      active_finding_count: 12,
    });

    assert.ok(result.includes("=== loop surface (auto-injected at session start) ==="));
    assert.ok(result.includes("tools: 36"));
    assert.ok(result.includes("To cite a thing, point at the code"));
    assert.ok(result.includes("local:meta-state:<id>"));
    assert.ok(result.includes("meta_state_derive_status"));
    assert.ok(result.includes("meta_state_log_change"));
    assert.ok(result.includes("reported"));
  });

  test("formatBlock ignores server-supplied discoverability_hints and uses local copy", async () => {
    const result = hook.formatBlock({
      tool_count: 36,
      record_type_count: 8,
      rule_count: 1,
      active_finding_count: 12,
      discoverability_hints: [
        "SERVER-INJECTED HINT: this should not appear",
        "Another server hint",
      ],
    });

    assert.ok(!result.includes("SERVER-INJECTED HINT"));
    assert.ok(result.includes("To cite a thing, point at the code"));
  });

  test("main with LL_LOOP_INJECT_TIER=summary requests summary tier and logs hint-downgrade", async () => {
    const tempDir = setupTempDir("hook-summary-tier-");
    try {
      writeFileSync(
        join(tempDir, ".mcp.json"),
        JSON.stringify({ mcpServers: { "learning-loop": { command: "node", args: ["server.js"] } } }, null, 2)
      );
      // Seed a minimal meta-state.jsonl so the downgrade log has a registry to write to.
      writeFileSync(join(tempDir, "meta-state.jsonl"), "", "utf8");

      const input = { hook_event_name: "SessionStart", source: "startup", cwd: tempDir, session_id: "test-session-abc" };
      const capturedCalls = [];
      const mockSpawn = async (serverCfg, cwd, tier) => {
        capturedCalls.push({ tier });
        return { tool_count: 5, record_type_count: 3, rule_count: 1, active_finding_count: 0 };
      };

      const result = await hook.main(input, { LL_LOOP_INJECT_TIER: "summary" }, mockSpawn);

      assert.strictEqual(capturedCalls.length, 1);
      assert.strictEqual(capturedCalls[0].tier, "summary");
      assert.ok(result.includes("tools: 5"));
      // Hints should NOT appear when tier=summary
      assert.ok(!result.includes("To cite a thing, point at the code"));

      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8").trim();
      assert.ok(raw.length > 0, "hint-downgrade finding should be written");
      const entry = JSON.parse(raw);
      assert.strictEqual(entry.entry_kind, "finding");
      assert.strictEqual(entry.subtype, "hint-downgrade");
      assert.strictEqual(entry.session_id, "test-session-abc");
    } finally {
      teardownTempDir(tempDir);
    }
  });
});
