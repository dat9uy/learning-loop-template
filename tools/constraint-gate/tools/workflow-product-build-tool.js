import { z } from "zod";

function expand(request, scope, constraints) {
  const assertions = [`${scope}-scoped implementation satisfies: ${request}`];
  const risks = ["Canonical adoption requires explicit operator decision approval.", "Hard-test failures must be captured as evidence before promotion."];
  const experiments = [`${scope}-integration-experiment`];
  const decisions = [`scope-boundary: ${scope}`];
  const requiredRecords = ["experiment candidate record", "operator approval decision"];
  if (scope === "api" || scope === "backend") {
    assertions.push("All public surfaces have capability records generated before deployment");
    requiredRecords.push("capability generation extension record");
  }
  if (constraints && constraints.length > 0) {
    for (const c of constraints) {
      risks.push(`Constraint violation risk: ${c}`);
      experiments.push(`constraint-validation-${c.toLowerCase().replace(/[^a-z0-9]/g, "-")}`);
    }
  }
  if (request.toLowerCase().includes("payment") || request.toLowerCase().includes("auth")) {
    risks.push("Security-critical scope: intentional skip requires full justification.");
    decisions.push("security-review-required");
  }
  return { assertions, risks, experiments, decisions, required_records: requiredRecords };
}

export const workflowProductBuildTool = {
  name: "workflow_product_build",
  description:
    "Expands a user product request into structured assertions, risks, experiments, decisions, and required records. " +
    "Use WHEN a product request arrives to decompose it into verifiable artifacts. " +
    "References capability generation extension rules and meta-evidence self-improvement patterns. " +
    "Returns assertions[], risks[], experiments[], decisions[], and required_records[]. " +
    "Failure mode: empty request returns error.",
  schema: {
    request_description: z.string().describe("Human-readable product request description"),
    scope: z.string().describe("Execution scope (e.g., frontend, backend, api, mobile)"),
    known_constraints: z.array(z.string()).optional().describe("Known constraints or compliance requirements"),
  },
  handler: async (args) => {
    const request = (args.request_description || "").trim();
    if (!request) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: true, message: "request_description is required" }) }],
        isError: true,
      };
    }
    const out = expand(request, args.scope, args.known_constraints || []);
    return { content: [{ type: "text", text: JSON.stringify(out) }] };
  },
};
