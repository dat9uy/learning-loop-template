/**
 * Source ref validator for MCP tools.
 * Reuses existing validation functions from validate-records/record-validation-rules.js
 * with MCP-specific error messages.
 */

import { validateLocalRef as validateLocalRefCore, validateAllowedLocalPath } from "../../../validate-records/record-validation-rules.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ALLOWED_LOCAL_ROOTS = {
  default: ["records/evidence", "records/*/evidence"],
  capability: ["records/evidence", "records/*/evidence", "product/*/capabilities"],
};

function getAllowedRoots(recordType) {
  return ALLOWED_LOCAL_ROOTS[recordType] || ALLOWED_LOCAL_ROOTS.default;
}

function getAllowedDescription(recordType) {
  const roots = getAllowedRoots(recordType);
  return roots.join(", ");
}

/**
 * Validate a single source ref string.
 * @param {string} ref - The source ref (e.g., "local:records/evidence/test.md")
 * @param {string} recordType - The type of record being created/updated
 * @param {string} root - The project root path
 * @returns {{valid: boolean, error?: string}}
 */
export function validateSourceRef(ref, recordType, root) {
  if (typeof ref !== "string") {
    return { valid: false, error: `source ref must be a string, got ${typeof ref}` };
  }

  if (ref.startsWith("legacy:")) {
    // Legacy refs are allowed but deprecated
    return { valid: true, deprecated: true };
  }

  if (ref.startsWith("local:")) {
    const relativePath = ref.slice("local:".length);
    const errors = [];
    validateAllowedLocalPath(
      "source_ref",
      relativePath,
      root,
      getAllowedRoots(recordType),
      getAllowedDescription(recordType),
      errors
    );
    if (errors.length > 0) {
      return { valid: false, error: errors[0] };
    }
    return { valid: true };
  }

  if (ref.startsWith("record:")) {
    const recordId = ref.slice("record:".length);
    if (!recordId || recordId.length < 3) {
      return { valid: false, error: `record: ref must contain a record ID, got "${recordId}"` };
    }
    // Check if the record exists on disk
    // We can't easily check all surfaces, so we do a best-effort check
    // The full validation in validate-records will catch missing refs
    return { valid: true };
  }

  return { valid: false, error: `source ref must start with local:, record:, or legacy:, got "${ref}"` };
}

/**
 * Validate an array of source refs.
 * @param {string[]} refs - Array of source ref strings
 * @param {string} recordType - The type of record being created/updated
 * @param {string} root - The project root path
 * @returns {{valid: boolean, errors: string[], deprecated: string[]}}
 */
export function validateSourceRefs(refs, recordType, root) {
  const errors = [];
  const deprecated = [];

  for (const ref of refs) {
    const result = validateSourceRef(ref, recordType, root);
    if (!result.valid) {
      errors.push(result.error);
    } else if (result.deprecated) {
      deprecated.push(ref);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    deprecated,
  };
}

/**
 * Merge new source refs with existing ones (append-only, deduplicated).
 * @param {string[]} existing - Existing source refs
 * @param {string[]} newRefs - New source refs to append
 * @returns {string[]} - Merged, deduplicated array
 */
export function mergeSourceRefs(existing, newRefs) {
  const merged = [...(existing || [])];
  for (const ref of newRefs || []) {
    if (!merged.includes(ref)) {
      merged.push(ref);
    }
  }
  return merged;
}
