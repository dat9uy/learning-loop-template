// Plan 260717-1145 Phase 4 follow-up: shared schema-derived hint builder.
//
// Background: buildEmptyPatchHint (meta-state-patch-tool.js) and
// buildNoContentHint (meta-state-batch-tool.js) each compute the same
// schema-derived list of mutable content fields — a 13-line block that
// buildPatchSchemaFor(kind).shape -> Object.keys -> priority-sort -> slice(0,12).
// Fallow's new-only gate flagged the dup (fingerprint dup:7bcb1118,
// 13 lines / 83 tokens, instances=2) in PR #67. Centralizing here eliminates
// the duplication while preserving each hint's distinct message text.
//
// The hint never drifts from the schema because it is derived directly from
// buildPatchSchemaFor — the same source the patch tool uses to validate
// fields at the per-branch validator (meta-state-patch-tool.js#branchParse,
// meta-state-batch-tool.js#preflightUpdateOp).

import { buildPatchSchemaFor } from "../learning-loop-mastra/core/meta-state.js";

// description + evidence_code_ref are listed first because they are the
// common refresh case (operator stamping fresh description + cited code).
// Listed in priority order; preserved across both hint call-sites.
const PRIORITY_FIELDS = ["description", "evidence_code_ref"];

/**
 * Schema-derived comma-separated list of mutable content fields for a given
 * entry kind. description + evidence_code_ref are listed first (the common
 * refresh case). Caps at 12 fields to keep hint messages compact. Returns
 * `fallback` for unknown kinds (buildPatchSchemaFor throws or returns an
 * empty shape).
 *
 * Imported by:
 * - meta-state-patch-tool.js  (buildEmptyPatchHint)
 * - meta-state-batch-tool.js  (buildNoContentHint)
 *
 * @param {string} entryKind - The entry_kind (finding | rule | loop-design | change-log).
 * @param {string} fallback  - The text returned when no fields can be derived
 *                              (unknown kind or empty schema shape).
 * @returns {string} CSV of mutable fields, or `fallback`.
 */
export function listMutableFieldsCsv(entryKind, fallback) {
  let fields = [];
  try {
    const schema = buildPatchSchemaFor(entryKind);
    const shape = schema?._zod?.def?.shape ?? {};
    fields = Object.keys(shape);
  } catch {
    // Unknown entry_kind — fall back to `fallback`. Same try/catch shape as
    // the previous inline impl so behavior is preserved.
  }
  if (fields.length === 0) return fallback;
  const ordered = [
    ...PRIORITY_FIELDS.filter((f) => fields.includes(f)),
    ...fields.filter((f) => !PRIORITY_FIELDS.includes(f)),
  ];
  return ordered.slice(0, 12).join(", ");
}
