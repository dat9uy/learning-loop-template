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
