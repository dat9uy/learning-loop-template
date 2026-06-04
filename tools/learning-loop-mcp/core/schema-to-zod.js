import { z } from "zod";
import { loadSchemas } from "./schema-loader.js";
import { loadDescriptions } from "./schema-description-loader.js";

/**
 * Pass-through to zod 4.4.3's built-in z.fromJSONSchema(). The spike at
 * __tests__/schema-to-zod-spike.test.js proves it converts all 6 active
 * schemas; this wrapper adds project-specific concerns (excludeFields,
 * optional description sidecar, strict-mode override).
 *
 * The deprecated claim.schema.json is NOT routed through this module; it
 * remains on its hand-written zod schema in tools/update-claim-tool.js.
 */
export function zodFromSchema(jsonSchema) {
  return z.fromJSONSchema(jsonSchema);
}

/**
 * Build the zod schema for a record-type tool input.
 * - Loads the schema via loadSchemas(root)
 * - Strips writer-generated fields via excludeFields
 * - Applies sidecar descriptions (only for fields with a sidecar entry)
 * - Forces .strict() to match the project's existing strip behavior
 *   (the converter otherwise produces .passthrough() when the schema
 *   omits additionalProperties)
 */
export function buildZodSchemaFor(type, { root, excludeFields = [], name } = {}) {
  const schemas = loadSchemas(root);
  const jsonSchema = schemas[type];
  if (!jsonSchema) throw new Error(`schema-to-zod: unknown type "${type}"`);

  let zodSchema = zodFromSchema(jsonSchema);
  zodSchema = zodSchema.strict();

  if (excludeFields.length) {
    const shape = { ...zodSchema.shape };
    for (const field of excludeFields) delete shape[field];
    zodSchema = z.object(shape).strict();
  }

  const descriptions = loadDescriptions();
  const typeDescriptions = descriptions[type] || {};
  if (Object.keys(typeDescriptions).length) {
    const newShape = { ...zodSchema.shape };
    for (const [key, description] of Object.entries(typeDescriptions)) {
      if (newShape[key] && description) {
        newShape[key] = newShape[key].describe(description);
      }
    }
    zodSchema = z.object(newShape).strict();
  }

  return zodSchema;
}

/**
 * Lower-level helper for nested blocks (e.g., the `verification` object on
 * the update tool). Same compose pattern as buildZodSchemaFor, but operates
 * on a properties map rather than a full record-type schema.
 */
export function zodObjectForProperties(properties, required = [], { descriptions = {} } = {}) {
  let obj = zodFromSchema({ type: "object", properties, required });
  obj = obj.strict();
  if (Object.keys(descriptions).length) {
    const newShape = { ...obj.shape };
    for (const [key, description] of Object.entries(descriptions)) {
      if (newShape[key] && description) newShape[key] = newShape[key].describe(description);
    }
    obj = z.object(newShape).strict();
  }
  return obj;
}
