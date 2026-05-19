import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { parseRecordYaml } from "./yaml-parse-wrapper.js";

export const recordDirs = ["claims", "experiments", "decisions", "risks", "capabilities", "index"];

function sortedYamlFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".yaml")).sort().map((name) => join(dir, name));
}

export function loadRecords(root, baseDir = join(root, "records")) {
  const records = [];
  for (const dirName of recordDirs) {
    for (const filePath of sortedYamlFiles(join(baseDir, dirName))) {
      const record = parseRecordYaml(readFileSync(filePath, "utf8"), filePath);
      record.__file = relative(root, filePath);
      records.push(record);
    }
  }
  return records;
}
