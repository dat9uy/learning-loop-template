/**
 * Observation writer — creates observation YAML files
 * with auto-generated schema fields and path safety guards.
 */

import { writeFileSync, readFileSync, existsSync, renameSync, readdirSync, lstatSync } from "node:fs";
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

const VALID_STATUSES = ["active", "inactive", "archived"];
const IMMUTABLE_FIELDS = ["id", "schema_version", "type", "created_at", "constraint_type", "constraint", "source_refs"];

/**
 * Update an existing observation's status.
 * Scans observation files by id, updates status and updated_at atomically.
 * Returns { updated: true, id, path } or { updated: false, reason }.
 */
export function updateObservation({ root, observation_id, status, reason }) {
  if (!VALID_STATUSES.includes(status)) {
    return { updated: false, reason: "invalid_status" };
  }

  const obsDir = join(root, "records", "observations");
  if (!existsSync(obsDir)) {
    return { updated: false, reason: "not_found" };
  }

  const files = readdirSync(obsDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  let targetPath = null;
  let targetData = null;

  for (const filename of files) {
    const filePath = resolve(obsDir, filename);

    // Skip symlinks — do not follow
    try {
      if (lstatSync(filePath).isSymbolicLink()) continue;
    } catch {
      continue;
    }

    // Path traversal guard
    if (!filePath.startsWith(resolve(obsDir))) {
      continue;
    }

    try {
      const content = parseYaml(readFileSync(filePath, "utf8"));
      if (content && content.id === observation_id) {
        targetPath = filePath;
        targetData = content;
        break;
      }
    } catch {
      // skip unparseable files
    }
  }

  if (!targetPath || !targetData) {
    return { updated: false, reason: "not_found" };
  }

  // Verify exact id match after parse
  if (targetData.id !== observation_id) {
    return { updated: false, reason: "not_found" };
  }

  const now = new Date();
  const updatedAt = now.toISOString();

  // Bounds-check updated_at: reject if the generated timestamp is older than created_at
  const updatedTime = now.getTime();
  const createdTime = new Date(targetData.created_at).getTime();
  if (!isNaN(createdTime) && updatedTime < createdTime) {
    return { updated: false, reason: "timestamp_out_of_bounds" };
  }

  // Mutate only whitelisted fields
  const updated = {
    ...targetData,
    status,
    updated_at: updatedAt,
  };

  if (reason) {
    const existingNotes = targetData.notes || "";
    updated.notes = existingNotes ? `${existingNotes}\n[update reason]: ${reason}` : `[update reason]: ${reason}`;
  }

  // Preserve immutable fields exactly as they were (defense in depth)
  for (const field of IMMUTABLE_FIELDS) {
    if (field in targetData) {
      updated[field] = targetData[field];
    }
  }

  const yamlContent = stringifyYaml(updated);

  // Atomic write with unique temp suffix
  const tmpSuffix = `tmp-${randomBytes(4).toString("hex")}`;
  const tmpPath = targetPath + `.${tmpSuffix}`;
  writeFileSync(tmpPath, yamlContent, "utf8");

  // Re-validate resolved path before rename
  if (!resolve(tmpPath).startsWith(resolve(obsDir))) {
    return { updated: false, reason: "path_traversal_blocked" };
  }

  renameSync(tmpPath, targetPath);

  return { updated: true, id: observation_id, path: targetPath };
}
