import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));

let cache = null;

function resolveDescriptionsPath() {
  // Primary path: alongside the loader (under tools/learning-loop-mcp/core/).
  // The plan's original location was schemas/tool-descriptions.yaml, but the
  // write gate unconditionally blocks schemas/** so the sidecar lives here.
  const alongsidePath = join(__dirname, "schema-descriptions.yaml");
  if (existsSync(alongsidePath)) return alongsidePath;
  // Fallback: original plan location, if the operator has lifted the gate.
  const planPath = join(process.cwd(), "schemas", "tool-descriptions.yaml");
  return planPath;
}

export function loadDescriptions() {
  if (cache) return cache;
  const path = resolveDescriptionsPath();
  try {
    cache = parseYaml(readFileSync(path, "utf8")) || {};
  } catch {
    cache = {};
  }
  return cache;
}

export function clearDescriptionsCache() {
  cache = null;
}
