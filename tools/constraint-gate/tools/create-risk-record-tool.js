import { z } from "zod";
import { createRisk } from "../risk-writer.js";
import { appendGateLog } from "../gate-logging.js";
import { resolveRoot } from "../resolve-root.js";

export const createRiskRecordTool = {
  name: "create_risk_record",
  description: "Create a risk record YAML file. Risks document potential issues that may affect the project. Records start in draft status.",
  schema: {
    surface: z.string().describe("Surface/scope this risk applies to (e.g., 'product', 'api')"),
    risk_statement: z.string().describe("Clear statement of the risk"),
    category: z.enum(["license", "scope-boundary", "data-quality", "runtime", "security", "compliance", "other"]).optional().describe("Risk category"),
    severity: z.enum(["low", "medium", "high", "critical"]).optional().describe("Impact severity if risk materializes"),
    likelihood: z.enum(["low", "medium", "high"]).optional().describe("Probability of risk occurring"),
    confidence: z.enum(["low", "medium", "high"]).optional().describe("Confidence in the assessment"),
    source_refs: z.array(z.string()).optional().describe("Source references"),
    claim_refs: z.array(z.string()).optional().describe("Claims this risk relates to"),
    experiment_refs: z.array(z.string()).optional().describe("Experiments that address this risk"),
    mitigation: z.object({
      blocked_actions: z.array(z.string()).optional(),
      required_gates: z.array(z.string()).optional(),
    }).optional().describe("Mitigation measures"),
  },
  handler: async ({ surface, risk_statement, category, severity, likelihood, confidence, source_refs, claim_refs, experiment_refs, mitigation }) => {
    const root = resolveRoot();
    const result = createRisk({
      root,
      surface,
      risk_statement,
      category,
      severity,
      likelihood,
      confidence,
      source_refs: source_refs || ["local:constraint-gate-mcp"],
      claim_refs,
      experiment_refs,
      mitigation,
    });

    console.error(`gate: create_risk_record ${surface} → ${result.created ? "created" : result.reason}`);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "create_risk_record",
      surface,
      ...result,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
