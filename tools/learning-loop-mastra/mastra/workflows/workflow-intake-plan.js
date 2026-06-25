import { z } from "zod";
import { createLoopWorkflow } from "../create-loop-workflow.js";
import { stripEnvelope } from "../../core/envelope-stripper.js";

function classifyVerificationType(entry) {
  const dim = String(entry.dimension || "").toLowerCase();
  const scope = String(entry.scope || "").toLowerCase();
  if (dim === "runtime" || scope.includes("container") || scope.includes("live")) return "runtime";
  if (dim === "install" || scope.includes("import")) return "import";
  return "static";
}

async function planSteps({ orient_result }) {
  const orient = orient_result;
  if (!orient || typeof orient !== "object") {
    return { status: "blocked", steps: [], message: "orient_result is required" };
  }

  const entries = orient.index_entries || [];
  if (entries.length === 0) {
    return { status: "blocked", steps: [], message: "No verification candidates found" };
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

  return { status: "ready", steps };
}

export const workflowIntakePlan = createLoopWorkflow({
  id: "workflow_intake_plan",
  description:
    "Consumes orient output and produces an ordered verification plan. " +
    "Use AFTER workflow_intake_orient to decide which records to read, which tools to invoke, and which questions to ask. " +
    "Returns an array of ordered steps with verification type classification (static, import, runtime). " +
    "Failure mode: missing orient_result or empty candidates returns blocked status.",
  inputSchema: {
    orient_result: z.preprocess(stripEnvelope, z.object({
      index_entries: z.array(z.object({}).passthrough()).optional(),
      meta_triggers: z.array(z.string()).optional(),
      observations: z.array(z.object({}).passthrough()).optional(),
      capability_files: z.array(z.string()).optional(),
      missing_decisions: z.array(z.string()).optional(),
    })).describe("Output object from workflow_intake_orient"),
  },
  steps: [
    {
      id: "plan-steps",
      description: "Build verification plan from orient output",
      inputSchema: {
        orient_result: z.preprocess(stripEnvelope, z.object({
          index_entries: z.array(z.object({}).passthrough()).optional(),
          meta_triggers: z.array(z.string()).optional(),
          observations: z.array(z.object({}).passthrough()).optional(),
          capability_files: z.array(z.string()).optional(),
          missing_decisions: z.array(z.string()).optional(),
        })).optional(),
      },
      outputSchema: {
        status: z.string(),
        steps: z.array(z.object({
          step_number: z.number(),
          action: z.string(),
          record_id: z.string(),
          verification_type: z.string(),
          suggested_tool: z.string().optional(),
          questions: z.array(z.string()),
        })).optional(),
        message: z.string().optional(),
      },
      handler: planSteps,
    },
  ],
});
