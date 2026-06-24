import { z } from "zod";
import { createLoopWorkflow } from "../create-loop-workflow.js";
import { stripEnvelope } from "../core/envelope-stripper.js";

const CANDIDATES = {
  "schema-change": { candidate: "runtime-schema-validation-experiment", path: "operator-approval → schema-draft → validate → migrate" },
  "workflow-gap": { candidate: "workflow-coverage-experiment", path: "operator-approval → gap-record → implementation → verify" },
  "heuristic-tune": { candidate: "heuristic-tune-experiment", path: "operator-approval → baseline-record → tune → validate" },
  "tool-addition": { candidate: "tool-addition-experiment", path: "operator-approval → spec-draft → implement → test" },
};

async function proposeExperiment({ improvement_type, description, proposed_changes }) {
  const meta = CANDIDATES[improvement_type];
  if (!meta) {
    return { error: true, message: "Unknown improvement_type" };
  }
  return {
    experiment_candidate: meta.candidate,
    decision_required: true,
    risks: [
      "Canonical adoption requires explicit operator decision approval.",
      "Hard-test failures must be captured as evidence before promotion.",
    ],
    next_steps: ["draft experiment record", "seek operator approval", "run validation"],
    canonical_adoption_path: meta.path,
    description,
    proposed_changes: proposed_changes || [],
  };
}

// Current handler is single-step. The factory's stateSchema + suspend/resume
// surface is ready for cross-step accumulation when a consumer (e.g. an agent
// calling this workflow) needs it; restructuring is one line at the call site.
export const workflowSelfImprovement = createLoopWorkflow({
  id: "workflow_self_improvement",
  description:
    "Turns a self-improvement proposal into an experiment candidate with a canonical adoption path. " +
    "Use WHEN the loop discovers a gap, heuristic failure, schema mismatch, or missing tool. " +
    "Hard-test failures become evidence; canonical adoption always requires explicit operator decision approval. " +
    "Returns experiment_candidate, decision_required, risks, next_steps, and canonical_adoption_path. " +
    "Failure mode: unknown improvement_type returns error.",
  inputSchema: {
    improvement_type: z.enum(["schema-change", "workflow-gap", "heuristic-tune", "tool-addition"]).describe("Type of improvement"),
    description: z.string().describe("Human-readable description of the improvement"),
    proposed_changes: z.preprocess(stripEnvelope, z.array(z.string())).optional().describe("List of proposed changes"),
  },
  steps: [
    {
      id: "propose-experiment",
      description: "Lookup table for experiment candidates",
      inputSchema: {
        improvement_type: z.enum(["schema-change", "workflow-gap", "heuristic-tune", "tool-addition"]),
        description: z.string(),
        proposed_changes: z.preprocess(stripEnvelope, z.array(z.string())).optional(),
      },
      outputSchema: {
        experiment_candidate: z.string(),
        decision_required: z.boolean(),
        risks: z.array(z.string()),
        next_steps: z.array(z.string()),
        canonical_adoption_path: z.string(),
        description: z.string(),
        proposed_changes: z.array(z.string()),
        error: z.boolean().optional(),
        message: z.string().optional(),
      },
      handler: proposeExperiment,
    },
  ],
});
