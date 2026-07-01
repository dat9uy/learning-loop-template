/**
 * Identify which string fields in a tool's inputSchema are file paths so the
 * R2 gate can resolve + ownership-check every input that ends up touching
 * the filesystem.
 *
 * Convention: any field whose name matches
 *   /^(file_?path|file|path|directory|dir|filename|evidence_?code_?ref|evidence_?test)$/i
 * AND whose type is ZodString is treated as a path field. The R2 gate then
 * resolves each candidate via Phase 3's `resolveInsideRoot` and checks
 * ownership.
 *
 * Future hardening: extend Zod with `z.path()` for explicit declaration;
 * replace regex-based inference. Out of scope for Plan 5.
 */

const PATH_FIELD_NAMES = /^(file_?path|file|path|directory|dir|filename|evidence_?code_?ref|evidence_?test)$/i;

/**
 * Walk a ZodObject schema (or a plain ZodShape) and return the names of
 * fields that look like file paths.
 *
 * @param {object} inputSchema
 * @returns {string[]}
 */
export function collectPathFields(inputSchema) {
  const fields = [];
  if (!inputSchema) return fields;
  const shape = inputSchema.shape ?? inputSchema;
  if (!shape || typeof shape !== "object") return fields;
  for (const [name, def] of Object.entries(shape)) {
    if (!isPathTypeName(def) && !PATH_FIELD_NAMES.test(name)) continue;
    // Only treat ZodString-shaped fields as path candidates.
    if (isZodString(def)) {
      fields.push(name);
    }
  }
  return fields;
}

function isZodString(def) {
  if (!def || typeof def !== "object") return false;
  // Walk through common wrappers: optional, default, nullable, preprocess, transform.
  const t = def._def?.typeName ?? def.def?.typeName;
  if (typeof t === "string") {
    if (t === "ZodString") return true;
    if (t === "ZodOptional" || t === "ZodNullable" || t === "ZodDefault") {
      return isZodString(def._def?.innerType ?? def.def?.innerType);
    }
  }
  // Treat any *plain* `z.string()`-style shape with a `parse` method as path-eligible.
  return typeof def?.parse === "function" && (typeof def?._def?.typeName !== "string");
}

function isPathTypeName(def) {
  return typeof def?.description === "string" && /(file_?path|path|file|directory|dir)/i.test(def.description);
}
