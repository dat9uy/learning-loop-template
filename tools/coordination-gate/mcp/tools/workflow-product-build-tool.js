import { z } from "zod";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveRoot } from "../../core/resolve-root.js";

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

function checkDecisionRecords(root, surface) {
  const decisionsDir = join(root, "records", surface, "decisions");
  if (!existsSync(decisionsDir)) {
    return { has_decisions: false, count: 0, files: [] };
  }
  const files = readdirSync(decisionsDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  return { has_decisions: files.length > 0, count: files.length, files };
}

export const workflowProductBuildTool = {
  name: "workflow_product_build",
  description:
    "Expands a user product request into structured assertions, risks, experiments, decisions, and required records. " +
    "Use WHEN a product request arrives to decompose it into verifiable artifacts. " +
    "References capability generation extension rules and meta-evidence self-improvement patterns. " +
    "Returns assertions[], risks[], experiments[], decisions[], required_records[], and decision_coverage. " +
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
    const root = resolveRoot();
    const out = expand(request, args.scope, args.known_constraints || []);
    const decisionCoverage = checkDecisionRecords(root, args.scope);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          ...out,
          decision_coverage: decisionCoverage,
          decision_coverage_required: true,
          can_proceed: decisionCoverage.has_decisions,
        }),
      }],
    };
  },
};
