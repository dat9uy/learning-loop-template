import { z } from "zod";
import { updateExperiment } from "../../core/experiment-writer.js";
import { appendGateLog } from "../../core/gate-logging.js";
import { resolveRoot } from "../../core/resolve-root.js";

export const updateExperimentRecordTool = {
  name: "update_experiment_record",
  description: "Update an existing experiment record by ID. Immutable fields (id, type, created_at, source_refs) are preserved. Use to record results, change status, or add observations after experiment execution.",
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
    notes: z.string().optional().describe("Additional notes to append"),
  },
  handler: async ({ surface, experiment_id, notes, ...updates }) => {
    const root = resolveRoot();

    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    if (notes) {
      cleanUpdates.notes = notes;
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
