import { z } from "zod";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import YAML from "yaml";
import { resolveRoot } from "../../../lib/resolve-root.js";

function extractFindings(text) {
  const lines = text.split("\n");
  let inSection = false;
  const findings = [];
  for (const line of lines) {
    if (/^##\s+Findings/i.test(line)) { inSection = true; continue; }
    if (inSection && /^##\s+/.test(line)) break;
    if (!inSection) continue;
    const m = line.match(/^-\s*\[([^\]]+)\]\s*(.+)$/);
    if (m) findings.push({ tag: m[1].trim(), text: m[2].trim() });
  }
  return findings;
}

function buildExperimentYaml(findings, mode, path) {
  const doc = {
    experiment: {
      source_refs: [`local:${path}`],
      mode,
      status: mode === "migration" ? "reviewed" : "draft",
      result: "inconclusive",
      result_reason: "converted from evidence md",
      notes: mode === "structuring" ? "post-hoc structuring" : undefined,
      findings: findings.map((f) => ({ tag: f.tag, assertion: f.text })),
    },
  };
  return YAML.stringify(doc);
}

export const workflowConvertEvidenceTool = {
  name: "workflow_convert_evidence",
  description:
    "Reads an evidence MD file, extracts the ## Findings section with [topic-tag] bullets, and maps them to an experiment YAML structure. " +
    "Use WHEN migrating evidence markdown to structured experiment records. " +
    "Supports dry_run (preview), migration (full rewrite), and structuring (new structure on existing). " +
    "Returns experiment_yaml string, validation_errors, source_refs_linked, and status. " +
    "Failure mode: missing or unreadable file returns error.",
  schema: {
    evidence_path: z.string().describe("Repo-relative path to the evidence MD file"),
    mode: z.enum(["dry_run", "migration", "structuring"]).describe("Conversion mode"),
    context: z.object({}).passthrough().optional().describe("Optional context for substitution"),
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
    const findings = extractFindings(text);
    const yaml = buildExperimentYaml(findings, args.mode, args.evidence_path);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          experiment_yaml: yaml,
          validation_errors: findings.length === 0 ? ["No findings extracted"] : [],
          source_refs_linked: [`local:${args.evidence_path}`],
          status: args.mode === "dry_run" ? "preview" : "converted",
        }),
      }],
    };
  },
};
