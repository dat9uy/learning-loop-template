/**
 * Risk writer — builds risk record YAML and writes to disk.
 */

import { sanitizeSlug, generateRecordId, generateFilename, generateISOTimestamp, resolveRecordDir, atomicWriteYaml, findRecordById, updateRecordFile } from "./record-writer.js";

const SCHEMA_VERSION = "1.0";

const VALID_CATEGORIES = ["license", "scope-boundary", "data-quality", "runtime", "security", "compliance", "other"];
const VALID_SEVERITIES = ["low", "medium", "high", "critical"];
const VALID_LIKELIHOODS = ["low", "medium", "high"];
const VALID_CONFIDENCES = ["low", "medium", "high"];

/**
 * Build a risk record YAML object from input params.
 */
export function buildRiskYaml({ surface, risk_statement, category, severity, likelihood, confidence, source_refs, claim_refs, experiment_refs, mitigation, assertion_refs }) {
  const now = generateISOTimestamp();
  const slug = sanitizeSlug(risk_statement);
  const id = generateRecordId({ type: "risk", surface, slug });

  const cat = VALID_CATEGORIES.includes(category) ? category : "other";
  const sev = VALID_SEVERITIES.includes(severity) ? severity : "medium";
  const lik = VALID_LIKELIHOODS.includes(likelihood) ? likelihood : "medium";
  const con = VALID_CONFIDENCES.includes(confidence) ? confidence : "medium";

  return {
    id,
    schema_version: SCHEMA_VERSION,
    type: "risk",
    status: "draft",
    created_at: now,
    updated_at: now,
    risk_statement: risk_statement || "",
    category: cat,
    severity: sev,
    likelihood: lik,
    confidence: con,
    ...(source_refs ? { source_refs } : {}),
    ...(claim_refs ? { claim_refs } : {}),
    ...(experiment_refs ? { experiment_refs } : {}),
    ...(assertion_refs ? { assertion_refs } : {}),
    ...(mitigation ? { mitigation } : {}),
  };
}

/**
 * Create a risk record file.
 * Returns { created: true, id, path } or { created: false, reason }.
 */
export function createRisk({ root, surface, risk_statement, category, severity, likelihood, confidence, source_refs, claim_refs, experiment_refs, mitigation, assertion_refs }) {
  if (!risk_statement) return { created: false, reason: "missing risk_statement" };

  const record = buildRiskYaml({ surface, risk_statement, category, severity, likelihood, confidence, source_refs, claim_refs, experiment_refs, mitigation, assertion_refs });
  const dirPath = resolveRecordDir(root, { type: "risk", surface });
  const filename = generateFilename({ type: "risk", surface, slug: sanitizeSlug(risk_statement) });
  const result = atomicWriteYaml(dirPath, filename, record);

  if (result.written) {
    return { created: true, id: record.id, path: result.path };
  }
  return { created: false, reason: result.reason, ...(result.existing_id ? { existing_id: result.existing_id } : {}) };
}

const RISK_IMMUTABLE = ["id", "schema_version", "type", "created_at"];

/**
 * Update a risk record by ID.
 */
export function updateRisk({ root, surface, risk_id, updates }) {
  const dirPath = resolveRecordDir(root, { type: "risk", surface });
  return updateRecordFile(dirPath, risk_id, updates, RISK_IMMUTABLE);
}

/**
 * Find a risk record by ID.
 */
export function findRiskById({ root, surface, risk_id }) {
  const dirPath = resolveRecordDir(root, { type: "risk", surface });
  return findRecordById(dirPath, risk_id);
}
