import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { parseYaml } from "./simple-yaml-parser.js";

export const recordDirs = ["claims", "experiments", "decisions", "risks"];

function sortedYamlFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".yaml")).sort().map((name) => join(dir, name));
}

export function loadRecords(root, baseDir = join(root, "records")) {
  const records = [];
  for (const dirName of recordDirs) {
    for (const filePath of sortedYamlFiles(join(baseDir, dirName))) {
      const record = parseYaml(readFileSync(filePath, "utf8"));
      record.__file = relative(root, filePath);
      records.push(record);
    }
  }
  return records;
}

export function loadPackStatuses(root) {
  const packsRoot = join(root, "knowledge-packs");
  const statuses = new Map();
  for (const name of readdirSync(packsRoot).sort()) {
    const manifest = join(packsRoot, name, "manifest.yaml");
    if (!existsSync(manifest)) continue;
    const parsed = parseYaml(readFileSync(manifest, "utf8"));
    statuses.set(parsed.id, parsed.approval?.status || parsed.status || "draft");
  }
  return statuses;
}
