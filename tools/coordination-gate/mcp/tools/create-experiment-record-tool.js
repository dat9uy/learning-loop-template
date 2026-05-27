import { z } from "zod";
import { createExperiment } from "../../core/experiment-writer.js";
import { appendGateLog } from "../../../lib/gate-logging.js";
import { resolveRoot } from "../../../lib/resolve-root.js";
import { validateSourceRefs } from "../lib/source-ref-validator.js";

export const recordCreateExperimentTool = {
  name: "record_create_experiment",
  description: "Create an experiment record YAML file. Experiments prove or disprove assertions. The flow is: draft assertions (decisions) → experiment to prove → evidence (derivative). Records start in draft status.",
  schema: {
    surface: z.string().describe("Surface/scope this experiment applies to (e.g., 'product', 'api')"),
    goal: z.string().describe("What the experiment aims to determine"),
    hypothesis: z.string().optional().describe("The hypothesis being tested"),
    method: z.array(z.string()).optional().describe("Steps to execute the experiment"),
    success_metrics: z.array(z.string()).optional().describe("Criteria for success"),
    source_refs: z.array(z.string()).optional().describe("Source references"),
    scope: z.enum(["planning", "install", "runtime", "product", "schema-improvement"]).optional().describe("Scope of the experiment"),
    output_level: z.enum(["none", "docs-only", "metadata-only", "runtime-captured", "product-code"]).optional().describe("Expected output granularity"),
    claim_refs: z.array(z.string()).optional().describe("Claims this experiment validates"),
    risk_refs: z.array(z.string()).optional().describe("Risks this experiment addresses"),
  },
  handler: async ({ surface, goal, hypothesis, method, success_metrics, source_refs, scope, output_level, claim_refs, risk_refs }) => {
    const root = resolveRoot();

    // Validate source_refs if provided
    if (source_refs) {
      const validation = validateSourceRefs(source_refs, "experiment", root);
      if (!validation.valid) {
        return {
          content: [{ type: "text", text: JSON.stringify({ created: false, reason: "invalid_source_refs", errors: validation.errors }) }],
          isError: true,
        };
      }
    }

    const result = createExperiment({
      root,
      surface,
      goal,
      hypothesis,
      method,
      success_metrics,
      source_refs: source_refs || ["local:coordination-gate-mcp"],
      scope,
      output_level,
      claim_refs,
      risk_refs,
    });

    console.error(`gate: create_experiment_record ${surface} → ${result.created ? "created" : result.reason}`);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "record_create_experiment",
      surface,
      ...result,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
