import { z } from "zod";
import { composeUpdateSchema } from "#mcp/core/schema-to-zod.js";
import { updateExperiment } from "#mcp/core/experiment-writer.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { validateSourceRefs } from "#mcp/lib/source-ref-validator.js";

// Schema-derived update schema with the `verification` block re-exposed as a
// nested optional block. `verification` is excluded from the top-level shape
// (the writer auto-generates the default; the create tool excludes it too)
// and re-added via nestedBlocks. `surface` and `experiment_id` are tool-only.
const baseSchema = composeUpdateSchema({
  type: "experiment",
  root: resolveRoot(),
  excludeFields: ["id", "schema_version", "type", "status", "created_at", "updated_at", "verification"],
  nestedBlocks: { verification: "verification" },
  toolOnlyFields: {
    surface: z.string().describe("Surface the experiment belongs to"),
    experiment_id: z.string().describe("ID of the experiment record to update"),
  },
});

export const recordUpdateExperimentTool = {
  name: "record_update_experiment",
  description: "Update an existing experiment record by ID. Immutable fields (id, type, created_at) are preserved. source_refs is append-only: new refs are merged with existing, duplicates removed. Use to record results, change status, add observations, or update verification after experiment execution.",
  schema: baseSchema.shape,
  handler: async ({ surface, experiment_id, notes, source_refs, verification, ...updates }) => {
    const root = resolveRoot();

    // Validate source_refs if provided
    if (source_refs) {
      const validation = validateSourceRefs(source_refs, "experiment", root);
      if (!validation.valid) {
        return {
          content: [{ type: "text", text: JSON.stringify({ updated: false, reason: "invalid_source_refs", errors: validation.errors }) }],
          isError: true,
        };
      }
    }

    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    if (notes) {
      cleanUpdates.notes = notes;
    }

    if (source_refs) {
      cleanUpdates.source_refs = source_refs;
    }

    if (verification) {
      cleanUpdates.verification = verification;
    }

    const result = updateExperiment({ root, surface, experiment_id, updates: cleanUpdates });

    console.error(`gate: update_experiment_record ${experiment_id} → ${result.updated ? "updated" : result.reason}`);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "record_update_experiment",
      surface,
      experiment_id,
      ...result,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
