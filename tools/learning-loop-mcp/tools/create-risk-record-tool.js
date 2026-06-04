import { z } from "zod";
import { buildZodSchemaFor } from "#mcp/core/schema-to-zod.js";
import { createRisk } from "#mcp/core/risk-writer.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { validateSourceRefs } from "#mcp/lib/source-ref-validator.js";

// Schema-derived base; `surface` is a tool-only field (not in the record
// schema — it determines records/<surface>/risks/ directory layout).
const riskBaseSchema = buildZodSchemaFor("risk", {
  root: resolveRoot(),
  excludeFields: ["id", "schema_version", "type", "status", "created_at", "updated_at"],
});
const schemaShape = {
  surface: z.string().describe("Surface/scope this risk applies to (e.g., 'product', 'api')"),
  ...riskBaseSchema.shape,
};

// MCP SDK 1.29.0 accepts raw shapes; pass the shape directly.
const schema = schemaShape;

export const recordCreateRiskTool = {
  name: "record_create_risk",
  description: "Create a risk record YAML file. Risks document potential issues that may affect the project. Records start in draft status.",
  schema,
  handler: async ({ surface, risk_statement, category, severity, likelihood, confidence, source_refs, claim_refs, experiment_refs, mitigation }) => {
    const root = resolveRoot();

    // Validate source_refs if provided
    if (source_refs) {
      const validation = validateSourceRefs(source_refs, "risk", root);
      if (!validation.valid) {
        return {
          content: [{ type: "text", text: JSON.stringify({ created: false, reason: "invalid_source_refs", errors: validation.errors }) }],
          isError: true,
        };
      }
    }

    const result = createRisk({
      root,
      surface,
      risk_statement,
      category,
      severity,
      likelihood,
      confidence,
      source_refs: source_refs || ["local:learning-loop-mcp"],
      claim_refs,
      experiment_refs,
      mitigation,
    });

    console.error(`gate: create_risk_record ${surface} → ${result.created ? "created" : result.reason}`);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "record_create_risk",
      surface,
      ...result,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
