// Lifted from tool-registry.js for Phase C Plan 3 cut-over. Provides the in-process
// registry seam for meta_state_refresh_tools.

import { appendGateLog } from "#lib/gate-logging.js";
import { coerceParamsToSchema } from "./wire-format-coercion.js";

const registeredNames = new Set();

/**
 * Safely import a module, logging failures without crashing.
 */
export async function safeImport(path, root) {
  try {
    return await import(path);
  } catch (err) {
    appendGateLog(root || ".", {
      timestamp: new Date().toISOString(),
      action: "safeImport_failed",
      path,
      error: err.message,
    });
    return null;
  }
}

/**
 * Clear all registered tools from the in-process MCP server.
 * Reaches into the SDK's private `_registeredTools` map and the local
 * collision Set, then re-installs the request handlers so the next
 * `tools/list` and `tools/call` reflect the cleared state.
 *
 * Why this exists: the MCP server does a one-shot import of all 52 tool
 * modules at startup. Editing a tool file has zero effect on a running
 * server — the stdio child process holds handlers in memory. The
 * `meta_state_refresh_tools` admin tool calls this to wipe the registry
 * before re-importing modules with a cache-bust query string, picking up
 * the on-disk edits without a process restart.
 *
 * Failure modes:
 * - SDK internals change and `_registeredTools` is renamed. Caught by the
 *   try/catch; the caller surfaces `error: "clear_failed"` to the operator.
 * - Tool names still collide because the caller forgot to call this.
 *   Surfaced by `registerTool` as `Tool name collision: <name>`.
 *
 * @param {McpServer} server
 * @returns {{ cleared: number, before: string[] }}
 */
export function clearRegistrations(server) {
  const before = Array.from(registeredNames);
  registeredNames.clear();
  if (server && server._registeredTools && typeof server._registeredTools === "object") {
    for (const name of Object.keys(server._registeredTools)) {
      delete server._registeredTools[name];
    }
    // Re-install handlers so the SDK's dispatch table picks up the cleared
    // state. sendToolListChanged() also nudges MCP clients.
    if (typeof server.setToolRequestHandlers === "function") {
      server.setToolRequestHandlers();
    }
    if (typeof server.sendToolListChanged === "function") {
      server.sendToolListChanged();
    }
  }
  return { cleared: before.length, before };
}

/**
 * Register a tool on an MCP server with error boundary and name collision check.
 */
export function registerTool(server, config, root) {
  if (registeredNames.has(config.name)) {
    throw new Error(`Tool name collision: ${config.name} already registered`);
  }
  registeredNames.add(config.name);

  const wrappedHandler = async (args) => {
    try {
      const coerced = coerceParamsToSchema(args, config.schema, root);
      if (coerced !== args && root) {
        const coercedFields = Object.keys(coerced).filter(
          (k) => JSON.stringify(coerced[k]) !== JSON.stringify(args[k])
        );
        if (coercedFields.length > 0) {
          appendGateLog(root, {
            action: "wire_format_coerced",
            tool: config.name,
            fields: coercedFields,
          });
        }
      }
      return await config.handler(coerced);
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: true,
            tool: config.name,
            message: error.message,
          }),
        }],
        isError: true,
      };
    }
  };

  const registeredTool = server.tool(
    config.name,
    config.description,
    config.schema,
    wrappedHandler,
  );
  if (registeredTool) {
    registeredTool._coerceSchema = config.schema;
  }
}
