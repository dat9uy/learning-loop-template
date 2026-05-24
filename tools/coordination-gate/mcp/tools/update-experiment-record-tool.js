import { z } from "zod";
import { updateExperiment } from "../../core/experiment-writer.js";
import { appendGateLog } from "../../core/gate-logging.js";
import { resolveRoot } from "../../core/resolve-root.js";
import { validateSourceRefs } from "../lib/source-ref-validator.js";

export const updateExperimentRecordTool = {
  name: "update_experiment_record",
  description: "Update an existing experiment record by ID. Immutable fields (id, type, created_at) are preserved. source_refs is append-only: new refs are merged with existing, duplicates removed. Use to record results, change status, add observations, or update verification after experiment execution.",
  schema: {
    surface: z.string().describe("Surface the experiment belongs to"),
    experiment_id: z.string().describe("ID of the experiment record to update"),
    status: z.enum(["draft", "reviewed", "approved", "rejected"]).optional().describe("New status"),
    goal: z.string().optional().describe("Updated goal"),
    hypothesis: z.string().optional().describe("Updated hypothesis"),
    method: z.array(z.string()).optional().describe("Updated method steps"),
    success_metrics: z.array(z.string()).optional().describe("Updated success criteria"),
    result: z.string().optional().describe("Experiment result (e.g., 'supports', 'does-not-support', 'inconclusive')"),
    agent_outcome: z.string().optional().describe("Agent's assessment of the outcome"),
    product_outcome: z.string().optional().describe("Product impact of the outcome"),
    observations: z.array(z.any()).optional().describe("Observations recorded during experiment"),
    promotion_review: z.array(z.any()).optional().describe("Promotion review notes"),
    source_refs: z.array(z.string()).optional().describe("Source references to append (append-only, deduplicated)"),
    verification: z.object({
      claim_refs: z.array(z.string()).optional().describe("Claims this experiment validates"),
      proves: z.array(z.object({
        dimension: z.enum(["static", "install", "runtime"]).describe("Verification dimension"),
        scope: z.enum(["sandbox", "production"]).optional().describe("Scope of verification"),
        output_level: z.enum(["none", "docs-only", "metadata-only", "runtime-captured", "product-code"]).describe("Output granularity proven"),
      })).optional().describe("What this experiment proves"),
      requires_human_approval: z.boolean().optional().describe("Whether human approval is required"),
      approval_status: z.enum(["not-required", "requested", "approved", "rejected"]).optional().describe("Current approval status"),
    }).optional().describe("Updated verification block"),
    notes: z.string().optional().describe("Additional notes to append"),
  },
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
      tool: "update_experiment_record",
      surface,
      experiment_id,
      ...result,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
