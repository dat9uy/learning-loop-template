import { z } from "zod";

/**
 * Recursively sort object keys so JSON-stringify comparisons are deterministic.
 */
function sortKeysDeep(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  if (obj && typeof obj === "object") {
    return Object.keys(obj)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeysDeep(obj[key]);
        return acc;
      }, {});
  }
  return obj;
}

function isZodSchema(value) {
  if (!value || typeof value !== "object") return false;
  const name = value.constructor?.name;
  return typeof value.parse === "function" || (typeof name === "string" && name.startsWith("Zod"));
}

/**
 * Convert a legacy tool schema to a ZodObject when the source is a plain shape
 * object (the common pattern in tools/learning-loop-mcp/tools/*.js). Mastra's
 * factory does the same reconstruction inside wrapSchema, so the comparison
 * stays apples-to-apples.
 */
function isJsonSchemaObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (typeof value.parse === "function") return false;
  if (value.$schema !== undefined) return true;
  if (value.type !== undefined || value.properties !== undefined) return true;
  return false;
}

/**
 * Convert a legacy tool schema to a ZodObject when the source is a plain shape
 * object (the common pattern in tools/learning-loop-mcp/tools/*.js). Mastra's
 * factory does the same reconstruction inside wrapSchema, so the comparison
 * stays apples-to-apples.
 *
 * If the value is already a serialized JSON Schema (e.g. from tools/list), leave
 * it as-is so the comparison works on the advertised schema.
 */
function normalizeSchemaForComparison(schema) {
  if (isZodSchema(schema)) return schema;
  if (isJsonSchemaObject(schema)) return schema;
  if (schema && typeof schema === "object" && !Array.isArray(schema)) {
    return z.object(schema);
  }
  return schema;
}

function toJsonSchema(schema) {
  if (isJsonSchemaObject(schema)) return schema;
  return z.toJSONSchema(schema, {
    target: "draft-7",
    unrepresentable: "any",
  });
}

/**
 * Strip metadata that is allowed to differ between the legacy McpServer and
 * Mastra JSON Schema serializations without changing the structural contract.
 */
function stripSchemaMeta(schema) {
  if (Array.isArray(schema)) return schema.map(stripSchemaMeta);
  if (schema && typeof schema === "object") {
    const { $schema, title, additionalProperties, ...rest } = schema;
    return Object.entries(rest).reduce((acc, [key, value]) => {
      acc[key] = stripSchemaMeta(value);
      return acc;
    }, {});
  }
  return schema;
}

/**
 * Compare two schemas by serializing them to JSON Schema.
 *
 * Accepts either Zod schemas (the common harness/test case) or already-serialized
 * JSON Schema objects (e.g. the inputSchema returned by MCP tools/list).
 *
 * The Mastra factory wraps input schemas with z.preprocess, which is input-only.
 * `io: "input"` unwraps the preprocess so the comparison is apples-to-apples.
 * Both sides target Draft 7 to match the legacy McpServer output.
 */
export function schemaJsonParity(legacySchema, mastraSchema) {
  const legacyNormalized = normalizeSchemaForComparison(legacySchema);
  const mastraNormalized = normalizeSchemaForComparison(mastraSchema);

  const legacyJson = toJsonSchema(legacyNormalized);
  const mastraJson = isJsonSchemaObject(mastraNormalized)
    ? mastraNormalized
    : z.toJSONSchema(mastraNormalized, {
        target: "draft-7",
        io: "input",
        unrepresentable: "any",
      });

  const legacyNorm = sortKeysDeep(stripSchemaMeta(legacyJson));
  const mastraNorm = sortKeysDeep(stripSchemaMeta(mastraJson));

  const parity = JSON.stringify(legacyNorm) === JSON.stringify(mastraNorm);
  return parity
    ? { parity: true }
    : { parity: false, diff: { legacyJson: legacyNorm, mastraJson: mastraNorm } };
}

/**
 * Compare two MCP tools/list arrays for the migrated subset.
 *
 * `nameMap` maps legacy tool names to mastra tool names (default: mastra_${name}).
 * Returns { parity: true } or { parity: false, diff: { missing, extra, schemaDiff } }.
 */
export function toolsListParity(legacyList, mastraList, opts = {}) {
  const nameMap = opts.nameMap || new Map();
  const mastraByName = new Map(mastraList.map((tool) => [tool.name, tool]));
  const diff = { missing: [], extra: [], schemaDiff: [] };

  for (const legacyTool of legacyList) {
    const mastraName = nameMap.has(legacyTool.name)
      ? nameMap.get(legacyTool.name)
      : `mastra_${legacyTool.name}`;
    const mastraTool = mastraByName.get(mastraName);

    if (!mastraTool) {
      diff.missing.push({ legacyName: legacyTool.name, mastraName });
      continue;
    }

    if (legacyTool.description !== mastraTool.description) {
      diff.schemaDiff.push({
        name: legacyTool.name,
        field: "description",
        legacy: legacyTool.description,
        mastra: mastraTool.description,
      });
    }

    const schemaResult = schemaJsonParity(
      legacyTool.inputSchema,
      mastraTool.inputSchema,
    );
    if (!schemaResult.parity) {
      diff.schemaDiff.push({
        name: legacyTool.name,
        ...schemaResult.diff,
      });
    }
  }

  const parity =
    diff.missing.length === 0 &&
    diff.extra.length === 0 &&
    diff.schemaDiff.length === 0;
  return parity ? { parity: true } : { parity: false, diff };
}

/**
 * Compare the JSON payload inside two tools/call result content[0].text strings.
 */
export function toolsCallParity(legacyCall, mastraCall, opts = {}) {
  const legacyText = legacyCall?.content?.[0]?.text;
  const mastraText = mastraCall?.content?.[0]?.text;
  if (typeof legacyText !== "string" || typeof mastraText !== "string") {
    return {
      parity: false,
      diff: {
        legacyText,
        mastraText,
        error: "content[0].text missing on one or both sides",
      },
    };
  }

  const legacyParsed = JSON.parse(legacyText);
  const mastraParsed = JSON.parse(mastraText);

  const legacyNorm = sortKeysDeep(legacyParsed);
  const mastraNorm = sortKeysDeep(mastraParsed);

  const parity = JSON.stringify(legacyNorm) === JSON.stringify(mastraNorm);
  return parity
    ? { parity: true }
    : { parity: false, diff: { legacy: legacyNorm, mastra: mastraNorm } };
}
