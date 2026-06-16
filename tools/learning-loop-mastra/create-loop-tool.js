import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const MAX_RECURSION_DEPTH = 2;
const MAX_UNWRAP_ITERATIONS = 3;
const MAX_TYPE_NAME_UNWRAP = 5;

function getTypeName(fieldSchema) {
  return fieldSchema._def?.typeName ?? fieldSchema.constructor?.name;
}

function unwrapTypeName(fieldSchema) {
  if (!fieldSchema) return null;
  let cur = fieldSchema;
  for (let i = 0; i < MAX_TYPE_NAME_UNWRAP && cur; i++) {
    const typeName = getTypeName(cur);
    if (
      typeName === "ZodOptional" || typeName === "ZodNullable" ||
      typeName === "ZodDefault" || typeName === "ZodEffects" ||
      typeName === "ZodTransform" || typeName === "ZodLazy" ||
      typeName === "ZodPreprocess" || typeName === "ZodPipe"
    ) {
      // Zod v4: optional/default use .def.innerType; preprocess/pipe use .def.in/.def.out
      const nxt = cur._def?.innerType ?? cur._def?.schema ?? cur._def?.in ?? cur._def?.out;
      if (nxt) { cur = nxt; continue; }
      // Fallback for Zod v4: try .def directly
      const def = cur.def || cur._def;
      if (def) {
        const nxt2 = def.innerType ?? def.schema ?? def.in ?? def.out;
        if (nxt2) { cur = nxt2; continue; }
      }
      return null;
    }
    return typeName;
  }
  return null;
}

function coerceScalar(value, typeName) {
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
  return value;
}

function unwrapItem(value, typeName) {
  if (typeName !== "ZodArray" && typeName !== "ZodObject") {
    return { value, unwrapped: 0 };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { value, unwrapped: 0 };
  }

  let cur = value;
  let depth = 0;
  while (depth < MAX_UNWRAP_ITERATIONS) {
    const keys = Object.keys(cur);
    if (keys.length !== 1 || keys[0] !== "item") break;
    cur = cur.item;
    depth++;
  }
  return { value: cur, unwrapped: depth };
}

function extractShape(schema) {
  if (!schema) return null;
  // Case 1: ZodObject schema (Zod v3 or v4)
  const defShape = schema._def?.shape ?? schema.def?.shape;
  if (defShape) return defShape;
  // Case 2: plain .shape object (e.g., metaStateProposeDesignTool.schema)
  if (schema.shape && typeof schema.shape === "object" && !schema.shape._def) {
    return schema.shape;
  }
  // Case 3: the schema IS the shape object already
  if (typeof schema === "object" && !schema._def && !schema.def && !Array.isArray(schema)) {
    return schema;
  }
  return null;
}

function coerceShape(shape, args, depth = 0) {
  if (!shape || !args || typeof args !== "object") return args;
  const out = { ...args };
  let changed = false;

  for (const [key, value] of Object.entries(args)) {
    const fieldSchema = shape[key];
    if (!fieldSchema) continue;
    const typeName = unwrapTypeName(fieldSchema);
    if (!typeName) continue;

    const next = coerceScalar(value, typeName);
    if (next !== value) { out[key] = next; changed = true; }

    const { value: stripped, unwrapped } = unwrapItem(out[key], typeName);
    if (unwrapped > 0) { out[key] = stripped; changed = true; }

    if (
      depth < MAX_RECURSION_DEPTH &&
      typeName === "ZodObject" &&
      out[key] && typeof out[key] === "object" && !Array.isArray(out[key])
    ) {
      const childShape = extractShape(fieldSchema);
      const nested = coerceShape(childShape, out[key], depth + 1);
      if (nested !== out[key]) { out[key] = nested; changed = true; }
    }
  }
  return changed ? out : args;
}

function wrapSchema(inputSchema) {
  const shape = extractShape(inputSchema);
  if (!shape) return inputSchema;
  // If inputSchema is a plain shape object (not a ZodObject), reconstruct a ZodObject
  // so Mastra's createTool can convert it to JSON schema.
  const zodSchema = inputSchema._def || inputSchema.def
    ? inputSchema
    : z.object(shape);
  return z.preprocess((v) => coerceShape(shape, v ?? {}), zodSchema);
}

export function coerceParams(args, schema) {
  const shape = extractShape(schema);
  return coerceShape(shape, args);
}

export function createLoopTool({ id, description, inputSchema, execute }) {
  return createTool({ id, description, inputSchema: wrapSchema(inputSchema), execute });
}
