import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export function readExistingIndex(path) {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return parseYaml(readFileSync(path, "utf8"));
  } catch (cause) {
    console.warn(`Warning: corrupt existing index file ${path}, treating as missing: ${cause.message}`);
    return null;
  }
}

export function shouldWrite(existing, entry) {
  if (!existing) return true;
  return existing.extraction?.evidence_immutable_hash !== entry.extraction?.evidence_immutable_hash;
}

export function writeIndexEntry(root, entry) {
  const dir = join(root, "records", "index");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const path = join(dir, `${entry.id}.yaml`);
  const tmpPath = join(dir, `.${entry.id}.yaml.tmp`);
  writeFileSync(tmpPath, stringifyYaml(entry));
  renameSync(tmpPath, path);
  return path;
}
