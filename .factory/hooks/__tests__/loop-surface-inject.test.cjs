// Phase 1 (plans/260717-1826-unify-context-injection): the factory SessionStart
// hook renders hints + counts directly from core — no MCP spawn. These tests
// lock the new behavior. `_spawnImpl` 3rd arg remains in the signature for
// back-compat but is intentionally ignored.

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

  test("exits silently when .mcp.json lacks learning-loop entry", async () => {
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

  test("prints formatted block when project matches (counts from core reads, hints rendered)", async () => {
    const tempDir = setupTempDir("hook-match-");
    try {
      writeFileSync(
        join(tempDir, ".mcp.json"),
        JSON.stringify({ mcpServers: { "learning-loop": { command: "node", args: ["server.js"] } } }, null, 2)
      );
      const input = { hook_event_name: "SessionStart", source: "startup", cwd: tempDir };
      const result = await hook.main(input, {});

      assert.ok(result);
      assert.ok(result.includes("=== loop surface (auto-injected at session start) ==="));
      // Counts come from real core readers (manifest length, schemas count, etc.).
      // We assert structural shape, not specific numeric values, so the test is
      // stable across count drift.
      assert.match(result, /^tools: \d+/m);
      assert.match(result, /^active findings: \d+/m);
      // Hints are rendered from the canonical core builders.
      assert.ok(result.includes("--- discoverability_hints ---"));
      assert.ok(result.includes("--- process_hints ---"));
      assert.ok(result.includes("Do not invoke ck:use-mcp"));
    } finally {
      teardownTempDir(tempDir);
    }
  });

  test("ignores 3rd-arg spawnImpl (Phase 1 invariant: no MCP spawn path)", async () => {
    const tempDir = setupTempDir("hook-no-spawn-");
    try {
      writeFileSync(
        join(tempDir, ".mcp.json"),
        JSON.stringify({ mcpServers: { "learning-loop": { command: "node", args: ["server.js"] } } }, null, 2)
      );
      const input = { hook_event_name: "SessionStart", source: "startup", cwd: tempDir };
      let spawnCalled = false;
      const neverCallMe = async () => {
        spawnCalled = true;
        throw new Error("Phase 1 invariant: MCP spawn must not be called");
      };

      const result = await hook.main(input, {}, neverCallMe);
      assert.ok(result);
      assert.strictEqual(spawnCalled, false, "spawnImpl must NOT be invoked (Phase 1: kill the probe)");
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
      const result = await hook.main(input, { LL_DISABLE_LOOP_SURFACE_INJECTION: "1" });
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
      const result = await hook.main(input, {});
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
      const result = await hook.main(input, {});
      assert.strictEqual(result, null);
    } finally {
      teardownTempDir(tempDir);
    }
  });

  test("LL_LOOP_INJECT_TIER=summary suppresses hints + logs hint-downgrade finding", async () => {
    const tempDir = setupTempDir("hook-summary-");
    try {
      writeFileSync(
        join(tempDir, ".mcp.json"),
        JSON.stringify({ mcpServers: { "learning-loop": { command: "node", args: ["server.js"] } } }, null, 2)
      );
      // Seed a minimal meta-state.jsonl so the downgrade logger has a registry.
      writeFileSync(join(tempDir, "meta-state.jsonl"), "", "utf8");

      const input = { hook_event_name: "SessionStart", source: "startup", cwd: tempDir, session_id: "test-summary-tier-x" };
      const result = await hook.main(input, { LL_LOOP_INJECT_TIER: "summary" });
      assert.ok(result);
      assert.match(result, /^tools: \d+/m, "summary tier still shows counts");
      assert.ok(!result.includes("--- discoverability_hints ---"), "summary tier omits discoverability hints");
      assert.ok(!result.includes("--- process_hints ---"), "summary tier omits process hints");

      // The hint-downgrade finding is written by reportHintDowngrade.
      const { readFileSync } = require("node:fs");
      const raw = readFileSync(join(tempDir, "meta-state.jsonl"), "utf8").trim();
      assert.ok(raw.length > 0, "hint-downgrade finding must be written");
      const entry = JSON.parse(raw);
      assert.strictEqual(entry.entry_kind, "finding");
      assert.strictEqual(entry.subtype, "hint-downgrade");
      assert.strictEqual(entry.session_id, "test-summary-tier-x");
    } finally {
      teardownTempDir(tempDir);
    }
  });
});
