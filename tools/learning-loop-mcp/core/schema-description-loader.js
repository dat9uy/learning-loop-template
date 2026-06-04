import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

let cache = null;

export function loadDescriptions() {
  if (cache) return cache;
  const path = join(process.cwd(), "schemas", "tool-descriptions.yaml");
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
