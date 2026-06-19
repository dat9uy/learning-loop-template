import { stripEnvelope } from "#mcp/core/envelope-stripper.js";
import { z } from "zod";

function classifyVerificationType(entry) {
  const dim = String(entry.dimension || "").toLowerCase();
  const scope = String(entry.scope || "").toLowerCase();
  if (dim === "runtime" || scope.includes("container") || scope.includes("live")) return "runtime";
  if (dim === "install" || scope.includes("import")) return "import";
  return "static";
}

export const workflowIntakePlanTool = {
  name: "workflow_intake_plan",
  description:
    "Consumes orient output and produces an ordered verification plan. " +
    "Use AFTER workflow_intake_orient to decide which records to read, which tools to invoke, and which questions to ask. " +
    "Returns an array of ordered steps with verification type classification (static, import, runtime). " +
    "Failure mode: missing orient_result or empty candidates returns blocked status.",
  schema: {
    orient_result: z.preprocess(stripEnvelope, z.object({
      index_entries: z.array(z.object({}).passthrough()).optional(),
      meta_triggers: z.array(z.string()).optional(),
      observations: z.array(z.object({}).passthrough()).optional(),
      capability_files: z.array(z.string()).optional(),
      missing_decisions: z.array(z.string()).optional(),
    })).describe("Output object from workflow_intake_orient"),
  },
  handler: async (args) => {
    const orient = args.orient_result;
    if (!orient || typeof orient !== "object") {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: true, message: "orient_result is required" }) }],
        isError: true,
      };
    }

    const entries = orient.index_entries || [];
    if (entries.length === 0) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ status: "blocked", steps: [], message: "No verification candidates found" }),
        }],
      };
    }

    const steps = [];
    let stepNum = 1;

    for (const entry of entries) {
      const vtype = classifyVerificationType(entry);
      steps.push({
        step_number: stepNum++,
        action: "read_record",
        record_id: entry.id || "unknown",
        verification_type: vtype,
        suggested_tool: vtype === "runtime" ? "trigger_workflow" : "validate_records",
        questions: [],
      });
    }

    for (const meta of orient.meta_triggers || []) {
      steps.push({
        step_number: stepNum++,
        action: "review_meta_trigger",
        record_id: meta,
        verification_type: "static",
        questions: ["Does this meta trigger require a schema update?"],
      });
    }

    for (const dec of orient.missing_decisions || []) {
      steps.push({
        step_number: stepNum++,
        action: "ask_decision",
        record_id: dec,
        verification_type: "product",
        questions: ["What is the product decision for this claim?"],
      });
    }

    if (orient.observations && orient.observations.some((o) => o.status === "inactive")) {
      steps.push({
        step_number: stepNum++,
        action: "reactivate_observation",
        record_id: "inactive_observations",
        verification_type: "static",
        questions: ["Should inactive observations be reactivated?"],
      });
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ status: "ready", steps }),
      }],
    };
  },
};
