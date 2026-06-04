import { z } from "zod";
import { buildZodSchemaFor } from "#mcp/core/schema-to-zod.js";
import { createExperiment } from "#mcp/core/experiment-writer.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { validateSourceRefs } from "#mcp/lib/source-ref-validator.js";

// Schema-derived base. `verification` is excluded because the writer
// auto-generates the default verification block (claim_refs, proves: [],
// requires_human_approval: true, approval_status: not-required). The update
// tool re-exposes `verification` via composeUpdateSchema's nestedBlocks.
// `surface` is a tool-only field (not in the record schema).
const experimentBaseSchema = buildZodSchemaFor("experiment", {
  root: resolveRoot(),
  excludeFields: ["id", "schema_version", "type", "status", "created_at", "updated_at", "verification"],
});
const schemaShape = {
  surface: z.string().describe("Surface/scope this experiment applies to (e.g., 'product', 'api')"),
  ...experimentBaseSchema.shape,
};

// MCP SDK 1.29.0 accepts raw shapes; pass the shape directly.
const schema = schemaShape;

export const recordCreateExperimentTool = {
  name: "record_create_experiment",
  description: "Create an experiment record YAML file. Experiments prove or disprove assertions. The flow is: draft assertions (decisions) → experiment to prove → evidence (derivative). Records start in draft status.",
  schema,
  handler: async ({ surface, goal, hypothesis, method, success_metrics, source_refs, scope, output_level, claim_refs, risk_refs, assertion_refs }) => {
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
      source_refs: source_refs || ["local:learning-loop-mcp"],
      scope,
      output_level,
      claim_refs,
      risk_refs,
      assertion_refs,
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
