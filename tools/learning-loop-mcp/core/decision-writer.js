/**
 * Decision writer — builds decision record YAML and writes to disk.
 */

import { sanitizeSlug, generateRecordId, generateFilename, generateISOTimestamp, resolveRecordDir, atomicWriteYaml, findRecordById, updateRecordFile } from "./record-writer.js";

const SCHEMA_VERSION = "1.0";

/**
 * Build a decision record YAML object from input params.
 * Fills auto-generated fields; requires human-authored fields.
 */
export function buildDecisionYaml({ surface, question, decision, rationale, alternatives, tradeoffs, source_refs, supersedes, decision_effect }) {
  const now = generateISOTimestamp();
  const slug = sanitizeSlug(decision);
  const id = generateRecordId({ type: "decision", surface, slug });

  return {
    id,
    schema_version: SCHEMA_VERSION,
    type: "decision",
    status: "draft",
    created_at: now,
    updated_at: now,
    source_refs: source_refs || [],
    question: question || "",
    decision: decision || "",
    rationale: rationale || "",
    alternatives: alternatives || [],
    tradeoffs: tradeoffs || [],
    supersedes: supersedes || [],
    ...(decision_effect ? { decision_effect } : {}),
  };
}

/**
 * Create a decision record file.
 * Returns { created: true, id, path } or { created: false, reason }.
 */
export function createDecision({ root, surface, question, decision, rationale, alternatives, tradeoffs, source_refs, supersedes, decision_effect }) {
  if (!question) return { created: false, reason: "missing question" };
  if (!decision) return { created: false, reason: "missing decision" };

  const record = buildDecisionYaml({ surface, question, decision, rationale, alternatives, tradeoffs, source_refs, supersedes, decision_effect });
  const dirPath = resolveRecordDir(root, { type: "decision", surface });
  const filename = generateFilename({ type: "decision", surface, slug: sanitizeSlug(decision) });
  const result = atomicWriteYaml(dirPath, filename, record);

  if (result.written) {
    return { created: true, id: record.id, path: result.path };
  }
  return { created: false, reason: result.reason, ...(result.existing_id ? { existing_id: result.existing_id } : {}) };
}

const DECISION_IMMUTABLE = ["id", "schema_version", "type", "created_at"];

/**
 * Update a decision record by ID.
 * Only mutable fields are changed; immutable fields preserved.
 * source_refs is append-only: new refs are merged with existing, duplicates removed.
 */
export function updateDecision({ root, surface, decision_id, updates }) {
  const dirPath = resolveRecordDir(root, { type: "decision", surface });

  // Handle append-only source_refs
  if (updates.source_refs && Array.isArray(updates.source_refs)) {
    const found = findRecordById(dirPath, decision_id);
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

  return updateRecordFile(dirPath, decision_id, updates, DECISION_IMMUTABLE);
}

/**
 * Find a decision record by ID.
 */
export function findDecisionById({ root, surface, decision_id }) {
  const dirPath = resolveRecordDir(root, { type: "decision", surface });
  return findRecordById(dirPath, decision_id);
}
