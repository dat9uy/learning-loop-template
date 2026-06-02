import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readRegistry } from "./meta-state.js";
import { loadPromotedRules } from "./gate-logic.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = dirname(__dirname);

/**
 * Safely import a module with a timeout.
 */
async function importWithTimeout(path, timeoutMs = 1000) {
  return Promise.race([
    import(path),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Import timeout")), timeoutMs)
    ),
  ]);
}

/**
 * List all tools from manifest.json, importing each module to read its description.
 * Returns array of { name, description? }.
 * Failed imports use manifest file path as fallback.
 */
export async function listAllTools(root) {
  const manifestPath = join(MCP_ROOT, "tools", "manifest.json");
  if (!existsSync(manifestPath)) return [];

  let manifest = [];
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return [];
  }

  const tools = [];
  let failures = 0;

  for (const mod of manifest) {
    const filePath = join(MCP_ROOT, mod.file.replace(/^\.\//, ""));
    try {
      const imported = await importWithTimeout(filePath, 1000);
      const toolConfig = imported[mod.export];
      if (toolConfig) {
        tools.push({
          name: toolConfig.name,
          description: toolConfig.description,
        });
      } else {
        tools.push({ name: mod.export, file: mod.file });
        failures++;
      }
    } catch {
      tools.push({ name: mod.export, file: mod.file });
      failures++;
    }
  }

  return { tools, degraded: failures >= 3, failures };
}

/**
 * List all record types from schemas/*.schema.json.
 */
export function listAllRecordTypes(root) {
  const schemasDir = join(root, "schemas");
  if (!existsSync(schemasDir)) return [];

  try {
    return readdirSync(schemasDir)
      .filter((f) => f.endsWith(".schema.json"))
      .map((f) => f.replace(".schema.json", ""));
  } catch {
    return [];
  }
}

/**
 * List all meta-state categories from the zod enum.
 */
export function listAllMetaCategories() {
  return [
    "gate-logic-bug",
    "record-repair-gap",
    "schema-drift",
    "stale-ref",
    "mcp-tool-missing",
    "budget-check",
    "loop-anti-pattern",
  ];
}

/**
 * List all gate constraint patterns from patterns.json.
 */
export function listAllGatePatterns(root) {
  const patternsPath = join(MCP_ROOT, "core", "patterns.json");
  if (!existsSync(patternsPath)) return {};

  try {
    return JSON.parse(readFileSync(patternsPath, "utf8"));
  } catch {
    return {};
  }
}

/**
 * List active findings (reported or active status) from meta-state.
 */
export function listActiveFindings(root, { categories } = {}) {
  const entries = readRegistry(root);
  const activeStatuses = new Set(["reported", "active"]);
  let findings = entries.filter((e) => activeStatuses.has(e.status));
  if (categories && categories.length > 0) {
    findings = findings.filter((e) => categories.includes(e.category));
  }
  return findings;
}

/**
 * List anti-pattern findings (loop-anti-pattern category, non-terminal status).
 */
export function listAntiPatterns(root, { categories } = {}) {
  const entries = readRegistry(root);
  const TERMINAL_STATUSES = new Set(["auto-resolved", "expired", "resolved"]);
  let findings = entries.filter(
    (e) => e.category === "loop-anti-pattern" && !TERMINAL_STATUSES.has(e.status)
  );
  if (categories && categories.length > 0) {
    findings = findings.filter((e) => categories.includes(e.category));
  }
  return findings;
}

/**
 * List all findings regardless of status (for cold tier audit).
 */
export function listAllFindings(root, { categories } = {}) {
  const entries = readRegistry(root);
  let findings = entries;
  if (categories && categories.length > 0) {
    findings = findings.filter((e) => categories.includes(e.category));
  }
  return findings;
}

/**
 * List promoted rules (active gate-enforced rules).
 */
export function listPromotedRules(root) {
  return loadPromotedRules(root);
}
