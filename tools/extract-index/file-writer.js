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
  if (existing.extraction?.evidence_immutable_hash !== entry.extraction?.evidence_immutable_hash) return true;
  if (existing.status !== entry.status) return true;
  if ((existing.superseded_by ?? null) !== (entry.superseded_by ?? null)) return true;
  const a = (existing.supersedes ?? []).join("|");
  const b = (entry.supersedes ?? []).join("|");
  return a !== b;
}

const CAPABILITY_SURFACE_MAP = {
  "vnstock-data": "vnstock",
  fundamental: "product",
  fastapi: "fastapi",
  tanstack: "tanstack",
  product: "product",
  meta: "meta",
  loop: "meta",
};

function deriveSurface(entry) {
  const cap = entry.capability || "";
  for (const [prefix, surface] of Object.entries(CAPABILITY_SURFACE_MAP)) {
    if (cap === prefix || cap.startsWith(`${prefix}-`)) return surface;
  }
  return "product";
}

export function writeIndexEntry(root, entry) {
  const surface = deriveSurface(entry);
  const dir = join(root, "records", surface, "index");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const path = join(dir, `${entry.id}.yaml`);
  const tmpPath = join(dir, `.${entry.id}.yaml.tmp`);
  writeFileSync(tmpPath, stringifyYaml(entry));
  renameSync(tmpPath, path);
  return path;
}
