import { z } from "zod";
import { createDecision } from "#mcp/core/decision-writer.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { validateSourceRefs } from "#mcp/lib/source-ref-validator.js";

export const recordCreateDecisionTool = {
  name: "record_create_decision",
  description: "Create a decision record YAML file. Use this before writing product-build plans. The record starts in draft status. For product/** writes, the write gate now requires a preflight marker (via mark_preflight_complete) instead of decision records. Decision records are still required for product-build plan.md files.",
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

    // Validate source_refs if provided
    if (source_refs) {
      const validation = validateSourceRefs(source_refs, "decision", root);
      if (!validation.valid) {
        return {
          content: [{ type: "text", text: JSON.stringify({ created: false, reason: "invalid_source_refs", errors: validation.errors }) }],
          isError: true,
        };
      }
    }

    const result = createDecision({
      root,
      surface,
      question,
      decision,
      rationale,
      alternatives,
      tradeoffs,
      source_refs: source_refs || ["local:learning-loop-mcp"],
      supersedes,
      decision_effect,
    });

    console.error(`gate: create_decision_record ${surface} → ${result.created ? "created" : result.reason}`);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "record_create_decision",
      surface,
      ...result,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
