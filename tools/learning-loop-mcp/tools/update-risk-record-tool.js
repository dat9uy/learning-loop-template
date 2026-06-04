import { z } from "zod";
import { composeUpdateSchema } from "#mcp/core/schema-to-zod.js";
import { updateRisk } from "#mcp/core/risk-writer.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

// Schema-derived update schema; `surface` and `risk_id` are tool-only fields.
const baseSchema = composeUpdateSchema({
  type: "risk",
  root: resolveRoot(),
  excludeFields: ["id", "schema_version", "type", "status", "created_at", "updated_at"],
  toolOnlyFields: {
    surface: z.string().describe("Surface the risk belongs to"),
    risk_id: z.string().describe("ID of the risk record to update"),
  },
});

export const recordUpdateRiskTool = {
  name: "record_update_risk",
  description: "Update an existing risk record by ID. Immutable fields (id, type, created_at) are preserved. Use to change status, severity, or add mitigation after analysis.",
  schema: baseSchema.shape,
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
      tool: "record_update_risk",
      surface,
      risk_id,
      ...result,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
