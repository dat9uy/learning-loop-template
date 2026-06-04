import { z } from "zod";
import { buildZodSchemaFor } from "#mcp/core/schema-to-zod.js";
import { createDecision } from "#mcp/core/decision-writer.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { validateSourceRefs } from "#mcp/lib/source-ref-validator.js";

// Schema-derived base; `surface` is a tool-only field (not in the record
// schema — it determines records/<surface>/decisions/ directory layout).
const decisionBaseSchema = buildZodSchemaFor("decision", {
  root: resolveRoot(),
  excludeFields: ["id", "schema_version", "type", "status", "created_at", "updated_at"],
});
const schemaShape = {
  surface: z.string().describe("Surface/scope this decision applies to (e.g., 'product', 'api', 'web'). Determines directory: records/<surface>/decisions/"),
  ...decisionBaseSchema.shape,
};

// MCP SDK 1.29.0 accepts raw shapes; pass the shape directly.
const schema = schemaShape;

export const recordCreateDecisionTool = {
  name: "record_create_decision",
  description: "Create a decision record YAML file. Use this before writing product-build plans. The record starts in draft status. For product/** writes, the write gate now requires a preflight marker (via mark_preflight_complete) instead of decision records. Decision records are still required for product-build plan.md files.",
  schema,
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
