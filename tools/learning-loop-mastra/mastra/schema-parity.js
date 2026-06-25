import { z, globalRegistry } from "zod";

/**
 * Build a JSON-Schema-parity view of a Zod schema.
 *
 * The migration wraps fields with z.preprocess (envelope stripper) and
 * z.union([boolean, string]).transform (strict boolean guard). Those wrappers
 * keep parsing strict but change the generated JSON Schema (required keys,
 * defaults, boolean type). This helper unwraps those wrappers so the schema
 * exposed to Mastra / MCP clients stays identical to the pre-migration shape.
 *
 * It is intentionally conservative: only rebuilds the wrappers it understands,
 * and returns every other schema (primitives, checks, enums, etc.) unchanged.
 */
export function buildParitySchema(schema) {
  if (!schema || typeof schema !== "object" || !schema._zod) {
    return schema;
  }

  const def = schema._zod.def;
  const type = def.type;

  // z.preprocess(fn, inner) is represented as a pipe where `out` is the inner
  // schema. z.union(...).transform(fn) is also a pipe, but `out` is a transform.
  // Collapse the guarded-boolean pipe to a plain boolean.
  if (type === "pipe") {
    const outDef = def.out?._zod?.def;
    const inDef = def.in?._zod?.def;
    if (
      outDef?.type === "transform" &&
      inDef?.type === "union" &&
      isBooleanStringUnion(inDef.options)
    ) {
      return withMeta(z.boolean(), schema);
    }
    return withMeta(buildParitySchema(def.out), schema);
  }

  if (type === "optional") {
    return withMeta(buildParitySchema(def.innerType).optional(), schema);
  }

  if (type === "default") {
    return withMeta(
      buildParitySchema(def.innerType).default(def.defaultValue),
      schema,
    );
  }

  if (type === "nullable") {
    return withMeta(buildParitySchema(def.innerType).nullable(), schema);
  }

  if (type === "array") {
    let arr = z.array(buildParitySchema(def.element));
    const { minimum, maximum } = schema._zod.bag;
    if (typeof minimum === "number") arr = arr.min(minimum);
    if (typeof maximum === "number") arr = arr.max(maximum);
    return withMeta(arr, schema);
  }

  if (type === "object") {
    const shape = {};
    for (const key of Object.keys(def.shape)) {
      shape[key] = buildParitySchema(def.shape[key]);
    }
    let obj = z.object(shape);
    const catchall = def.catchall;
    if (catchall) {
      if (catchall._zod.def.type === "never") {
        obj = obj.strict();
      } else {
        obj = obj.catchall(buildParitySchema(catchall));
      }
    }
    return withMeta(obj, schema);
  }

  if (type === "record") {
    return withMeta(
      z.record(buildParitySchema(def.keyType), buildParitySchema(def.valueType)),
      schema,
    );
  }

  if (type === "discriminatedUnion") {
    return withMeta(
      z.discriminatedUnion(
        def.discriminator,
        def.options.map(buildParitySchema),
      ),
      schema,
    );
  }

  if (type === "union") {
    if (isBooleanStringUnion(def.options)) {
      return withMeta(z.boolean(), schema);
    }
    return withMeta(z.union(def.options.map(buildParitySchema)), schema);
  }

  if (type === "tuple") {
    let tuple = z.tuple(def.items.map(buildParitySchema));
    if (def.rest) tuple = tuple.rest(buildParitySchema(def.rest));
    return withMeta(tuple, schema);
  }

  // Primitives, literals, enums, lazy, etc. are already parity-clean.
  return schema;
}

function isBooleanStringUnion(options) {
  if (!Array.isArray(options) || options.length !== 2) return false;
  const types = new Set(options.map((o) => o?._zod?.def?.type));
  return types.has("boolean") && types.has("string");
}

function withMeta(rebuilt, original) {
  const meta = globalRegistry.get(original);
  if (meta?.description && typeof meta.description === "string") {
    return rebuilt.describe(meta.description);
  }
  return rebuilt;
}
