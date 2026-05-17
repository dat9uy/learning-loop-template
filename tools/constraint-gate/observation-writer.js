/**
 * Observation writer — creates observation YAML files
 * with auto-generated schema fields and path safety guards.
 */

import { writeFileSync, readFileSync, existsSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
import { stringify as stringifyYaml, parse as parseYaml } from "yaml";
import { randomBytes } from "node:crypto";

/**
 * Sanitize text into a kebab-case slug.
 * Strips path traversal (../), slashes, and non-alphanumeric chars.
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
 * Generate observation filename from constraint text.
 */
export function generateFilename(constraint) {
  const slug = sanitizeSlug(constraint);
  return `observation-${slug}.yaml`;
}

/**
 * Generate a unique observation ID.
 */
export function generateObservationId() {
  const ts = Date.now().toString(36);
  const rand = randomBytes(4).toString("hex");
  return `obs-${ts}-${rand}`;
}

/**
 * Build observation YAML object with auto-generated + input fields.
 */
export function buildObservationYaml({ constraint_type, constraint, description, source_refs }) {
  const now = new Date().toISOString();
  return {
    id: generateObservationId(),
    schema_version: "1.0",
    type: "observation",
    status: "active",
    created_at: now,
    updated_at: now,
    source_refs: source_refs || [],
    notes: description || "",
    constraint_type,
    constraint,
  };
}

/**
 * Write observation to YAML file with path safety guards.
 * Returns { recorded: true, id, path } or { recorded: false, reason }.
 */
export function writeObservation({ root, constraint_type, constraint, description, source_refs }) {
  if (!constraint_type) {
    return { recorded: false, reason: "missing constraint_type" };
  }
  if (!constraint) {
    return { recorded: false, reason: "missing constraint" };
  }

  const filename = generateFilename(constraint);
  const obsDir = join(root, "records", "observations");
  const fullPath = resolve(obsDir, filename);

  // Path traversal guard: resolved path must be inside observations dir
  if (!fullPath.startsWith(resolve(obsDir))) {
    return { recorded: false, reason: "path traversal blocked" };
  }

  // Duplicate detection
  if (existsSync(fullPath)) {
    try {
      const existing = parseYaml(readFileSync(fullPath, "utf8"));
      return { recorded: false, reason: "already_exists", existing_id: existing?.id };
    } catch {
      return { recorded: false, reason: "already_exists" };
    }
  }

  const observation = buildObservationYaml({ constraint_type, constraint, description, source_refs });
  const yamlContent = stringifyYaml(observation);

  // Atomic write: temp file + rename
  const tmpPath = fullPath + ".tmp";
  writeFileSync(tmpPath, yamlContent, "utf8");
  renameSync(tmpPath, fullPath);

  return { recorded: true, id: observation.id, path: fullPath };
}
