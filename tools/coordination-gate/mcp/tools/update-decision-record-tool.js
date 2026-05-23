import { z } from "zod";
import { updateDecision } from "../../core/decision-writer.js";
import { appendGateLog } from "../../core/gate-logging.js";
import { resolveRoot } from "../../core/resolve-root.js";

export const updateDecisionRecordTool = {
  name: "update_decision_record",
  description: "Update an existing decision record by ID. Immutable fields (id, type, created_at, source_refs) are preserved. Use to change status from draft to reviewed/approved, or update rationale/tradeoffs.",
  schema: {
    surface: z.string().describe("Surface the decision belongs to (must match creation surface)"),
    decision_id: z.string().describe("ID of the decision record to update"),
    status: z.enum(["draft", "reviewed", "approved", "rejected"]).optional().describe("New status"),
    question: z.string().optional().describe("Updated question text"),
    decision: z.string().optional().describe("Updated decision text"),
    rationale: z.string().optional().describe("Updated rationale"),
    alternatives: z.array(z.string()).optional().describe("Updated alternatives"),
    tradeoffs: z.array(z.string()).optional().describe("Updated tradeoffs"),
    supersedes: z.array(z.string()).optional().describe("Updated supersedes list"),
    decision_effect: z.object({
      action: z.enum(["approve", "reject", "accept-risk", "mitigate-risk", "defer", "supersede"]),
      scope: z.enum(["planning", "install", "runtime", "product", "schema-improvement"]),
      affected_refs: z.array(z.string()),
      boundaries: z.object({
        allowed_actions: z.array(z.string()).optional(),
        blocked_actions: z.array(z.string()).optional(),
        required_gates: z.array(z.string()).optional(),
      }).optional(),
    }).optional().describe("Updated decision effect"),
    notes: z.string().optional().describe("Additional notes to append"),
  },
  handler: async ({ surface, decision_id, notes, ...updates }) => {
    const root = resolveRoot();

    // Filter out undefined values so we don't overwrite with undefined
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    if (notes) {
      cleanUpdates.notes = notes;
    }

    const result = updateDecision({ root, surface, decision_id, updates: cleanUpdates });

    console.error(`gate: update_decision_record ${decision_id} → ${result.updated ? "updated" : result.reason}`);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "update_decision_record",
      surface,
      decision_id,
      ...result,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
