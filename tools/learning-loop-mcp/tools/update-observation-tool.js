import { z } from "zod";
import { composeUpdateSchema } from "#mcp/core/schema-to-zod.js";
import { updateObservation } from "#mcp/core/observation-writer.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

// The observation update tool exposes only the `status` field from the schema
// (the writer's updateObservation only mutates `status` and `notes` via `reason`).
// All other schema fields are excluded. The `status` field is overridden to
// preserve the writer's permissive enum (active | inactive | archived) until
// Phase 4 aligns the schema enum with the writer.
const baseSchema = composeUpdateSchema({
  type: "observation",
  root: resolveRoot(),
  excludeFields: [
    "id",
    "schema_version",
    "type",
    "status",
    "created_at",
    "updated_at",
    "source_refs",
    "constraint_type",
    "constraint",
    "notes",
  ],
  toolOnlyFields: {
    observation_id: z.string().describe("The id of the observation to update"),
    status: z
      .string()
      .refine((val) => ["active", "inactive", "archived"].includes(val), {
        message: "invalid_status",
      })
      .describe("New status: active, inactive, or archived"),
    reason: z.string().optional().describe("Optional reason for the status change"),
  },
});

// MCP SDK 1.29.0 accepts raw shapes; pass the shape directly.
const schema = baseSchema.shape;

export const recordUpdateObservationTool = {
  name: "record_update_observation",
  description: "Update an existing observation's status. Returns updated status.",
  schema,
  handler: async ({ observation_id, status, reason }) => {
    const root = resolveRoot();
    const result = updateObservation({
      root,
      observation_id,
      status,
      reason,
    });

    console.error(`gate: update_observation ${observation_id} → ${result.updated ? "updated" : result.reason}`);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "record_update_observation",
      observation_id,
      status,
      reason: reason || undefined,
      ...result,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
