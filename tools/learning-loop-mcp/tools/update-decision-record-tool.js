import { z } from "zod";
import { composeUpdateSchema } from "#mcp/core/schema-to-zod.js";
import { updateDecision } from "#mcp/core/decision-writer.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { validateSourceRefs } from "#mcp/lib/source-ref-validator.js";

// Schema-derived update schema; `surface` is a tool-only field (used to find
// the record's directory). `decision_id` is also tool-only. The decision's
// `decision_effect` is a top-level property in the schema (not a separate
// nested block), so it's already part of the input shape.
const baseSchema = composeUpdateSchema({
  type: "decision",
  root: resolveRoot(),
  excludeFields: ["id", "schema_version", "type", "status", "created_at", "updated_at"],
  toolOnlyFields: {
    surface: z.string().describe("Surface the decision belongs to (must match creation surface)"),
    decision_id: z.string().describe("ID of the decision record to update"),
  },
});

export const recordUpdateDecisionTool = {
  name: "record_update_decision",
  description: "Update an existing decision record by ID. Immutable fields (id, type, created_at) are preserved. source_refs is append-only: new refs are merged with existing, duplicates removed. Use to change status from draft to reviewed/approved, or update rationale/tradeoffs.",
  schema: baseSchema.shape,
  handler: async ({ surface, decision_id, notes, source_refs, ...updates }) => {
    const root = resolveRoot();

    // Validate source_refs if provided
    if (source_refs) {
      const validation = validateSourceRefs(source_refs, "decision", root);
      if (!validation.valid) {
        return {
          content: [{ type: "text", text: JSON.stringify({ updated: false, reason: "invalid_source_refs", errors: validation.errors }) }],
          isError: true,
        };
      }
    }

    // Filter out undefined values so we don't overwrite with undefined
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    if (notes) {
      cleanUpdates.notes = notes;
    }

    if (source_refs) {
      cleanUpdates.source_refs = source_refs;
    }

    const result = updateDecision({ root, surface, decision_id, updates: cleanUpdates });

    console.error(`gate: update_decision_record ${decision_id} → ${result.updated ? "updated" : result.reason}`);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "record_update_decision",
      surface,
      decision_id,
      ...result,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
