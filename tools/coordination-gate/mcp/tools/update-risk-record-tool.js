import { z } from "zod";
import { updateRisk } from "../../core/risk-writer.js";
import { appendGateLog } from "../../core/gate-logging.js";
import { resolveRoot } from "../../core/resolve-root.js";

export const updateRiskRecordTool = {
  name: "update_risk_record",
  description: "Update an existing risk record by ID. Immutable fields (id, type, created_at) are preserved. Use to change status, severity, or add mitigation after analysis.",
  schema: {
    surface: z.string().describe("Surface the risk belongs to"),
    risk_id: z.string().describe("ID of the risk record to update"),
    status: z.enum(["draft", "reviewed", "active", "mitigated", "accepted", "rejected"]).optional().describe("New status"),
    risk_statement: z.string().optional().describe("Updated risk statement"),
    category: z.enum(["license", "scope-boundary", "data-quality", "runtime", "security", "compliance", "other"]).optional().describe("Updated category"),
    severity: z.enum(["low", "medium", "high", "critical"]).optional().describe("Updated severity"),
    likelihood: z.enum(["low", "medium", "high"]).optional().describe("Updated likelihood"),
    confidence: z.enum(["low", "medium", "high"]).optional().describe("Updated confidence"),
    mitigation: z.object({
      blocked_actions: z.array(z.string()).optional(),
      required_gates: z.array(z.string()).optional(),
    }).optional().describe("Updated mitigation measures"),
    notes: z.string().optional().describe("Additional notes to append"),
  },
  handler: async ({ surface, risk_id, notes, ...updates }) => {
    const root = resolveRoot();

    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    if (notes) {
      cleanUpdates.notes = notes;
    }

    const result = updateRisk({ root, surface, risk_id, updates: cleanUpdates });

    console.error(`gate: update_risk_record ${risk_id} → ${result.updated ? "updated" : result.reason}`);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "update_risk_record",
      surface,
      risk_id,
      ...result,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
