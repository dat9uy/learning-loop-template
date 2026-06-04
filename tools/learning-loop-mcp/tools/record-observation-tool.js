import { z } from "zod";
import { buildZodSchemaFor } from "#mcp/core/schema-to-zod.js";
import { writeObservation } from "#mcp/core/observation-writer.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

// Schema-derived base (excludes writer-generated fields + the schema's `notes`
// field, which the tool exposes as `description` for backward compatibility
// with the writer's `description → notes` mapping).
const observationBaseSchema = buildZodSchemaFor("observation", {
  root: resolveRoot(),
  excludeFields: ["id", "schema_version", "type", "status", "created_at", "updated_at", "notes"],
});

// Override: tool input uses `description` (preserved API) instead of the
// schema's `notes`. The writer maps description → notes when building YAML.
// Also make `source_refs` optional to match the previous hand-written behavior
// (the writer fills in a default of ["local:learning-loop-mcp"] when missing).
const schemaShape = {
  ...observationBaseSchema.shape,
  description: z.string().describe("Human-readable description of the observation"),
};
schemaShape.source_refs = observationBaseSchema.shape.source_refs.optional();

// MCP SDK 1.29.0 accepts raw shapes (plain object) for the schema; pass the
// shape directly rather than a z.object().strict() wrapper.
const schema = schemaShape;

export const recordCreateObservationTool = {
  name: "record_create_observation",
  description: "Record a constraint observation as a YAML file. Returns recorded status.",
  schema,
  handler: async ({ constraint_type, constraint, description, source_refs }) => {
    const root = resolveRoot();
    const result = writeObservation({
      root,
      constraint_type,
      constraint,
      description,
      source_refs: source_refs || ["local:learning-loop-mcp"],
    });

    console.error(`gate: record_observation ${constraint} → ${result.recorded ? "recorded" : result.reason}`);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "record_create_observation",
      constraint_type,
      constraint,
      ...result,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
