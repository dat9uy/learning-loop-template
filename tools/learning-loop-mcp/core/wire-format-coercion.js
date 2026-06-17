// Lifted from tool-registry.js for Phase C Plan 3 cut-over. The legacy server.js is
// deleted; the coercion helpers are reused by 4 wire-format regression tests and
// (via create-loop-tool.js#wrapSchema) by the mastra factory.

import { appendGateLog } from "#lib/gate-logging.js";

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

/**
 * Unwrap {item: X} envelopes produced by MCP SDK wire framing.
 * TypeName-gated: only unwraps when target type is ZodArray or ZodObject.
 * Bounded to 3 iterations to prevent infinite loops on self-referential
 * passthrough schemas.
 *
 * @param {*} value - The value to potentially unwrap
 * @param {string} typeName - The Zod type name of the target field
 * @returns {{ value: *, unwrapped: number }} - The (potentially) unwrapped value and count
 */
function unwrapItemWrap(value, typeName) {
  if (typeName !== "ZodArray" && typeName !== "ZodObject") {
    return { value, unwrapped: 0 };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { value, unwrapped: 0 };
  }

  let cur = value;
  let depth = 0;
  while (depth < 3) {
    const keys = Object.keys(cur);
    if (keys.length !== 1 || keys[0] !== "item") break;
    cur = cur.item;
    depth++;
  }
  return { value: cur, unwrapped: depth };
}

// fallow-ignore-next-line complexity
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

    // Unwrap {item: X} envelopes produced by MCP SDK wire framing.
    const unwrapResult = unwrapItemWrap(coerced[key], typeName);
    if (unwrapResult.unwrapped > 0) {
      coerced[key] = unwrapResult.value;
      didCoerce = true;
      if (root) {
        try {
          appendGateLog(root, {
            action: "item_wrap_unwrapped",
            field: key,
            depth: unwrapResult.unwrapped,
          });
        } catch { /* logging is best-effort */ }
      }
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
 * Install wire-format coercion before the MCP SDK's validateToolInput.
 * Must be called after `new McpServer()` and before registering tools.
 *
 * The patch intercepts `validateToolInput(tool, args, toolName)` and runs
 * `coerceParamsToSchema(args, tool._coerceSchema)` before the original Zod
 * parse. This fixes top-level array/boolean coercion for stdio transport
 * where the SDK validates before our handler-level coercion runs.
 */
export function installWireFormatCoercion(server, root) {
  const original = server.validateToolInput.bind(server);

  server.validateToolInput = async function (tool, args, toolName) {
    let coercedArgs = args;
    if (tool?._coerceSchema && args && typeof args === "object") {
      try {
        coercedArgs = coerceParamsToSchema(args, tool._coerceSchema, root);
      } catch (err) {
        if (root) {
          try {
            appendGateLog(root, {
              action: "wire_format_coercion_failed",
              tool: toolName,
              error: err.message,
            });
          } catch { /* logging is best-effort */ }
        }
      }
    }
    return original(tool, coercedArgs, toolName);
  };

  if (
    typeof server.validateToolInput !== "function" ||
    server.validateToolInput === original
  ) {
    throw new Error(
      "installWireFormatCoercion failed: validateToolInput was not patched",
    );
  }
}
