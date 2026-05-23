import { z } from "zod";

const CANDIDATES = {
  "schema-change": { candidate: "runtime-schema-validation-experiment", path: "operator-approval → schema-draft → validate → migrate" },
  "workflow-gap": { candidate: "workflow-coverage-experiment", path: "operator-approval → gap-record → implementation → verify" },
  "heuristic-tune": { candidate: "heuristic-tune-experiment", path: "operator-approval → baseline-record → tune → validate" },
  "tool-addition": { candidate: "tool-addition-experiment", path: "operator-approval → spec-draft → implement → test" },
};

export const workflowSelfImprovementTool = {
  name: "workflow_self_improvement",
  description:
    "Turns a self-improvement proposal into an experiment candidate with a canonical adoption path. " +
    "Use WHEN the loop discovers a gap, heuristic failure, schema mismatch, or missing tool. " +
    "Hard-test failures become evidence; canonical adoption always requires explicit operator decision approval. " +
    "Returns experiment_candidate, decision_required, risks, next_steps, and canonical_adoption_path. " +
    "Failure mode: unknown improvement_type returns error.",
  schema: {
    improvement_type: z.enum(["schema-change", "workflow-gap", "heuristic-tune", "tool-addition"]).describe("Type of improvement"),
    description: z.string().describe("Human-readable description of the improvement"),
    proposed_changes: z.array(z.string()).optional().describe("List of proposed changes"),
  },
  handler: async (args) => {
    const meta = CANDIDATES[args.improvement_type];
    if (!meta) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: true, message: "Unknown improvement_type" }) }],
        isError: true,
      };
    }
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          experiment_candidate: meta.candidate,
          decision_required: true,
          risks: [
            "Canonical adoption requires explicit operator decision approval.",
            "Hard-test failures must be captured as evidence before promotion.",
          ],
          next_steps: ["draft experiment record", "seek operator approval", "run validation"],
          canonical_adoption_path: meta.path,
          description: args.description,
          proposed_changes: args.proposed_changes || [],
        }),
      }],
    };
  },
};
