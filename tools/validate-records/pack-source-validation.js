import { readFileSync, readdirSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { parse as parseYaml } from "yaml";

const allowedPackFiles = new Set(["manifest.yaml", "facts.yaml", "capabilities.yaml"]);

function yamlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return yamlFiles(path);
    return entry.name.endsWith(".yaml") ? [path] : [];
  });
}

function collectRefs(value, predicate, refs = []) {
  if (typeof value === "string" && predicate(value)) refs.push(value);
  if (Array.isArray(value)) value.forEach((item) => collectRefs(item, predicate, refs));
  if (value && typeof value === "object" && !Array.isArray(value)) {
    Object.values(value).forEach((item) => collectRefs(item, predicate, refs));
  }
  return refs;
}

function validateRuntimeDefaults(parsed, label, errors) {
  for (const item of parsed.validation || []) {
    if (item.requires_human_approval === true && item.default_required === true) {
      errors.push(`${label}: human-approved validation cannot be default required`);
    }
  }
}

function validateSourceRef(label, ref, recordIds, errors) {
  if (typeof ref !== "string") return;
  if (ref.startsWith("record:")) {
    if (!recordIds.has(ref.slice("record:".length))) errors.push(`${label}: missing record reference ${ref}`);
    return;
  }
  errors.push(`${label}: knowledge pack source_refs must use record references ${ref}`);
}

function validateSourceRefFields(value, label, recordIds, errors) {
  if (Array.isArray(value)) {
    value.forEach((item) => validateSourceRefFields(item, label, recordIds, errors));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (key === "source_allowlist") {
      errors.push(`${label}: source_allowlist is not allowed in knowledge packs`);
    } else if (key === "source_refs") {
      if (Array.isArray(item)) {
        item.forEach((ref, index) => {
          if (typeof ref !== "string") errors.push(`${label}: source_refs[${index}] must be string`);
          else validateSourceRef(label, ref, recordIds, errors);
        });
      } else {
        errors.push(`${label}: source_refs must be array`);
      }
    } else {
      validateSourceRefFields(item, label, recordIds, errors);
    }
  }
}

function validatePackFileBoundary(filePath, label, errors) {
  const name = basename(filePath);
  if (!allowedPackFiles.has(name)) {
    errors.push(`${label}: disallowed file in knowledge pack; allowed: ${[...allowedPackFiles].join(", ")}`);
  }
}

export function validatePackSources(root, recordIds) {
  const errors = [];
  for (const filePath of yamlFiles(join(root, "knowledge-packs"))) {
    const parsed = parseYaml(readFileSync(filePath, "utf8"));
    const label = relative(root, filePath);
    validatePackFileBoundary(filePath, label, errors);
    validateSourceRefFields(parsed, label, recordIds, errors);
    for (const ref of collectRefs(parsed, (value) => value.startsWith("record:"))) {
      if (!recordIds.has(ref.slice("record:".length))) errors.push(`${label}: missing record reference ${ref}`);
    }
    validateRuntimeDefaults(parsed, label, errors);
  }
  return errors;
}
