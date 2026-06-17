import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRoot } from "#lib/resolve-root.js";
import * as serverReload from "../core/mcp-server-reload.js";
import { appendGateLog } from "#lib/gate-logging.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MANIFEST_PATH = join(__dirname, "..", "tools", "manifest.json");
// Manifest paths (e.g., "./tools/gate-tool.js") are relative to `server.js`,
// which lives at `<server>/`. The reloader must resolve them the same way
// Node resolves them when server.js calls `import("./tools/gate-tool.js")`.
const SERVER_DIR = join(__dirname, "..");

/**
 * Resolve a manifest entry's `file` (e.g., "./tools/gate-tool.js") to an
 * absolute path on disk, mirroring the resolution used by `server.js`.
 *
 * The manifest lives at `<server>/tools/manifest.json` and its entries
 * use paths relative to `server.js` (which sits at `<server>/`). For
 * example, `{ file: "./tools/gate-tool.js" }` resolves to
 * `<server>/tools/gate-tool.js`. The reloader must reproduce that
 * resolution by joining against the server directory, not the project
 * root.
 */
function resolveAbsoluteFile(_root, file, serverDir) {
  if (isAbsolute(file)) return file;
  const cleaned = file.replace(/^\.\//, "");
  return join(serverDir, cleaned);
}

/**
 * Force a fresh ESM evaluation by appending a cache-bust query string.
 * Node's module loader keys ESM modules on the resolved URL, so two
 * `import("./x.js")` calls hit the same cache. The `?t=<timestamp>` suffix
 * yields a new URL and re-evaluates the module.
 *
 * On disk, the path stays the same — only the in-memory cache is bypassed.
 */
function withCacheBust(absolutePath) {
  return `${absolutePath}?t=${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const metaStateRefreshToolsTool = {
  name: "meta_state_refresh_tools",
  description: "Re-import all 52 tool modules in-process with ESM cache-busting and re-register them on the running MCP server. Use this after editing any file under tools/learning-loop-mcp/tools/ to pick up the new code without a process restart. The tool reads the same manifest.json that server.js loaded at startup, so the reload is symmetric. Returns { refreshed: number, failed: [{file, export, error}], manifest_count, before: string[], after: string[] }. No-op (refreshed=0, manifest_count unchanged) if the manifest path is unreachable. Logs to gate-log under action: 'tools_refresh'.",
  schema: {
    dry_run: z.boolean().optional().describe("If true, list what would be re-imported but do not mutate the server. Defaults to false."),
  },
  handler: async ({ dry_run = false, _deps } = {}) => {
    // Allow tests to inject stubbed dependencies (Node ESM modules are
    // read-only; importing the namespace and re-binding here is the only
    // seam for spying on safeImport / clearRegistrations / registerTool).
    const safeImport = _deps?.safeImport ?? serverReload.safeImport;
    const clearRegistrations = _deps?.clearRegistrations ?? serverReload.clearRegistrations;
    const registerTool = _deps?.registerTool ?? serverReload.registerTool;
    let root;
    try {
      root = resolveRoot();
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "context_load_failed",
          reason: err.message,
        }) }],
      };
    }

    let manifest;
    try {
      const raw = readFileSync(MANIFEST_PATH, "utf8");
      manifest = JSON.parse(raw);
    } catch (err) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "manifest_unreadable",
          path: MANIFEST_PATH,
          reason: err.message,
        }) }],
      };
    }

    if (!Array.isArray(manifest) || manifest.length === 0) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "manifest_empty",
          path: MANIFEST_PATH,
        }) }],
      };
    }

    // Pre-flight: report what would change without mutating.
    if (dry_run) {
      const plan = manifest.map((mod) => {
        const abs = resolveAbsoluteFile(root, mod.file, SERVER_DIR);
        return {
          file: mod.file,
          export: mod.export,
          abs_path: abs,
          exists: existsSync(abs),
        };
      });
      return {
        content: [{ type: "text", text: JSON.stringify({
          dry_run: true,
          manifest_count: manifest.length,
          plan,
        }) }],
      };
    }

    // Resolve the live MCP server instance. server.js attaches it to
    // globalThis so we can reach it from the reloader without import-cycle
    // pain. The first call to this tool establishes the binding; subsequent
    // calls reuse it.
    const server = globalThis.__loopMcpServer;
    if (!server) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "server_handle_unavailable",
          reason: "globalThis.__loopMcpServer is not bound. The reloader only works in the same Node process that called server.connect(transport). Restart the MCP server if you started it from a different entry point.",
        }) }],
      };
    }

    const before = clearRegistrations(server);

    const refreshed = [];
    const failed = [];
    for (const mod of manifest) {
      const abs = resolveAbsoluteFile(root, mod.file, SERVER_DIR);
      if (!existsSync(abs) && !_deps?.skipExistsCheck) {
        failed.push({ file: mod.file, export: mod.export, error: "module_not_found", abs_path: abs });
        continue;
      }
      const imported = await safeImport(withCacheBust(abs), root);
      if (imported && imported[mod.export]) {
        try {
          registerTool(server, imported[mod.export], root);
          refreshed.push(mod.file);
        } catch (err) {
          failed.push({ file: mod.file, export: mod.export, error: "register_failed", reason: err.message });
        }
      } else {
        failed.push({ file: mod.file, export: mod.export, error: "missing_export" });
      }
    }

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "meta_state_refresh_tools",
      action: "tools_refresh",
      manifest_count: manifest.length,
      refreshed_count: refreshed.length,
      failed_count: failed.length,
      cleared: before.cleared,
    });

    return {
      content: [{ type: "text", text: JSON.stringify({
        manifest_count: manifest.length,
        refreshed_count: refreshed.length,
        failed_count: failed.length,
        refreshed,
        failed,
        before: before.before,
        after: refreshed,
        status: failed.length === 0 ? "refreshed" : "partial",
      }) }],
    };
  },
};
