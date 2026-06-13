import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { parseRecordYaml } from "./yaml-parse-wrapper.js";

const recordDirs = ["claims", "experiments", "decisions", "risks", "capabilities", "index"];

const SURFACES = ["meta", "vnstock", "fastapi", "tanstack", "product"];
const EXCLUDED_DIRS = ["observations", "backlog-items", "validation-gates"];

function sortedYamlFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith(".yaml")).sort().map((name) => join(dir, name));
}

function isSurfaceFirst(baseDir) {
  if (!existsSync(baseDir)) return false;
  const entries = readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (EXCLUDED_DIRS.includes(entry.name)) continue;
    if (recordDirs.includes(entry.name)) {
      const hasYaml = readdirSync(join(baseDir, entry.name)).some((n) => n.endsWith(".yaml"));
      if (hasYaml) return false;
    }
    const subdirs = readdirSync(join(baseDir, entry.name), { withFileTypes: true });
    if (subdirs.some((e) => e.isDirectory() && recordDirs.includes(e.name))) {
      return true;
    }
  }
  return false;
}

function walkSurfaceFirst(root, baseDir, dirName) {
  const files = [];
  for (const surface of SURFACES) {
    const surfaceDir = join(baseDir, surface, dirName);
    if (existsSync(surfaceDir)) {
      for (const filePath of sortedYamlFiles(surfaceDir)) {
        files.push(filePath);
      }
    }
  }
  return files;
}

export function loadRecords(root, baseDir = join(root, "records")) {
  const records = [];
  const surfaceFirst = isSurfaceFirst(baseDir);
  for (const dirName of recordDirs) {
    const filePaths = surfaceFirst
      ? walkSurfaceFirst(root, baseDir, dirName)
      : sortedYamlFiles(join(baseDir, dirName));
    for (const filePath of filePaths) {
      const record = parseRecordYaml(readFileSync(filePath, "utf8"), filePath);
      record.__file = relative(root, filePath);
      records.push(record);
    }
  }
  return records;
}
