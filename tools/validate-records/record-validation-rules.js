import { existsSync, realpathSync } from "node:fs";
import { join, normalize } from "node:path";
import { validateClaimProofLifecycle } from "./claim-proof-lifecycle-rules.js";

function validatePrimitive(errors, path, value, schema) {
  if (schema.const !== undefined && value !== schema.const) errors.push(`${path} must be ${schema.const}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} must be one of ${schema.enum.join(", ")}`);
  if (schema.type === "string" && typeof value !== "string") errors.push(`${path} must be string`);
  if (schema.type === "boolean" && typeof value !== "boolean") errors.push(`${path} must be boolean`);
  if (schema.type === "array" && !Array.isArray(value)) errors.push(`${path} must be array`);
  if (schema.type === "array" && Array.isArray(value) && schema.items?.type) {
    value.forEach((item, index) => validatePrimitive(errors, `${path}[${index}]`, item, schema.items));
  }
  if (schema.type === "object" && (typeof value !== "object" || value === null || Array.isArray(value))) errors.push(`${path} must be object`);
}

export function validateSchema(record, schema, path = record.id || "record") {
  const errors = [];
  for (const key of schema.required || []) {
    if (record[key] === undefined) errors.push(`${path}.${key} is required`);
  }
  for (const [key, childSchema] of Object.entries(schema.properties || {})) {
    if (record[key] === undefined) continue;
    validatePrimitive(errors, `${path}.${key}`, record[key], childSchema);
    if (childSchema.type === "object" && childSchema.properties) {
      errors.push(...validateSchema(record[key], childSchema, `${path}.${key}`));
    }
  }
  return errors;
}

export function validateRecords(records, schemas, packStatuses, root, allowDisallowedFixtures = false) {
  const errors = [];
  const ids = new Map();
  for (const record of records) {
    if (!schemas[record.type]) errors.push(`${record.__file}: unknown type ${record.type}`);
    else errors.push(...validateSchema(record, schemas[record.type]).map((error) => `${record.__file}: ${error}`));
    if (ids.has(record.id)) errors.push(`${record.__file}: duplicate id ${record.id}`);
    ids.set(record.id, record.__file);
  }
  for (const record of records) {
    validateSourceRefs(record, errors, root, ids, allowDisallowedFixtures);
    validateExperimentPacks(record, errors, packStatuses);
  }
  validateRecordReferences(records, ids, errors);
  errors.push(...validateClaimProofLifecycle(records));
  return errors;
}

const allowedRecordLocalRoots = ["records/evidence", "knowledge-packs"];

function validateSourceRefs(record, errors, root, ids, allowDisallowedFixtures) {
  for (const sourceRef of record.source_refs || []) {
    if (typeof sourceRef !== "string") continue;
    if (sourceRef.startsWith("legacy:")) {
      if (!allowDisallowedFixtures) errors.push(`${record.__file}: disallowed legacy source ${sourceRef.slice("legacy:".length)}`);
      continue;
    }
    if (sourceRef.startsWith("local:")) {
      validateLocalRef(record.__file, sourceRef, root, errors);
      continue;
    }
    if (sourceRef.startsWith("record:")) {
      if (!ids.has(sourceRef.slice("record:".length))) errors.push(`${record.__file}: missing record reference ${sourceRef}`);
      continue;
    }
    if (sourceRef.startsWith("pack:")) {
      if (sourceRef.length <= "pack:".length) errors.push(`${record.__file}: malformed pack reference ${sourceRef}`);
      continue;
    }
    errors.push(`${record.__file}: unsupported source reference ${sourceRef}`);
  }
}

function isInside(realPath, allowedPath) {
  return realPath === allowedPath || realPath.startsWith(`${allowedPath}/`);
}

function realPathFor(root, relativeRef) {
  const fullPath = normalize(join(root, relativeRef));
  return existsSync(fullPath) ? normalize(realpathSync(fullPath)) : fullPath;
}

export function validateLocalPath(label, relativeRef, root, errors) {
  const rootPath = normalize(realpathSync(root));
  const fullPath = normalize(join(root, relativeRef));
  if (!existsSync(fullPath)) {
    errors.push(`${label}: missing local source ${relativeRef}`);
    return null;
  }
  const realPath = normalize(realpathSync(fullPath));
  if (!isInside(realPath, rootPath)) {
    errors.push(`${label}: local source escapes repository ${relativeRef}`);
    return null;
  }
  return realPath;
}

export function validateAllowedLocalPath(label, relativeRef, root, allowedRoots, allowedDescription, errors) {
  const realPath = validateLocalPath(label, relativeRef, root, errors);
  if (!realPath) return;
  const allowedPaths = allowedRoots.map((allowedRoot) => realPathFor(root, allowedRoot));
  if (!allowedPaths.some((allowedPath) => isInside(realPath, allowedPath))) {
    errors.push(`${label}: local source must stay under ${allowedDescription} ${relativeRef}`);
  }
}

export function validateLocalRef(label, ref, root, errors) {
  validateAllowedLocalPath(
    label,
    ref.slice("local:".length),
    root,
    allowedRecordLocalRoots,
    "records/evidence or knowledge-packs",
    errors,
  );
}

function validateExperimentPacks(record, errors, packStatuses) {
  if (record.type !== "experiment") return;
  for (const packId of record.knowledge_pack_ids || []) {
    const status = packStatuses.get(packId);
    if (!status) errors.push(`${record.__file}: unknown knowledge pack ${packId}`);
    if (status && !["reviewed", "approved"].includes(status)) {
      errors.push(`${record.__file}: experiment consumes unreviewed pack ${packId}`);
    }
  }
}

function validateRecordReferences(records, ids, errors) {
  for (const record of records) {
    for (const ref of [...(record.evidence_refs || []), ...(record.supersedes || [])]) {
      if (typeof ref !== "string") continue;
      if (ref.startsWith("record:") && !ids.has(ref.slice("record:".length))) {
        errors.push(`${record.__file}: missing record reference ${ref}`);
      }
    }
  }
}
