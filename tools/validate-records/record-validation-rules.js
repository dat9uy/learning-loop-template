import { existsSync, realpathSync } from "node:fs";
import { join, normalize } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { validateClaimVerification } from "./claim-verification-rules.js";

const compiledValidatorsBySchemas = new WeakMap();

function getCompiledValidators(schemas) {
  const cached = compiledValidatorsBySchemas.get(schemas);
  if (cached) return cached;
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const compiledValidators = {};
  for (const [type, schema] of Object.entries(schemas)) {
    compiledValidators[type] = ajv.compile(schema);
  }
  compiledValidatorsBySchemas.set(schemas, compiledValidators);
  return compiledValidators;
}

function stripInternalFields(record) {
  const { __file, ...rest } = record;
  return rest;
}

function formatAjvError(error) {
  const location = error.instancePath || "/";
  return `${location} ${error.keyword}: ${error.message}`;
}

function validateRecordAgainstSchema(record, validator) {
  if (validator(stripInternalFields(record))) return [];
  return (validator.errors || []).map(formatAjvError);
}

function validateRecordSchemas(records, schemas, errors) {
  const validators = getCompiledValidators(schemas);
  for (const record of records) {
    if (!schemas[record.type]) {
      errors.push(`${record.__file}: unknown type ${record.type}`);
      continue;
    }
    errors.push(...validateRecordAgainstSchema(record, validators[record.type]).map((error) => `${record.__file}: ${error}`));
  }
}

export function validateRecords(records, schemas, root, allowDisallowedFixtures = false) {
  const errors = [];
  const ids = new Map();
  validateRecordSchemas(records, schemas, errors);
  for (const record of records) {
    if (ids.has(record.id)) errors.push(`${record.__file}: duplicate id ${record.id}`);
    ids.set(record.id, record.__file);
  }
  for (const record of records) {
    validateSourceRefs(record, errors, root, ids, allowDisallowedFixtures);
  }
  validateRecordReferences(records, ids, errors);
  errors.push(...validateClaimVerification(records));
  return errors;
}

const recordLocalRoots = {
  default: ["records/evidence"],
  capability: ["records/evidence", "product/*/capabilities"],
};

function validateSourceRefs(record, errors, root, ids, allowDisallowedFixtures) {
  if (record.type === "extracted-assertion") {
    for (const sourceRef of record.source_refs || []) {
      if (typeof sourceRef !== "object" || !sourceRef.file) continue;
      const fileRef = sourceRef.file;
      if (typeof fileRef !== "string") continue;
      if (fileRef.startsWith("legacy:")) {
        if (!allowDisallowedFixtures) errors.push(`${record.__file}: disallowed legacy source ${fileRef.slice("legacy:".length)}`);
        continue;
      }
      if (fileRef.startsWith("local:")) {
        validateLocalRef(record, fileRef, root, errors);
        continue;
      }
      if (fileRef.startsWith("record:")) {
        if (!ids.has(fileRef.slice("record:".length))) errors.push(`${record.__file}: missing record reference ${fileRef}`);
        continue;
      }
    }
    return;
  }
  for (const sourceRef of record.source_refs || []) {
    if (typeof sourceRef !== "string") continue;
    if (sourceRef.startsWith("legacy:")) {
      if (!allowDisallowedFixtures) errors.push(`${record.__file}: disallowed legacy source ${sourceRef.slice("legacy:".length)}`);
      continue;
    }
    if (sourceRef.startsWith("local:")) {
      validateLocalRef(record, sourceRef, root, errors);
      continue;
    }
    if (sourceRef.startsWith("record:")) {
      if (!ids.has(sourceRef.slice("record:".length))) errors.push(`${record.__file}: missing record reference ${sourceRef}`);
      continue;
    }
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
  const rootPath = normalize(realpathSync(root));
  const realRelativeSegs = realPath.slice(rootPath.length + 1).split("/");
  const allowed = expandAllowedRoots(allowedRoots, root);
  if (!allowed.some((allowedRoot) => matchAllowedRoot(realPath, realRelativeSegs, allowedRoot))) {
    errors.push(`${label}: local source must stay under ${allowedDescription} ${relativeRef}`);
  }
}

function expandAllowedRoots(patterns, root) {
  return patterns.map((pattern) => {
    if (!pattern.includes("*")) return { kind: "exact", path: realPathFor(root, pattern) };
    return { kind: "glob", segments: pattern.split("/") };
  });
}

function matchAllowedRoot(realPath, realRelativeSegs, allowedRoot) {
  if (allowedRoot.kind === "exact") return isInside(realPath, allowedRoot.path);
  if (realRelativeSegs.length < allowedRoot.segments.length) return false;
  return allowedRoot.segments.every((patternSegment, index) => {
    const realSegment = realRelativeSegs[index];
    if (patternSegment !== "*") return patternSegment === realSegment;
    return Boolean(realSegment) && realSegment !== "." && realSegment !== "..";
  });
}

export function validateLocalRef(record, ref, root, errors) {
  const roots = recordLocalRoots[record.type] || recordLocalRoots.default;
  validateAllowedLocalPath(
    record.__file,
    ref.slice("local:".length),
    root,
    roots,
    roots.join(", "),
    errors,
  );
}

function validateRecordReferences(records, ids, errors) {
  for (const record of records) {
    const refFields = [
      ...(record.evidence_refs || []),
      ...(record.supersedes || []),
      ...(record.superseded_by ? [record.superseded_by] : []),
      ...(record.experiment_refs || []),
    ];
    for (const ref of refFields) {
      if (typeof ref !== "string") continue;
      if (ref.startsWith("record:") && !ids.has(ref.slice("record:".length))) {
        errors.push(`${record.__file}: missing record reference ${ref}`);
      }
    }
  }
}
