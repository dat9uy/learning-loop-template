import { z } from "zod";
import { createLoopWorkflow } from "../create-loop-workflow.js";

async function prepare({ dimension, scope, output_level, command_class, temp_root_class, evidence_missing, why_local_insufficient }) {
  if (!dimension || !scope) {
    return { error: true, message: "dimension and scope are required" };
  }

  const isProduction = scope.toLowerCase() === "production";

  const preConditions = [
    {
      name: "evidence_present",
      pass: !evidence_missing,
      reason: evidence_missing ? "Required evidence is missing; collect before runtime." : "Evidence collected.",
    },
    {
      name: "observation_active",
      pass: !isProduction,
      reason: isProduction
        ? "production scope requires an active observation; none detected."
        : "scope is not production; observation check relaxed.",
    },
    {
      name: "temp_root_safe",
      pass: temp_root_class.toLowerCase() !== "persistent",
      reason: temp_root_class.toLowerCase() === "persistent"
        ? "Persistent temp root risks side effects; prefer disposable."
        : "Temp root is safe for runtime.",
    },
    {
      name: "command_allowed",
      pass: true,
      reason: "Run check_gate to validate command against allowlist.",
    },
  ];

  const allPass = preConditions.every((c) => c.pass);

  const approvalRequest = [
    "=== Runtime Command Approval Request ===",
    `Dimension: ${dimension}`,
    `Scope: ${scope}`,
    `Command class: ${command_class}`,
    `Output level: ${output_level}`,
    `Temp root: ${temp_root_class}`,
    "",
    `Why local/static is insufficient: ${why_local_insufficient}`,
    "",
    "Pre-conditions:",
    ...preConditions.map((c) => `  [${c.pass ? "PASS" : "FAIL"}] ${c.name}: ${c.reason}`),
    "",
    allPass
      ? "All pre-conditions passed. Operator may approve execution."
      : "Pre-conditions FAILED. Resolve before execution.",
    "",
    "IMPORTANT: This tool does NOT approve commands. Always run check_gate before execution.",
  ].join("\n");

  return { approval_request: approvalRequest, pre_conditions: preConditions };
}

export const workflowPrepareRuntimeRequest = createLoopWorkflow({
  id: "workflow_prepare_runtime_request",
  description:
    "Generates a structured approval request text and pre-conditions checklist for runtime commands. " +
    "Use BEFORE requesting operator approval to run sandbox, container, or production commands. " +
    "Returns an approval_request string and a pre_conditions checklist. " +
    "This tool does NOT approve commands; always run check_gate before execution. " +
    "Failure mode: missing required fields return error.",
  inputSchema: {
    dimension: z.string().describe("Verification dimension (e.g., install, runtime, product)"),
    scope: z.string().describe("Execution scope (e.g., sandbox, local, production)"),
    output_level: z.string().describe("Expected output granularity (e.g., pass/fail, summary, full)"),
    command_class: z.string().describe("Command category (e.g., setup, test, deploy)"),
    temp_root_class: z.string().describe("Temp root disposition (e.g., disposable, ephemeral, persistent)"),
    // Optional to preserve legacy tolerance: handler used `!evidence_missing`
    // (coerces undefined → true → "Evidence collected.") and templated
    // `${why_local_insufficient}` directly. Zod parse must allow the same.
    evidence_missing: z.boolean().optional().describe("Whether required evidence has not yet been collected"),
    why_local_insufficient: z.string().optional().describe("Explanation why local/static verification is insufficient"),
  },
  steps: [
    {
      id: "prepare",
      description: "Build approval request and pre-conditions checklist",
      inputSchema: {
        dimension: z.string(),
        scope: z.string(),
        output_level: z.string(),
        command_class: z.string(),
        temp_root_class: z.string(),
        evidence_missing: z.boolean().optional(),
        why_local_insufficient: z.string().optional(),
      },
      outputSchema: {
        approval_request: z.string(),
        pre_conditions: z.array(z.object({
          name: z.string(),
          pass: z.boolean(),
          reason: z.string(),
        })),
        error: z.boolean().optional(),
        message: z.string().optional(),
      },
      handler: prepare,
    },
  ],
});
