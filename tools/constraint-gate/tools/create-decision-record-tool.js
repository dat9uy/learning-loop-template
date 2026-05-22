import { z } from "zod";
import { createDecision } from "../decision-writer.js";
import { appendGateLog } from "../gate-logging.js";
import { resolveRoot } from "../resolve-root.js";

export const createDecisionRecordTool = {
  name: "create_decision_record",
  description: "Create a decision record YAML file. Use this before writing product code or product-build plans. The record starts in draft status. The write gate requires at least one decision record to exist before allowing product/** writes.",
  schema: {
    surface: z.string().describe("Surface/scope this decision applies to (e.g., 'product', 'api', 'web'). Determines directory: records/<surface>/decisions/"),
    question: z.string().describe("The question or choice this decision resolves"),
    decision: z.string().describe("The decision made"),
    rationale: z.string().optional().describe("Why this decision was chosen"),
    alternatives: z.array(z.string()).optional().describe("Alternatives considered but rejected"),
    tradeoffs: z.array(z.string()).optional().describe("Tradeoffs accepted with this decision"),
    source_refs: z.array(z.string()).optional().describe("Source references (e.g., record:..., local:...)"),
    supersedes: z.array(z.string()).optional().describe("IDs of decisions this one supersedes"),
    decision_effect: z.object({
      action: z.enum(["approve", "reject", "accept-risk", "mitigate-risk", "defer", "supersede"]),
      scope: z.enum(["planning", "install", "runtime", "product", "schema-improvement"]),
      affected_refs: z.array(z.string()),
      boundaries: z.object({
        allowed_actions: z.array(z.string()).optional(),
        blocked_actions: z.array(z.string()).optional(),
        required_gates: z.array(z.string()).optional(),
      }).optional(),
    }).optional().describe("Effect and boundaries of this decision"),
  },
  handler: async ({ surface, question, decision, rationale, alternatives, tradeoffs, source_refs, supersedes, decision_effect }) => {
    const root = resolveRoot();
    const result = createDecision({
      root,
      surface,
      question,
      decision,
      rationale,
      alternatives,
      tradeoffs,
      source_refs: source_refs || ["local:constraint-gate-mcp"],
      supersedes,
      decision_effect,
    });

    console.error(`gate: create_decision_record ${surface} → ${result.created ? "created" : result.reason}`);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "create_decision_record",
      surface,
      ...result,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
