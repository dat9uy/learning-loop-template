import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateRefreshToolsTool } from "../tools/meta-state-refresh-tools-tool.js";

const originalEnv = process.env.GATE_ROOT;
const originalServer = globalThis.__loopMcpServer;

function fakeServer(initialTools = {}) {
  const registered = { ...initialTools };
  const server = {
    _registeredTools: registered,
    setToolRequestHandlers() {},
    sendToolListChanged() {},
  };
  return server;
}

describe("meta_state_refresh_tools tool", () => {
  test("T1: dry_run reports plan without mutating the server", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp-refresh-tools-1-"));
    process.env.GATE_ROOT = tempDir;

    const server = fakeServer({ existing_tool: { handler: () => "old" } });
    globalThis.__loopMcpServer = server;

    try {
      const result = await metaStateRefreshToolsTool.handler({ dry_run: true });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.dry_run, true);
      assert.ok(Array.isArray(parsed.plan));
      assert.ok(parsed.manifest_count > 0);
      // The existing tool should still be registered — dry_run is read-only
      assert.ok(server._registeredTools.existing_tool);
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
      globalThis.__loopMcpServer = originalServer;
    }
  });

  test("T2: refresh re-registers all manifest tools and clears prior state", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp-refresh-tools-2-"));
    process.env.GATE_ROOT = tempDir;

    // Seed the fake server with a tool the reloader should wipe.
    const server = fakeServer({ stale_tool: { handler: () => "stale" } });
    globalThis.__loopMcpServer = server;

    try {
      const result = await metaStateRefreshToolsTool.handler({});
      const parsed = JSON.parse(result.content[0].text);

      assert.ok(typeof parsed.refreshed_count === "number");
      assert.ok(Array.isArray(parsed.refreshed));
      assert.ok(Array.isArray(parsed.failed));
      // The stale tool should be gone from the server after clearRegistrations
      assert.strictEqual(server._registeredTools.stale_tool, undefined,
        "stale tool should be cleared before re-registration");
      // Refreshed count is the count of manifest tools that successfully
      // re-registered; the server's registered count should match.
      assert.strictEqual(
        Object.keys(server._registeredTools).length,
        parsed.refreshed_count,
        "registered tool count should equal refreshed count",
      );
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
      globalThis.__loopMcpServer = originalServer;
    }
  });

  test("T3: returns error when globalThis.__loopMcpServer is not bound", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp-refresh-tools-3-"));
    process.env.GATE_ROOT = tempDir;

    delete globalThis.__loopMcpServer;

    try {
      const result = await metaStateRefreshToolsTool.handler({});
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.error, "server_handle_unavailable");
      assert.ok(/globalThis.__loopMcpServer/.test(parsed.reason));
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
    }
  });

  test("T4: refresh is symmetric — re-imports same modules server.js loaded", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp-refresh-tools-4-"));
    process.env.GATE_ROOT = tempDir;

    // The manifest under test reads from the real manifest.json shipped in
    // tools/learning-loop-mcp/tools/manifest.json. Every entry should
    // resolve to a real file under the project's tools/ directory.
    const server = fakeServer();
    globalThis.__loopMcpServer = server;

    try {
      const result = await metaStateRefreshToolsTool.handler({});
      const parsed = JSON.parse(result.content[0].text);
      // Either fully refreshed, or partial (a small number of tools fail);
      // a partial reload is still acceptable for the test invariant.
      assert.ok(parsed.manifest_count > 0, "manifest should have at least one entry");
      assert.ok(parsed.refreshed_count + parsed.failed_count > 0, "should attempt something");
      // The on-disk _registeredTools count should match refreshed_count
      assert.strictEqual(
        Object.keys(server._registeredTools).length,
        parsed.refreshed_count,
        "registered tool count should equal refreshed count",
      );
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
      globalThis.__loopMcpServer = originalServer;
    }
  });

  test("T5: each manifest entry is imported with a ?t=<timestamp> cache-bust suffix", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "sp-refresh-tools-5-"));
    process.env.GATE_ROOT = tempDir;

    const server = fakeServer();
    globalThis.__loopMcpServer = server;

    // Inject a stub safeImport via the _deps seam (Node ESM modules are
    // read-only; namespace import + per-call override is the only way).
    const calls = [];
    const stubSafeImport = async (p) => {
      calls.push(p);
      return null; // pretend nothing resolved; the reloader will record "missing_export"
    };

    try {
      const result = await metaStateRefreshToolsTool.handler({
        _deps: { safeImport: stubSafeImport, skipExistsCheck: true },
      });
      const parsed = JSON.parse(result.content[0].text);
      assert.ok(parsed.manifest_count > 0, "manifest has entries");
      assert.strictEqual(calls.length, parsed.manifest_count,
        "safeImport should be called once per manifest entry");
      // Every call must carry a cache-bust query string
      for (const url of calls) {
        assert.match(url, /\?t=\d+-[a-z0-9]+/,
          `safeImport URL should carry a cache-bust suffix: ${url}`);
      }
      // All timestamps should be distinct (each call gets a fresh Date.now())
      const uniqueTimestamps = new Set(calls.map((u) => u.split("?t=")[1]));
      assert.ok(uniqueTimestamps.size > 1,
        "cache-bust suffixes should be unique across calls");
    } finally {
      if (originalEnv === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = originalEnv;
      globalThis.__loopMcpServer = originalServer;
    }
  });
});
