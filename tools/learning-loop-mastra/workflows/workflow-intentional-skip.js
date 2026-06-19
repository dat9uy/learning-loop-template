import { z } from "zod";
import { createLoopWorkflow } from "../create-loop-workflow.js";

function decideStatus(skipReason, scope) {
  const reason = (skipReason || "").trim().toLowerCase();
  const sc = (scope || "").trim().toLowerCase();
  if (!reason) return "blocked";
  if (sc.includes("security") || sc.includes("critical") || sc.includes("auth")) return "blocked";
  if (sc.includes("docs") || sc.includes("minor")) return "narrowed";
  return "accepted";
}

function buildOutput(assertionId, skipReason, scope, status) {
  const records = [`record_observation: assertion ${assertionId} skipped — ${skipReason || "no reason given"}`];
  if (status === "blocked") {
    return {
      status,
      records_required: records,
      blocked_work: [assertionId],
      allowed_work: [],
      rationale: `Skip blocked because scope "${scope}" is critical or reason is missing.`,
    };
  }
  if (status === "narrowed") {
    return {
      status,
      records_required: records,
      blocked_work: [],
      allowed_work: ["other assertions not depending on " + assertionId],
      rationale: `Skip narrowed to minor scope "${scope}"; capture loop artifact and continue.`,
    };
  }
  return {
    status,
    records_required: records,
    blocked_work: [],
    allowed_work: ["continue with remaining assertions"],
    rationale: `Skip accepted for low-risk scope "${scope}"; knowledge preserved as loop artifact.`,
  };
}

async function decideSkip({ assertion_id, skip_reason, scope }) {
  const status = decideStatus(skip_reason, scope);
  return buildOutput(assertion_id, skip_reason, scope, status);
}

export const workflowIntentionalSkip = createLoopWorkflow({
  id: "workflow_intentional_skip",
  description:
    "Processes an intentional skip decision for an assertion. " +
    "Use WHEN the operator or agent decides to bypass a specific assertion. " +
    "Converts skipped knowledge into required loop artifacts so nothing disappears. " +
    "Returns status (blocked, narrowed, accepted), records_required, blocked_work, allowed_work, and rationale. " +
    "Failure mode: empty skip_reason returns blocked.",
  inputSchema: {
    assertion_id: z.string().describe("Identifier of the assertion being skipped"),
    skip_reason: z.string().describe("Human-readable reason for the skip"),
    scope: z.string().describe("Scope or risk class of the assertion"),
  },
  steps: [
    {
      id: "decide-skip",
      description: "Decision tree for skip status",
      inputSchema: {
        assertion_id: z.string(),
        skip_reason: z.string(),
        scope: z.string(),
      },
      outputSchema: {
        status: z.string(),
        records_required: z.array(z.string()),
        blocked_work: z.array(z.string()),
        allowed_work: z.array(z.string()),
        rationale: z.string(),
      },
      handler: decideSkip,
    },
  ],
});
