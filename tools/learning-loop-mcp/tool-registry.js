import { appendGateLog } from "#lib/gate-logging.js";

const registeredNames = new Set();
const MAX_RECURSION_DEPTH = 2;

function unwrapTypeName(fieldSchema) {
  if (!fieldSchema) return null;
  let cur = fieldSchema;
  for (let i = 0; i < 5 && cur; i++) {
    const typeName = cur._def?.typeName ?? cur.constructor?.name;
    if (
      typeName === "ZodOptional" || typeName === "ZodNullable" ||
      typeName === "ZodDefault" || typeName === "ZodEffects" ||
      typeName === "ZodTransform" || typeName === "ZodLazy"
    ) {
      cur = cur._def?.innerType ?? cur._def?.schema;
      continue;
    }
    return typeName;
  }
  return null;
}

function coerceValue(value, typeName) {
  if (typeName === "ZodArray" && typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : value;
    } catch {
      return value;
    }
  }
  if (typeName === "ZodBoolean" && typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  }
  if (typeName === "ZodNumber" && typeof value === "string") {
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      const n = parseFloat(value);
      return Number.isFinite(n) ? n : value;
    }
    return value;
  }
  return undefined;
}

export function coerceParamsToSchema(args, schema, root = null, depth = 0) {
  if (!schema || !args || typeof args !== "object") return args;
  const shape = schema.shape || schema;
  if (!shape || typeof shape !== "object") return args;

  const coerced = { ...args };
  let didCoerce = false;

  for (const [key, value] of Object.entries(args)) {
    const fieldSchema = shape[key];
    if (!fieldSchema) continue;
    const typeName = unwrapTypeName(fieldSchema);
    if (!typeName) {
      if (root) {
        try {
          appendGateLog(root, {
            action: "coercion_introspection_failed",
            field: key,
            reason: "typeName null after unwrap",
          });
        } catch { /* logging is best-effort */ }
      }
      continue;
    }
    const next = coerceValue(value, typeName);
    if (next !== undefined) {
      coerced[key] = next;
      didCoerce = didCoerce || next !== value;
    }

    if (
      depth < MAX_RECURSION_DEPTH &&
      typeName === "ZodObject" &&
      value && typeof value === "object" && !Array.isArray(value)
    ) {
      const nested = coerceParamsToSchema(value, fieldSchema, root, depth + 1);
      if (nested !== value) {
        coerced[key] = nested;
        didCoerce = true;
      }
    }
  }
  return didCoerce ? coerced : args;
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

  server.tool(config.name, config.description, config.schema, wrappedHandler);
}
