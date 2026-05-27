import { z } from "zod";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { resolveRoot } from "../../../lib/resolve-root.js";

function extractSnippets(text) {
  const snippets = [];
  const re = /```([a-zA-Z0-9+-]*)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    snippets.push({ language: m[1].trim() || "text", code: m[2].trim() });
  }
  return snippets;
}

function extractAssertions(text) {
  const lines = text.split("\n");
  let inFindings = false;
  const assertions = [];
  for (const line of lines) {
    if (/^##\s+Findings/i.test(line)) { inFindings = true; continue; }
    if (inFindings && /^##\s+/.test(line)) break;
    if (!inFindings) continue;
    const m = line.match(/^-\s*\[([^\]]+)\]\s*(.+)$/);
    if (m) assertions.push({ text: m[2].trim() });
  }
  return assertions;
}

function classify(text) {
  const t = text.toLowerCase();
  if (t.includes("sandbox") || t.includes("container") || t.includes("runtime") || t.includes("execute") || t.includes("run ")) return "full-runtime";
  if (t.includes("import") || t.includes("require") || t.includes("install")) return "import-succeeds";
  if (t.includes("method") || t.includes("callable") || t.includes("api") || t.includes("endpoint")) return "method-callable";
  if (t.includes("output") || t.includes("returns") || t.includes("result") || t.includes("dataframe") || t.includes("shape")) return "sample-output";
  if (t.includes("symbol") || t.includes("exists") || t.includes("function")) return "symbol-exists";
  return "unclassified";
}

function allowedAtDepth(cls, depth) {
  if (depth === "shallow") return cls === "symbol-exists" || cls === "import-succeeds" || cls === "unclassified";
  if (depth === "medium") return cls !== "full-runtime";
  return true;
}

export const workflowVerifyEvidenceTool = {
  name: "workflow_verify_evidence",
  description:
    "Reads an evidence MD file, extracts code snippets and assertions, and classifies each assertion by execution class. " +
    "Use BEFORE deciding which runtime checks are needed. " +
    "Execution classes: symbol-exists, import-succeeds, method-callable, sample-output, full-runtime. " +
    "Returns assertion_matrix, counts, skipped_snippets, required_approvals, and operator_confirmation_required. " +
    "Failure mode: missing file returns error. " +
    "IMPORTANT: Agent must NOT update validation_status to passed without explicit operator confirmation.",
  schema: {
    evidence_path: z.string().describe("Repo-relative path to the evidence MD file"),
    verification_depth: z.enum(["shallow", "medium", "deep"]).optional().default("shallow").describe("How deep to verify"),
  },
  handler: async (args) => {
    const root = resolveRoot(args.root);
    const filePath = resolve(root, args.evidence_path);
    let text;
    try {
      text = await readFile(filePath, "utf-8");
    } catch {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: true, message: "Evidence file not found or unreadable" }) }],
        isError: true,
      };
    }
    const snippets = extractSnippets(text);
    const rawAssertions = extractAssertions(text);
    const matrix = rawAssertions.map((a) => ({ text: a.text, execution_class: classify(a.text) }));
    const filtered = matrix.filter((a) => allowedAtDepth(a.execution_class, args.verification_depth));
    const counts = {};
    for (const a of filtered) {
      counts[a.execution_class] = (counts[a.execution_class] || 0) + 1;
    }
    const skipped = snippets.filter((s) => {
      if (args.verification_depth === "deep") return false;
      if (args.verification_depth === "medium") return s.language === "bash" || s.language === "sh" || s.code.includes("runtime");
      return true;
    });
    const approvals = [];
    if (filtered.some((a) => a.execution_class === "full-runtime")) approvals.push("runtime_approval");
    if (filtered.some((a) => a.execution_class === "method-callable" || a.execution_class === "sample-output")) approvals.push("operator_review");
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          assertion_matrix: filtered,
          counts,
          skipped_snippets: skipped.map((s) => s.language),
          required_approvals: approvals,
          operator_confirmation_required: true,
          agent_may_not_pass_validation: "Agent must NOT update validation_status to passed without explicit operator confirmation",
        }),
      }],
    };
  },
};
