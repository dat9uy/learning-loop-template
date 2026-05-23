import { z } from "zod";
import { updateObservation } from "../../core/observation-writer.js";
import { appendGateLog } from "../../core/gate-logging.js";
import { resolveRoot } from "../../core/resolve-root.js";

export const updateObservationTool = {
  name: "update_observation",
  description: "Update an existing observation's status. Returns updated status.",
  schema: {
    observation_id: z.string().describe("The id of the observation to update"),
    status: z.string().refine((val) => ["active", "inactive", "archived"].includes(val), {
      message: "invalid_status",
    }).describe("New status: active, inactive, or archived"),
    reason: z.string().optional().describe("Optional reason for the status change"),
  },
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
      tool: "update_observation",
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
