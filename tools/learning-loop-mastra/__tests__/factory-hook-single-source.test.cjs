/**
 * Phase 1 (plans/260717-1826-unify-context-injection): the factory SessionStart
 * hook must render hints via direct core import — no LOCAL_* mirror, no MCP
 * spawn. This test guards the invariant.
 *
 * Companion to cold-session-discoverability.test.cjs which previously held
 * the regex-based parity test (test #7). That test was deleted in Phase 1
 * (the mirror is gone, so there is nothing to compare); this file is the
 * replacement that exercises the hook directly via its exported main().
 */
const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const HOOK_PATH = join(PROJECT_ROOT, ".factory/hooks/loop-surface-inject.cjs");

describe("factory hook single-source (phase 1 invariant)", () => {
  // ---------------------------------------------------------------------------
  // Guard 1: source-level — no mirror arrays, no MCP spawn symbols
  // ---------------------------------------------------------------------------

  test("hook source contains no LOCAL_* mirror arrays", () => {
    const source = readFileSync(HOOK_PATH, "utf8");
    assert.ok(
      !source.includes("LOCAL_DISCOVERABILITY_HINTS"),
      "LOCAL_DISCOVERABILITY_HINTS must be deleted (Phase 1: single-source)",
    );
    assert.ok(
      !source.includes("LOCAL_PROCESS_HINTS"),
      "LOCAL_PROCESS_HINTS must be deleted (Phase 1: single-source)",
    );
    assert.ok(
      !source.includes("spawnAndCall"),
      "spawnAndCall must be deleted (Phase 1: kill the MCP probe)",
    );
    assert.ok(
      !source.includes("reportMcpConnectionFailure"),
      "reportMcpConnectionFailure must be deleted (Phase 1: kill the probe reporter)",
    );
    assert.ok(
      !source.includes("formatMcpFailureBanner"),
      "formatMcpFailureBanner must be deleted (Phase 1: probe banner gone)",
    );
    assert.ok(
      !source.includes('mastra_loop_describe'),
      "MCP call to mastra_loop_describe must be deleted (Phase 1: kill the probe)",
    );
    assert.ok(
      !source.includes('"@modelcontextprotocol/sdk'),
      "MCP SDK import must be deleted (Phase 1: no MCP probe)",
    );
  });

  // ---------------------------------------------------------------------------
  // Guard 2: behavioral — main() renders canonical builders via direct import
  // ---------------------------------------------------------------------------

  function makeMcpConfig(root) {
    mkdirSync(join(root, ".factory"), { recursive: true });
    writeFileSync(
      join(root, ".mcp.json"),
      JSON.stringify({ mcpServers: { "learning-loop": { command: "node", args: [] } } }),
    );
  }

  test("main() renders canonical discoverability + process hints (no spawn)", async () => {
    const root = mkdtempSync(join(tmpdir(), "factory-hook-render-"));
    try {
      makeMcpConfig(root);
      const input = {
        hook_event_name: "SessionStart",
        source: "startup",
        cwd: root,
        session_id: "test-render-001",
      };

      // Late-require so we exercise the real import path. Inject the env so
      // the hook resolves cwd correctly. We pass `spawnImpl` as a stub to
      // ensure no MCP spawn happens (Phase 1 invariant: zero spawns).
      let spawnCalled = false;
      const stubSpawn = async () => {
        spawnCalled = true;
        return null;
      };

      // Phase 1 keeps an optional spawnImpl param for back-compat — if we
      // forget to pass one, the hook must NOT spawn on its own. If the
      // module's main() refuses to accept the param, the assertion below
      // will catch it (spawnCalled would still be true, or the require
      // would throw).
      const hook = require(HOOK_PATH);
      assert.strictEqual(
        typeof hook.main,
        "function",
        "hook must export main()",
      );

      const block = await hook.main(input, { ...process.env }, stubSpawn);
      assert.ok(typeof block === "string", "main() must return a string block");
      assert.ok(!spawnCalled, "stubSpawn must not have been called (Phase 1: no MCP probe)");

      // The block carries both hint sets — content equality with canonical
      // builders (imported from the same core file) is the assertion.
      const corePath = join(PROJECT_ROOT, "tools/learning-loop-mastra/core/loop-introspect.js");
      const { pathToFileURL } = require("node:url");
      const { buildDiscoverabilityHints, buildProcessHints } = await import(
        pathToFileURL(corePath).href
      );
      const canonicalDisc = buildDiscoverabilityHints();
      const canonicalProc = buildProcessHints();

      // Each canonical hint must appear (in order) in the rendered block.
      let cursor = 0;
      for (const h of canonicalDisc) {
        const idx = block.indexOf(h, cursor);
        assert.ok(idx >= 0, `block must contain canonical discoverability hint (length ${h.length})`);
        cursor = idx + h.length;
      }
      // After discoverability, process hints must appear in order.
      cursor = block.indexOf("--- process_hints ---");
      assert.ok(cursor >= 0, "block must label the process section");
      let procCursor = cursor;
      for (const h of canonicalProc) {
        const idx = block.indexOf(h, procCursor);
        assert.ok(idx >= 0, `block must contain canonical process hint (length ${h.length})`);
        procCursor = idx + h.length;
      }
    } finally {
      try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  // ---------------------------------------------------------------------------
  // Guard 3: counts come from cheap sync core reads (not the MCP probe)
  // ---------------------------------------------------------------------------

  test("main() reports tool/rule/finding counts from cheap core reads", async () => {
    const root = mkdtempSync(join(tmpdir(), "factory-hook-counts-"));
    try {
      makeMcpConfig(root);
      const input = {
        hook_event_name: "SessionStart",
        source: "startup",
        cwd: root,
        session_id: "test-counts-001",
      };

      const hook = require(HOOK_PATH);
      const stubSpawn = async () => { throw new Error("spawn must not be called"); };
      const block = await hook.main(input, { ...process.env }, stubSpawn);
      assert.ok(typeof block === "string", "main() must return string");

      // Phase 1 counts header lines exist (the values come from core readers,
      // not the probe). The exact values depend on registry state — assert
      // the keys are present + numeric, not specific numbers.
      assert.match(block, /^tools: \d+/m, "block must carry tools count");
      assert.match(block, /^record types: \d+/m, "block must carry record types count");
      assert.match(block, /^active rules: \d+/m, "block must carry active rules count");
      assert.match(block, /^active findings: \d+/m, "block must carry active findings count");
    } finally {
      try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  // ---------------------------------------------------------------------------
  // Guard 4: LL_LOOP_INJECT_TIER=summary still downgrades hints + audits
  // ---------------------------------------------------------------------------

  test("LL_LOOP_INJECT_TIER=summary suppresses hint rows but emits block", async () => {
    const root = mkdtempSync(join(tmpdir(), "factory-hook-summary-"));
    try {
      makeMcpConfig(root);
      const input = {
        hook_event_name: "SessionStart",
        source: "startup",
        cwd: root,
        session_id: "test-summary-001",
      };

      const hook = require(HOOK_PATH);
      const stubSpawn = async () => { throw new Error("spawn must not be called"); };
      const block = await hook.main(
        input,
        { ...process.env, LL_LOOP_INJECT_TIER: "summary" },
        stubSpawn,
      );
      assert.ok(typeof block === "string", "main() must return string");
      // summary tier: counts present, hints absent
      assert.match(block, /^tools: \d+/m, "block must carry tools count in summary");
      assert.ok(
        !block.includes("--- discoverability_hints ---"),
        "summary tier must omit discoverability hints section",
      );
      assert.ok(
        !block.includes("--- process_hints ---"),
        "summary tier must omit process hints section",
      );
    } finally {
      try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });

  // ---------------------------------------------------------------------------
  // Guard 5: escape hatch preserved
  // ---------------------------------------------------------------------------

  test("LL_DISABLE_LOOP_SURFACE_INJECTION=1 returns null (escape hatch)", async () => {
    const root = mkdtempSync(join(tmpdir(), "factory-hook-escape-"));
    try {
      makeMcpConfig(root);
      const input = {
        hook_event_name: "SessionStart",
        source: "startup",
        cwd: root,
        session_id: "test-escape-001",
      };

      const hook = require(HOOK_PATH);
      const stubSpawn = async () => { throw new Error("spawn must not be called"); };
      const block = await hook.main(
        input,
        { ...process.env, LL_DISABLE_LOOP_SURFACE_INJECTION: "1" },
        stubSpawn,
      );
      assert.strictEqual(block, null, "escape hatch must suppress all output");
    } finally {
      try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
});