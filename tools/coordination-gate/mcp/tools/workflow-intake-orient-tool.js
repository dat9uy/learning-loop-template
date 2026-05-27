import { z } from "zod";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import YAML from "yaml";
import { resolveRoot } from "../../../lib/resolve-root.js";

const SURFACES = ["meta", "vnstock", "fastapi", "tanstack", "product"];

async function loadYamlDir(root, dir) {
  const path = resolve(root, dir);
  const files = await readdir(path).catch(() => []);
  const results = [];
  for (const f of files) {
    if (!f.endsWith(".yaml") && !f.endsWith(".yml")) continue;
    const text = await readFile(resolve(path, f), "utf-8").catch(() => "");
    if (!text) continue;
    try {
      const doc = YAML.parse(text);
      results.push({ filename: f, ...doc });
    } catch { /* ignore parse errors */ }
  }
  return results;
}

async function loadYamlDirs(root, dirs) {
  const all = [];
  for (const dir of dirs) {
    const entries = await loadYamlDir(root, dir);
    all.push(...entries);
  }
  return all;
}

async function listMetaTriggers(root) {
  const dirs = [resolve(root, "records/evidence/meta")];
  for (const surface of SURFACES) {
    dirs.push(resolve(root, `records/${surface}/evidence`));
  }
  const all = [];
  for (const path of dirs) {
    const files = await readdir(path).catch(() => []);
    all.push(...files.filter((f) => f !== ".gitkeep" && f !== ".DS_Store"));
  }
  return all;
}

export const workflowIntakeOrientTool = {
  name: "workflow_intake_orient",
  description:
    "Orients the agent by reading records/*/index, records/*/evidence, records/observations, and records/*/capabilities. " +
    "Use AT THE START of an intake session to understand current record state. " +
    "Returns structured overview: index entries, meta triggers, observations, capability files, and missing decisions. " +
    "Failure mode: invalid category filter returns error.",
  schema: {
    root: z.string().optional().describe("Project root directory (default: auto-detected)"),
    category: z.string().optional().describe("Filter index entries by dimension or capability substring"),
    capability_scope: z.string().optional().describe("Filter capability files by stack or id substring"),
  },
  handler: async (args) => {
    const root = resolveRoot(args.root);

    if (args.category !== undefined && args.category.trim() === "") {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: true, message: "category must not be empty" }) }],
        isError: true,
      };
    }

    const indexDirs = ["records/index", ...SURFACES.map((s) => `records/${s}/index`)];
    const capabilityDirs = ["records/capabilities", ...SURFACES.map((s) => `records/${s}/capabilities`)];
    const decisionDirs = ["records/decisions", ...SURFACES.map((s) => `records/${s}/decisions`)];

    const indexEntries = await loadYamlDirs(root, indexDirs);
    const observations = await loadYamlDir(root, "records/observations");
    const capabilities = await loadYamlDirs(root, capabilityDirs);
    const metaTriggers = await listMetaTriggers(root);

    let filteredIndex = indexEntries;
    if (args.category) {
      const cat = args.category.toLowerCase();
      filteredIndex = indexEntries.filter((e) =>
        (e.dimension && String(e.dimension).toLowerCase().includes(cat)) ||
        (e.capability && String(e.capability).toLowerCase().includes(cat))
      );
    }

    let filteredCapabilities = capabilities;
    if (args.capability_scope) {
      const scope = args.capability_scope.toLowerCase();
      filteredCapabilities = capabilities.filter((c) =>
        (c.id && String(c.id).toLowerCase().includes(scope)) ||
        (c.stack && String(c.stack).toLowerCase().includes(scope))
      );
    }

    const decisionFiles = [];
    for (const dir of decisionDirs) {
      const files = await readdir(resolve(root, dir)).catch(() => []);
      decisionFiles.push(...files);
    }
    const missingDecisions = filteredIndex
      .filter((e) => e.dimension === "product")
      .filter((e) => {
        const cap = e.capability || "";
        return !decisionFiles.some((d) => d.toLowerCase().includes(cap.toLowerCase()));
      })
      .map((e) => e.id);

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          index_entries: filteredIndex,
          meta_triggers: metaTriggers,
          observations,
          capability_files: filteredCapabilities.map((c) => c.id || c.filename),
          missing_decisions: missingDecisions,
        }),
      }],
    };
  },
};
