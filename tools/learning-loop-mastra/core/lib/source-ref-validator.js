/**
 * Source ref validator for MCP tools.
 * Reuses existing validation functions from ../record-validation-rules.js
 * with MCP-specific error messages.
 */

import { validateLocalRef as validateLocalRefCore, validateAllowedLocalPath } from "../record-validation-rules.js";
import { readRegistry } from "../meta-state.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ALLOWED_LOCAL_ROOTS = {
  default: ["records/evidence", "records/*/evidence"],
  capability: ["records/evidence", "records/*/evidence", "product/*/capabilities"],
};

const META_STATE_ID_PATTERN = /^meta-\d{6}T\d{4}Z-[a-z0-9-]{1,200}$/;
const PATH_TRAVERSAL_PATTERN = /\.\.|\/|\\|\0/;

function getAllowedRoots(recordType) {
  return ALLOWED_LOCAL_ROOTS[recordType] || ALLOWED_LOCAL_ROOTS.default;
}

function getAllowedDescription(recordType) {
  const roots = getAllowedRoots(recordType);
  return roots.join(", ");
}

// fallow-ignore-next-line complexity
function validateMetaStateRef(entryId, root) {
  if (!entryId || entryId.length === 0) {
    return { valid: false, error: "must contain a meta-state entry ID" };
  }
  if (entryId.length > 200) {
    return { valid: false, error: "meta-state entry ID exceeds 200 characters" };
  }
  if (PATH_TRAVERSAL_PATTERN.test(entryId)) {
    return { valid: false, error: "id contains path-traversal characters ('..' or '/')" };
  }
  if (!entryId.startsWith("meta-")) {
    return { valid: false, error: `id prefix must be 'meta-' (got '${entryId.split("-")[0]}-'; observation ids are not meta-state entries)` };
  }
  if (!META_STATE_ID_PATTERN.test(entryId)) {
    return { valid: false, error: "id does not match the meta-state entry format (meta-YYMMDDTHHMMZ-slug)" };
  }
  const registry = readRegistry(root);
  if (!registry.some((e) => e.id === entryId)) {
    return { valid: false, error: `meta-state entry ${entryId} not found in registry` };
  }
  return { valid: true };
}

/**
 * Validate a single source ref string.
 * @param {string} ref - The source ref (e.g., "local:records/evidence/test.md")
 * @param {string} recordType - The type of record being created/updated
 * @param {string} root - The project root path
 * @returns {{valid: boolean, error?: string}}
 */
// fallow-ignore-next-line complexity
export function validateSourceRef(ref, recordType, root) {
  if (typeof ref !== "string") {
    return { valid: false, error: `source ref must be a string, got ${typeof ref}` };
  }

  if (ref.startsWith("self:")) {
    const selfPath = ref.slice("self:".length);
    if (!selfPath || selfPath.length < 1) {
      return { valid: false, error: `self: ref must contain a path component, got "${selfPath}"` };
    }
    return { valid: true };
  }

  if (ref.startsWith("legacy:")) {
    // Legacy refs are allowed but deprecated
    return { valid: true, deprecated: true };
  }

  if (ref.startsWith("local:meta-state:")) {
    const entryId = ref.slice("local:meta-state:".length);
    return validateMetaStateRef(entryId, root);
  }

  if (ref.startsWith("local:")) {
    const relativePath = ref.slice("local:".length);

    if (relativePath.startsWith("records/meta/evidence/")) {
      return {
        valid: false,
        error: "source ref must be `local:meta-state:<id>` for code citations; markdown refs (`local:plans/...`) are accepted for the escape hatch but discouraged. Use `meta_state_report` with `evidence_code_ref` to cite code.",
      };
    }

    if (relativePath.startsWith("plans/") || relativePath.startsWith("docs/")) {
      return { valid: true, deprecated: true };
    }

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
    // The full validation in ../../core/record-validation-rules.js will catch missing refs
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
// fallow-ignore-next-line complexity
export function mergeSourceRefs(existing, newRefs) {
  const merged = [...(existing || [])];
  for (const ref of newRefs || []) {
    if (!merged.includes(ref)) {
      merged.push(ref);
    }
  }
  return merged;
}
