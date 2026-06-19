import { z } from "zod";
import { createLoopWorkflow } from "../create-loop-workflow.js";

async function reportStatus({ process_steps_total, process_steps_complete, experiment_result, blocker_reason }) {
  const status = `Process: ${process_steps_complete}/${process_steps_total}. Experiment: ${experiment_result}${blocker_reason ? ` (${blocker_reason}).` : "."}`;
  const lifecycle_complete = process_steps_total === process_steps_complete && experiment_result !== "inconclusive" && !blocker_reason;
  return { status, lifecycle_complete };
}

export const workflowReportPhaseStatus = createLoopWorkflow({
  id: "workflow_report_phase_status",
  description:
    "Reports the status of a workflow phase. " +
    "Use AFTER completing process steps to determine if the phase lifecycle is complete. " +
    "Returns a status string and lifecycle_complete boolean. " +
    "Failure mode: missing required fields return error.",
  inputSchema: {
    process_steps_total: z.coerce.number().int().min(1).describe("Total number of process steps in the phase"),
    process_steps_complete: z.coerce.number().int().min(0).describe("Number of process steps completed so far"),
    experiment_result: z.enum(["success", "failure", "inconclusive"]).describe("Result of the phase experiment"),
    blocker_reason: z.string().optional().describe("Optional reason why the phase is blocked"),
  },
  steps: [
    {
      id: "report-status",
      description: "Derive status and lifecycle_complete from counts",
      inputSchema: {
        process_steps_total: z.coerce.number().int().min(1),
        process_steps_complete: z.coerce.number().int().min(0),
        experiment_result: z.enum(["success", "failure", "inconclusive"]),
        blocker_reason: z.string().optional(),
      },
      outputSchema: {
        status: z.string(),
        lifecycle_complete: z.boolean(),
      },
      handler: reportStatus,
    },
  ],
});
