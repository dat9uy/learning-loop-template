import { z } from "zod";

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

export const workflowIntentionalSkipTool = {
  name: "workflow_intentional_skip",
  description:
    "Processes an intentional skip decision for an assertion. " +
    "Use WHEN the operator or agent decides to bypass a specific assertion. " +
    "Converts skipped knowledge into required loop artifacts so nothing disappears. " +
    "Returns status (blocked, narrowed, accepted), records_required, blocked_work, allowed_work, and rationale. " +
    "Failure mode: empty skip_reason returns blocked.",
  schema: {
    assertion_id: z.string().describe("Identifier of the assertion being skipped"),
    skip_reason: z.string().describe("Human-readable reason for the skip"),
    scope: z.string().describe("Scope or risk class of the assertion"),
  },
  handler: async (args) => {
    const status = decideStatus(args.skip_reason, args.scope);
    const out = buildOutput(args.assertion_id, args.skip_reason, args.scope, status);
    return { content: [{ type: "text", text: JSON.stringify(out) }] };
  },
};
