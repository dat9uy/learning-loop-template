/**
 * Record writer — shared base module for creating/updating
 * learning-loop record YAML files (decisions, experiments, risks).
 *
 * Provides: ID generation, slug sanitization, atomic write,
 * surface dir resolution, duplicate detection, schema validation.
 */

import { writeFileSync, readFileSync, existsSync, renameSync, readdirSync, mkdirSync, lstatSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { stringify as stringifyYaml, parse as parseYaml } from "yaml";
import { randomBytes } from "node:crypto";

/**
 * Sanitize text into a kebab-case slug.
 * Strips path traversal, slashes, and non-alphanumeric chars.
 */
export function sanitizeSlug(text) {
  if (!text || typeof text !== "string") return null;
  const cleaned = text
    .replace(/\.\.\//g, "")
    .replace(/^\//, "")
    .replace(/[/\\.:]/g, " ")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || null;
}

/**
 * Generate an ISO-ish timestamp for IDs: YYMMDDTHHmmZ
 */
export function generateTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yy}${mm}${dd}T${hh}${mi}Z`;
}

/**
 * Generate a full ISO-8601 timestamp for created_at/updated_at.
 */
export function generateISOTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Generate a unique record ID.
 * Format: {type}-{surface}-{timestamp}-{slug}
 * Falls back to {type}-{timestamp}-{rand} if no surface/slug.
 */
export function generateRecordId({ type, surface, slug }) {
  const ts = generateTimestamp();
  const parts = [type];
  if (surface) parts.push(surface);
  parts.push(ts);
  if (slug) parts.push(slug);
  return parts.join("-");
}

/**
 * Generate filename for a record.
 * Format: {type}-{surface}-{timestamp}-{slug}.yaml
 */
export function generateFilename({ type, surface, slug }) {
  const ts = generateTimestamp();
  const parts = [type];
  if (surface) parts.push(surface);
  parts.push(ts);
  if (slug) parts.push(slug);
  return `${parts.join("-")}.yaml`;
}

/**
 * Resolve the target directory for a record.
 * Surface-first: records/<surface>/<type>/
 * Fallback: records/<type>/
 */
export function resolveRecordDir(root, { type, surface }) {
  if (surface) {
    return join(root, "records", surface, `${type}s`);
  }
  return join(root, "records", `${type}s`);
}

/**
 * Atomic write: temp file + rename.
 * Includes path traversal guard.
 */
export function atomicWriteYaml(dirPath, filename, yamlObj) {
  const fullPath = resolve(dirPath, filename);

  // Path traversal guard
  if (!fullPath.startsWith(resolve(dirPath))) {
    return { written: false, reason: "path_traversal_blocked" };
  }

  // Ensure directory exists
  mkdirSync(dirPath, { recursive: true });

  // Duplicate detection
  if (existsSync(fullPath)) {
    try {
      const existing = parseYaml(readFileSync(fullPath, "utf8"));
      return { written: false, reason: "already_exists", existing_id: existing?.id };
    } catch {
      return { written: false, reason: "already_exists" };
    }
  }

  const yamlContent = stringifyYaml(yamlObj);

  // Atomic write: temp + rename
  const tmpSuffix = `tmp-${randomBytes(4).toString("hex")}`;
  const tmpPath = `${fullPath}.${tmpSuffix}`;
  writeFileSync(tmpPath, yamlContent, "utf8");
  renameSync(tmpPath, fullPath);

  return { written: true, path: fullPath };
}

// Fields that cannot be changed via update
const COMMON_IMMUTABLE = ["id", "schema_version", "type", "created_at", "source_refs"];

/**
 * Find a record file by its ID within a directory.
 * Returns { path, data } or null.
 */
export function findRecordById(dirPath, recordId) {
  if (!existsSync(dirPath)) return null;

  const files = readdirSync(dirPath).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

  for (const filename of files) {
    const filePath = resolve(dirPath, filename);

    // Skip symlinks
    try {
      if (lstatSync(filePath).isSymbolicLink()) continue;
    } catch {
      continue;
    }

    // Path traversal guard
    if (!filePath.startsWith(resolve(dirPath))) continue;

    try {
      const content = parseYaml(readFileSync(filePath, "utf8"));
      if (content && content.id === recordId) {
        return { path: filePath, data: content };
      }
    } catch {
      // skip unparseable
    }
  }

  return null;
}

/**
 * Update a record file by ID. Only whitelisted mutable fields are changed.
 * Immutable fields are preserved as defense in depth.
 */
export function updateRecordFile(dirPath, recordId, updates, immutableFields = COMMON_IMMUTABLE) {
  const found = findRecordById(dirPath, recordId);
  if (!found) return { updated: false, reason: "not_found" };

  const { path: filePath, data: existing } = found;

  const now = generateISOTimestamp();
  const updated = {
    ...existing,
    ...updates,
    updated_at: now,
  };

  // Preserve immutable fields exactly
  for (const field of immutableFields) {
    if (field in existing) {
      updated[field] = existing[field];
    }
  }

  const yamlContent = stringifyYaml(updated);

  // Atomic write
  const tmpSuffix = `tmp-${randomBytes(4).toString("hex")}`;
  const tmpPath = `${filePath}.${tmpSuffix}`;
  writeFileSync(tmpPath, yamlContent, "utf8");

  // Re-validate resolved path before rename
  if (!resolve(tmpPath).startsWith(resolve(dirPath))) {
    return { updated: false, reason: "path_traversal_blocked" };
  }

  renameSync(tmpPath, filePath);
  return { updated: true, id: recordId, path: filePath };
}

/**
 * Validate a record object against its JSON schema.
 * Lightweight check: validates required fields exist and types match.
 * Returns { valid: true } or { valid: false, errors: [...] }.
 */
export function validateRecordShape(record, schema) {
  const errors = [];

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in record) || record[field] === undefined || record[field] === null) {
        errors.push(`missing required field: ${field}`);
      }
    }
  }

  // Check type const
  if (schema.properties?.type?.const && record.type !== schema.properties.type.const) {
    errors.push(`type must be "${schema.properties.type.const}", got "${record.type}"`);
  }

  // Check status enum
  if (schema.properties?.status?.enum && !schema.properties.status.enum.includes(record.status)) {
    errors.push(`status must be one of ${JSON.stringify(schema.properties.status.enum)}, got "${record.status}"`);
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}
