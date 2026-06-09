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
    // Mimic the real MCP SDK's registerTool contract: store the config
    // by name in _registeredTools. Tests inspect the map to verify
    // bookkeeping; they do not exercise the actual MCP dispatch.
    tool(name, _description, _schema, _handler) {
      registered[name] = { name, handler: _handler };
    },
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
    // T4 exercises the production reload path. Several manifest tools
    // (e.g. record-observation-tool.js) call `resolveRoot()` at module
    // top level to load schemas. Hijacking GATE_ROOT to a temp dir (as T1/T2
    // do) makes those module loads throw ENOENT on schema paths, which is
    // a test-harness artifact — not a real reload failure. Production
    // always runs with GATE_ROOT unset, so we mirror that here.
    const savedGateRoot = process.env.GATE_ROOT;
    delete process.env.GATE_ROOT;

    const server = fakeServer();
    globalThis.__loopMcpServer = server;

    try {
      const result = await metaStateRefreshToolsTool.handler({});
      const parsed = JSON.parse(result.content[0].text);
      assert.ok(parsed.manifest_count > 0, "manifest should have at least one entry");
      // Regression guard: paths in manifest.json are relative to
      // server.js (server/), not the project root. A previous bug joined
      // them with root and produced "<root>/tools/gate-tool.js" — non-
      // existent, so all imports failed. Asserting refreshed_count > 0
      // catches that regression.
      assert.ok(parsed.refreshed_count > 0,
        `reloader should successfully re-import real manifest entries; got refreshed_count=${parsed.refreshed_count}, failed_count=${parsed.failed_count}, first_failure=${JSON.stringify(parsed.failed?.[0])}`);
      assert.strictEqual(parsed.failed_count, 0,
        `real manifest reload should produce zero failures; got ${JSON.stringify(parsed.failed?.[0])}`);
      // The on-disk _registeredTools count should match refreshed_count
      assert.strictEqual(
        Object.keys(server._registeredTools).length,
        parsed.refreshed_count,
        "registered tool count should equal refreshed count",
      );
    } finally {
      if (savedGateRoot === undefined) delete process.env.GATE_ROOT;
      else process.env.GATE_ROOT = savedGateRoot;
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
