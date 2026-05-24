/**
 * Experiment writer — builds experiment record YAML and writes to disk.
 */

import { sanitizeSlug, generateRecordId, generateFilename, generateISOTimestamp, resolveRecordDir, atomicWriteYaml, findRecordById, updateRecordFile } from "./record-writer.js";

const SCHEMA_VERSION = "1.0";

/**
 * Build an experiment record YAML object from input params.
 */
export function buildExperimentYaml({ surface, goal, hypothesis, method, success_metrics, source_refs, scope, output_level, claim_refs, risk_refs }) {
  const now = generateISOTimestamp();
  const slug = sanitizeSlug(goal);
  const id = generateRecordId({ type: "experiment", surface, slug });

  return {
    id,
    schema_version: SCHEMA_VERSION,
    type: "experiment",
    status: "draft",
    created_at: now,
    updated_at: now,
    source_refs: source_refs || [],
    goal: goal || "",
    hypothesis: hypothesis || "",
    method: method || [],
    success_metrics: success_metrics || [],
    result: "",
    agent_outcome: "",
    product_outcome: "",
    observations: [],
    promotion_review: [],
    ...(scope ? { scope } : {}),
    ...(claim_refs ? { claim_refs } : {}),
    ...(risk_refs ? { risk_refs } : {}),
    ...(output_level ? { output_level } : {}),
    verification: {
      claim_refs: claim_refs || [],
      proves: [],
      requires_human_approval: true,
      approval_status: "not-required",
    },
  };
}

/**
 * Create an experiment record file.
 * Returns { created: true, id, path } or { created: false, reason }.
 */
export function createExperiment({ root, surface, goal, hypothesis, method, success_metrics, source_refs, scope, output_level, claim_refs, risk_refs }) {
  if (!goal) return { created: false, reason: "missing goal" };

  const record = buildExperimentYaml({ surface, goal, hypothesis, method, success_metrics, source_refs, scope, output_level, claim_refs, risk_refs });
  const dirPath = resolveRecordDir(root, { type: "experiment", surface });
  const filename = generateFilename({ type: "experiment", surface, slug: sanitizeSlug(goal) });
  const result = atomicWriteYaml(dirPath, filename, record);

  if (result.written) {
    return { created: true, id: record.id, path: result.path };
  }
  return { created: false, reason: result.reason, ...(result.existing_id ? { existing_id: result.existing_id } : {}) };
}

const EXPERIMENT_IMMUTABLE = ["id", "schema_version", "type", "created_at"];

/**
 * Update an experiment record by ID.
 * source_refs is append-only.
 * verification block can be fully updated.
 */
export function updateExperiment({ root, surface, experiment_id, updates }) {
  const dirPath = resolveRecordDir(root, { type: "experiment", surface });

  // Handle append-only source_refs
  if (updates.source_refs && Array.isArray(updates.source_refs)) {
    const found = findRecordById(dirPath, experiment_id);
    if (found) {
      const existing = found.data.source_refs || [];
      const merged = [...existing];
      for (const ref of updates.source_refs) {
        if (!merged.includes(ref)) {
          merged.push(ref);
        }
      }
      updates.source_refs = merged;
    }
  }

  return updateRecordFile(dirPath, experiment_id, updates, EXPERIMENT_IMMUTABLE);
}

/**
 * Find an experiment record by ID.
 */
export function findExperimentById({ root, surface, experiment_id }) {
  const dirPath = resolveRecordDir(root, { type: "experiment", surface });
  return findRecordById(dirPath, experiment_id);
}
