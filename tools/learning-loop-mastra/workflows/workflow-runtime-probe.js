import { z } from "zod";
import { createLoopWorkflow } from "../create-loop-workflow.js";

const KNOWN = {
  nodejs: { commands: ["node --version", "npm install", "npm test"], outputs: ["v", "added", "passing"] },
  python: { commands: ["python --version", "pip install -r requirements.txt", "pytest"], outputs: ["Python", "Requirement", "passed"] },
  go: { commands: ["go version", "go build ./...", "go test ./..."], outputs: ["go version", "built", "ok"] },
  rust: { commands: ["rustc --version", "cargo build", "cargo test"], outputs: ["rustc", "Compiling", "test result"] },
};

async function planProbe({ stack, probe_type, temp_dir }) {
  const s = (stack || "").trim();
  if (!s) {
    return { error: true, message: "stack is required" };
  }
  const meta = KNOWN[s.toLowerCase()] || {
    commands: [`echo "Probe for ${s}: ${probe_type}"`, "check_gate before execution"],
    outputs: ["probe_started", "gate_checked"],
  };
  const plan = [`Stack: ${s}`, `Probe type: ${probe_type}`, `Temp dir: ${temp_dir || "auto"}`, "Check live gate env var before execution", "Run per-stack commands", "Compare outputs to expected"];
  const envReqs = ["GATE_NAME_LIVE_GATE=open (operator sets after confirmation)", "operator decision record documenting allowed_actions and blocked_actions"];
  const commands = temp_dir ? meta.commands.map((c) => `${c} (cwd: ${temp_dir})`) : meta.commands;
  return { probe_plan: plan.join("\n"), shared_env_requirements: envReqs, per_stack_commands: commands, expected_outputs: meta.outputs };
}

export const workflowRuntimeProbe = createLoopWorkflow({
  id: "workflow_runtime_probe",
  description:
    "Plans a standalone feasibility probe script for a given stack and probe type. " +
    "Use BEFORE requesting operator approval for runtime execution. " +
    "References live-gate-template approval flow rules (env-var gate, fail-closed, operator decision record). " +
    "Returns probe_plan, shared_env_requirements, per_stack_commands, and expected_outputs. " +
    "Failure mode: empty stack returns error.",
  inputSchema: {
    stack: z.string().describe("Technology stack (e.g., nodejs, python, go, rust)"),
    probe_type: z.enum(["install", "build", "test", "runtime"]).describe("Type of probe to plan"),
    temp_dir: z.string().optional().describe("Optional temporary directory for the probe"),
  },
  steps: [
    {
      id: "plan-probe",
      description: "Lookup table for per-stack probe plans",
      inputSchema: {
        stack: z.string(),
        probe_type: z.enum(["install", "build", "test", "runtime"]),
        temp_dir: z.string().optional(),
      },
      outputSchema: {
        probe_plan: z.string(),
        shared_env_requirements: z.array(z.string()),
        per_stack_commands: z.array(z.string()),
        expected_outputs: z.array(z.string()),
        error: z.boolean().optional(),
        message: z.string().optional(),
      },
      handler: planProbe,
    },
  ],
});
