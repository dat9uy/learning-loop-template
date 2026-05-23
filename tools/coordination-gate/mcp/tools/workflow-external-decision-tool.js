import { z } from "zod";

function assess(source, authority, confirmed, remaining) {
  if (remaining.length > 0) {
    return {
      acceptance: "partial",
      records_required: [`update_observation: decision from ${source} accepted partially`],
      risks: [`Remaining blocks: ${remaining.join(", ")}`],
      capability_boundaries: [authority],
      rationale: `External decision from ${source} accepted partially because ${remaining.length} block(s) remain outside authority scope.`,
    };
  }
  if (confirmed.startsWith(authority) || authority === confirmed) {
    return {
      acceptance: "full",
      records_required: [`update_observation: decision from ${source} accepted fully`],
      risks: ["None — full authority coverage."],
      capability_boundaries: [authority],
      rationale: `External decision from ${source} fully covers confirmed scope under authority ${authority}.`,
    };
  }
  return {
    acceptance: "rejected",
    records_required: [`record_observation: decision from ${source} rejected — scope mismatch`],
    risks: [`Confirmed scope ${confirmed} exceeds authority ${authority}`],
    capability_boundaries: [authority],
    rationale: `External decision from ${source} rejected because confirmed scope exceeds authority scope.`,
  };
}

export const workflowExternalDecisionTool = {
  name: "workflow_external_decision",
  description:
    "Records an external decision and evaluates its acceptance against authority scope. " +
    "Use WHEN a stakeholder or external system confirms a scope boundary. " +
    "Seeds the decision into the loop while recording scope, basis, risks, and capability boundaries. " +
    "Returns acceptance (partial/full/rejected), records_required, risks, capability_boundaries, and rationale. " +
    "Failure mode: missing required fields return error.",
  schema: {
    source: z.string().describe("Source of the external decision"),
    authority_scope: z.string().describe("Scope the external authority actually controls"),
    confirmed_scope: z.string().describe("Scope the external authority confirmed"),
    remaining_blocks: z.array(z.string()).optional().describe("Scopes still blocked after the decision"),
  },
  handler: async (args) => {
    const out = assess(args.source, args.authority_scope, args.confirmed_scope, args.remaining_blocks || []);
    return { content: [{ type: "text", text: JSON.stringify(out) }] };
  },
};
