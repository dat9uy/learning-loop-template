import { z } from "zod";
import {
  readRegistry,
  updateEntry,
  buildPatchSchemaFor,
  PATCH_KINDS,
  IMMUTABLE_PATCH_FIELDS,
} from "../../core/meta-state.js";
import { deepStripEnvelope } from "../../core/envelope-stripper.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { listMutableFieldsCsv } from "#lib/patch-hints.js";

// Re-exported for backward compat with existing test imports
// (meta-state-patch-immutable-fields.test.js).
export { IMMUTABLE_PATCH_FIELDS };

export const metaStatePatchTool = {
  name: "meta_state_patch",
  description: "Patch an existing meta-state entry. Unifies update_finding / update_design / update_change_log / backfill_fingerprint into one tool. CAS via _expected_version (auto-captured if omitted). Idempotency by CAS (existing pattern in updateEntry). Wire-format safe: nest complex-typed fields inside the `patch` object to avoid top-level array/boolean coercion by the MCP wire layer. Closes the CRUD gap and the parent escape-hatch abuse. Identity and audit-trail fields are deny-listed and cannot be patched. Use when you need to mutate an existing entry (status flip, cross-reference backfill, fingerprint refresh). Not for creating a new entry (use `meta_state_report` or `meta_state_log_change` instead).",
  // Plan 260717-1145 Phase 2: model-visible JSON-schema hint — declare
  // minProperties: 1 on `patch` so the empty-{} safe emission (verified root
  // cause: union of 4 .partial().strict() branches all accept {}) is rejected
  // pre-invocation, steering constrained decoding toward a real field. The
  // runtime `empty_patch` check below stays as the safety net.
  parityJsonSchemaHints: {
    patch: { minProperties: 1 },
  },
  schema: {
    id: z.string().describe("Exact entry id to patch"),
    entry_kind: z.enum(["finding", "rule", "loop-design", "change-log"])
      .describe("Entry kind branch — used to validate patch shape. `change-log` is handler-level immutable; the schema allows it so the immutability branch is reachable."),
    patch: z.preprocess(deepStripEnvelope, z.union(PATCH_KINDS.map((k) => buildPatchSchemaFor(k))))
      .describe("Partial fields to update. Per-kind fields are strictly typed (.partial().strict(): all fields optional, no unknown keys). Identity and audit-trail fields (id, version, created_at, code_fingerprint, etc.) are denied at the handler. The 4 per-kind shapes derive from core/meta-state.js#metaStateEntrySchema's 4 branches via buildPatchSchemaFor; any schema drift in those branches is reflected here automatically. Cross-reference arrays (proposed_design_for, addresses, reopens) are envelope-stripped and validated as entry-id refs — invalid refs are rejected with an actionable message at this layer so the caller fixes the body instead of retrying wire shapes."),
    _expected_version: z.number().optional()
      .describe("Optional CAS: patch succeeds only if current entry.version === _expected_version. If omitted, the handler auto-captures the version from the pre-read for race safety. On mismatch, returns { patched: false, reason: 'version_mismatch', current_version }."),
    mechanism_check: z.coerce.boolean().optional()
      .describe("Script-caller passthrough: opt-in flag for fingerprint tracking on finding entries. Forwarded into `patch` for `entry_kind: 'finding'`; ignored for other kinds."),
    code_fingerprint: z.string().optional()
      .describe("Script-caller passthrough: SHA-256 fingerprint on finding entries. Forwarded into `patch` for `entry_kind: 'finding'`; will be rejected by the immutable-field deny-list — use `meta_state_refresh_file_index` to refresh the path-keyed fingerprint index instead. Ignored for other kinds."),
  },
  handler: async ({ id, entry_kind, patch, _expected_version, mechanism_check, code_fingerprint }) => {
    const root = resolveRoot();
    // Defense-in-depth mirroring meta_state_batch: the Zod schema above strips
    // envelopes on the MCP wire path, but direct handler callers (tests, agent
    // bypasses) skip Zod, so unwrap any {item: ...} coercion here too.
    // Idempotent on already-clean input. Same logic as batch — single shared
    // deepStripEnvelope utility, not a per-field reimplementation.
    patch = deepStripEnvelope(patch);
    const entries = readRegistry(root);
    const entry = entries.find((e) => e.id === id);

    if (!entry) {
      const result = { patched: false, reason: "not_found", id };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_patch", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    if (entry.entry_kind !== entry_kind) {
      const result = {
        patched: false,
        reason: "branch_mismatch",
        id,
        expected: entry_kind,
        actual: entry.entry_kind,
      };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_patch", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    if (entry.entry_kind === "change-log") {
      const result = { patched: false, reason: "change_log_immutable", id };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_patch", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    // Script-caller passthrough: allow tool-level mechanism_check and
    // code_fingerprint for finding entries and fold them into the patch object.
    // code_fingerprint remains immutable and is rejected by the deny-list below.
    let effectivePatch = patch;
    if (entry_kind === "finding") {
      const forwarded = {};
      if (mechanism_check !== undefined) forwarded.mechanism_check = mechanism_check;
      if (code_fingerprint !== undefined) forwarded.code_fingerprint = code_fingerprint;
      if (Object.keys(forwarded).length > 0) {
        effectivePatch = { ...patch, ...forwarded };
      }
    }

    const deniedFields = Object.keys(effectivePatch).filter((k) => IMMUTABLE_PATCH_FIELDS.has(k));
    if (deniedFields.length > 0) {
      const result = {
        patched: false,
        reason: "immutable_field",
        id,
        denied_fields: deniedFields,
        immutable_fields: [...IMMUTABLE_PATCH_FIELDS],
        // CV-B: code_fingerprint is a back-door write to the deprecated per-record
        // baseline. It is blocked here (no-op); point the caller at the authoritative
        // refresh path so they don't keep trying to patch a vestigial field.
        ...(deniedFields.includes("code_fingerprint")
          ? { deprecation_note: "code_fingerprint is deprecated; the baseline lives in file-index.jsonl. Use meta_state_refresh_file_index({ path }) to refresh a cited path's hash." }
          : {}),
      };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_patch", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    // Defense-in-depth (resolves meta-260717T1026Z-...empty-patch): after
    // stripping CAS + identity fields, the effective patch must still
    // contain at least one mutable field. An empty effective patch would
    // otherwise silently no-op via updateEntry's entriesEqual short-circuit
    // (line 1128 in core/meta-state.js) and return patched:true, masking
    // caller bugs (typo'd field, wrong tool choice). The schema refine
    // on metaStateEntryPatchSchema catches direct core callers; this
    // handler-level check catches the MCP-wire path BEFORE the CAS field
    // is added, so the user sees the rejection for the patch they actually
    // sent (not a schema error after CAS injection).
    if (Object.keys(effectivePatch).length === 0) {
      const result = {
        patched: false,
        reason: "empty_patch",
        id,
        entry_kind,
        hint: buildEmptyPatchHint(entry_kind),
      };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_patch", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    // Plan 260717-1145 Phase 3: per-branch validation. The model-visible
    // patch schema is the union of all 4 per-kind shapes (permissive on
    // purpose — every field every kind accepts), so a real-but-invalid
    // field returns the opaque `z.union` "Invalid input" with path:[],
    // which makes the model retreat to {}. Validate against the SINGLE
    // branch selected by entry_kind; on failure, surface the offending
    // field + constraint message so the model can self-correct. The
    // invalid_field rejection never reaches the registry (no updateEntry
    // call) and never collapses with the empty_patch check (this runs
    // AFTER the empty check so empty patches still get the
    // content-aware hint).
    const branchSchema = buildPatchSchemaFor(entry_kind);
    const branchParse = branchSchema.safeParse(effectivePatch);
    if (!branchParse.success) {
      const result = {
        patched: false,
        reason: "invalid_field",
        id,
        entry_kind,
        field_errors: branchParse.error.issues.map((i) => ({
          field: Array.isArray(i.path) && i.path.length > 0 ? i.path.join(".") : "(root)",
          message: i.message,
        })),
      };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_patch", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    const currentVersion = entry.version ?? 0;
    const effectiveExpectedVersion = _expected_version !== undefined
      ? _expected_version
      : currentVersion;
    const patchWithCAS = { ...effectivePatch, _expected_version: effectiveExpectedVersion };

    const updateResult = await updateEntry(root, id, patchWithCAS);

    if (updateResult === "version_mismatch") {
      const freshEntries = readRegistry(root);
      const fresh = freshEntries.find((e) => e.id === id);
      const result = {
        patched: false,
        reason: "version_mismatch",
        id,
        current_version: fresh?.version ?? 0,
      };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_patch", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    if (updateResult === "validation_failed") {
      const result = { patched: false, reason: "validation_failed", id };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_patch", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    if (updateResult !== true) {
      throw new Error(
        `meta_state_patch: unexpected updateEntry result for ${id}: ${JSON.stringify(updateResult)}`
      );
    }

    const updatedEntries = readRegistry(root);
    const updated = updatedEntries.find((e) => e.id === id);

    const result = {
      patched: true,
      id,
      entry_kind: updated.entry_kind,
      version: updated.version,
      entry: updated,
    };

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "meta_state_patch",
      id,
      entry_kind: updated.entry_kind,
      fields_patched: Object.keys(effectivePatch),
      version: updated.version,
    });

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};

// Plan 260717-1145 Phase 4: schema-derived empty_patch hint. The prior
// static hint only named lifecycle tools (supersede / resolve / log_change)
// — none of which update description or evidence_code_ref, the actual goal
// in session e10944c4. Build the field list from
// buildPatchSchemaFor(entry_kind)'s shape so each kind names its own mutable
// fields (no finding-only recurrence_key leaking into a rule hint, etc.)
// and the hint never drifts when the schema changes. description + evidence_code_ref
// are listed first because they are the common refresh case.
//
// Schema derivation + priority ordering delegated to listMutableFieldsCsv
// (tools/lib/patch-hints.js) — shared with meta-state-batch-tool.js's
// buildNoContentHint. Centralization closes fallow dup:7bcb1118 from PR #67.
function buildEmptyPatchHint(entryKind) {
  const fieldList = listMutableFieldsCsv(
    entryKind,
    "see the per-kind patch schema for the full field list",
  );
  return `patch must contain at least one mutable field for entry_kind=${entryKind}. Mutable content fields: ${fieldList}. For status / consolidated_into use meta_state_supersede; for resolved use meta_state_resolve; for schema / rule / tool / policy / surface changes use meta_state_log_change.`;
}
