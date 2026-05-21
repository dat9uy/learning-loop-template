import { z } from "zod";

export const workflowReportPhaseStatusTool = {
  name: "workflow_report_phase_status",
  description:
    "Reports the status of a workflow phase. " +
    "Use AFTER completing process steps to determine if the phase lifecycle is complete. " +
    "Returns a status string and lifecycle_complete boolean. " +
    "Failure mode: missing required fields return error.",
  schema: {
    process_steps_total: z.number().int().min(1).describe("Total number of process steps in the phase"),
    process_steps_complete: z.number().int().min(0).describe("Number of process steps completed so far"),
    experiment_result: z.enum(["success", "failure", "inconclusive"]).describe("Result of the phase experiment"),
    blocker_reason: z.string().optional().describe("Optional reason why the phase is blocked"),
  },
  handler: async (args) => {
    const { process_steps_total, process_steps_complete, experiment_result, blocker_reason } = args;
    const status = `Process: ${process_steps_complete}/${process_steps_total}. Experiment: ${experiment_result}${blocker_reason ? ` (${blocker_reason}).` : "."}`;
    const lifecycle_complete = process_steps_total === process_steps_complete && experiment_result !== "inconclusive" && !blocker_reason;
    return {
      content: [{ type: "text", text: JSON.stringify({ status, lifecycle_complete }) }],
    };
  },
};
