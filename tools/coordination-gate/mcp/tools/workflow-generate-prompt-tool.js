import { z } from "zod";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { resolveRoot } from "../../core/resolve-root.js";

const BLUEPRINTS = {
  evidence: ".claude/skills/learning-loop/references/prompt-blueprints.md",
  "state-gated": ".claude/skills/learning-loop/references/prompt-blueprints-state-gated.md",
  "product-build": ".claude/skills/learning-loop/references/prompt-blueprints-product-build.md",
  experiment: ".claude/skills/learning-loop/references/prompt-blueprints.md",
  "runtime-validation": ".claude/skills/learning-loop/references/prompt-blueprints.md",
};

const DEFAULT_SKELETON = {
  evidence: "generic-learning-loop",
  "state-gated": "constrained",
  "product-build": "pre-build",
  experiment: "experiment-planning",
  "runtime-validation": "runtime-install-proof",
};

function sanitize(v) {
  if (typeof v !== "string") return String(v ?? "");
  return v.replace(/[<>\\`\x00-\x1F]/g, "").trim();
}

const SKELETON_HEADER_MAP = {
  "generic-learning-loop": "Generic Learning-Loop",
  "runtime-install-proof": "Runtime or Install Proof",
  "experiment-planning": "Experiment Planning",
  "evidence-to-experiment": "Evidence-to-Experiment Migration",
};

function extractSkeleton(text, name) {
  const header = SKELETON_HEADER_MAP[name] || name;
  const lines = text.split("\n");
  let capturing = false;
  const out = [];
  for (const line of lines) {
    if (new RegExp(`^##\\s+.*${header}.*$`, "i").test(line)) { capturing = true; continue; }
    if (capturing && /^##\s+/.test(line)) break;
    if (capturing) out.push(line);
  }
  return out.join("\n").trim() || null;
}

function substitute(text, ctx) {
  let out = text;
  for (const [k, v] of Object.entries(ctx || {})) {
    out = out.replace(new RegExp(`\\{${k}\\}`, "g"), sanitize(v));
  }
  out = out.replace(/\[specific learning-loop task\]/g, sanitize(ctx?.goal || ctx?.dimension || "[task]"));
  out = out.replace(/\[desired outcome\]/g, sanitize(ctx?.goal || "[outcome]"));
  out = out.replace(/\[absolute path to this repo\]/g, sanitize(ctx?.work_context || "[root]"));
  return out;
}

function deriveFields(promptText, blueprint, ctx) {
  const constraints = promptText.split("\n").filter((l) => l.trim().startsWith("- Do not") || l.trim().startsWith("- Do not proceed")).map((l) => l.trim().replace(/^-\s*/, ""));
  const requiredRecords = [];
  if (blueprint === "state-gated") requiredRecords.push(`records/observations/${ctx?.system || "default"}-resource-budget.yaml`);
  if (blueprint === "product-build") requiredRecords.push("records/<surface>/decisions/...");
  if (blueprint === "runtime-validation") requiredRecords.push("records/<surface>/experiments/...");
  const suggestedTools = {
    evidence: ["validate_records", "extract_index"],
    "state-gated": ["check_gate", "trigger_workflow"],
    "product-build": ["generate_capabilities", "validate_records"],
    experiment: ["trigger_workflow", "validate_records"],
    "runtime-validation": ["list_probes", "trigger_workflow"],
  }[blueprint] || [];
  const budgetContext = blueprint === "state-gated" ? { system: ctx?.system || "", resource: ctx?.resource || "" } : {};
  const approvalGates = ["operator review"];
  if (blueprint === "state-gated") approvalGates.push("budget check");
  if (blueprint === "runtime-validation") approvalGates.push("runtime approval");
  return { constraints, required_records: requiredRecords, suggested_tools: suggestedTools, budget_context: budgetContext, approval_gates: approvalGates };
}

export const workflowGeneratePromptTool = {
  name: "workflow_generate_prompt",
  description:
    "Reads a prompt blueprint file and extracts a skeleton section to produce a structured prompt object. " +
    "Use WHEN the agent needs a ready-to-send prompt for a learning-loop task. " +
    "Sanitizes context values before substitution to prevent indirect prompt injection. " +
    "Returns prompt text, constraints, required_records, suggested_tools, budget_context, and approval_gates. " +
    "Failure mode: unknown blueprint or missing skeleton returns error.",
  schema: {
    blueprint: z.enum(["evidence", "state-gated", "product-build", "experiment", "runtime-validation"]).describe("Blueprint category"),
    skeleton: z.string().optional().describe("Skeleton name within the blueprint"),
    context: z.object({}).passthrough().optional().describe("Context values for substitution"),
  },
  handler: async (args) => {
    const root = resolveRoot(args.root);
    const file = BLUEPRINTS[args.blueprint];
    if (!file) {
      return { content: [{ type: "text", text: JSON.stringify({ error: true, message: "Unknown blueprint" }) }], isError: true };
    }
    let text;
    try {
      text = await readFile(resolve(root, file), "utf-8");
    } catch {
      return { content: [{ type: "text", text: JSON.stringify({ error: true, message: "Blueprint file not found" }) }], isError: true };
    }
    const skeleton = args.skeleton || DEFAULT_SKELETON[args.blueprint];
    const section = extractSkeleton(text, skeleton);
    if (!section) {
      return { content: [{ type: "text", text: JSON.stringify({ error: true, message: `Skeleton "${skeleton}" not found` }) }], isError: true };
    }
    const prompt = substitute(section, args.context || {});
    const derived = deriveFields(prompt, args.blueprint, args.context || {});
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ prompt, ...derived }),
      }],
    };
  },
};
