import { z } from "zod";
import {
  readRegistry,
  updateEntry,
  appendCitationEntryAtomic,
  buildPatchSchemaFor,
  PATCH_KINDS,
  IMMUTABLE_PATCH_FIELDS,
} from "../../core/meta-state.js";
import { deepStripEnvelope } from "../../core/envelope-stripper.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { listMutableFieldsCsv } from "#lib/patch-hints.js";
import { getFieldGlossaryEntry } from "../../core/field-glossary.js";

// Re-exported for backward compat with existing test imports
// (meta-state-patch-immutable-fields.test.js).
export { IMMUTABLE_PATCH_FIELDS };

const patchFieldHints = PATCH_KINDS
  .map((kind) => `${kind}: ${listMutableFieldsCsv(kind, "see branch schema")}`)
  .join("; ");

export const metaStatePatchTool = {
  name: "meta_state_patch",
  description: `Patch one existing meta-state entry with a CAS-safe mutable-field update. Select entry_kind, send at least one field in patch, and use the dedicated lifecycle tools for status changes. Branch schemas are returned in invalid_field/empty_patch payloads; the cold loop_describe tier carries the shared field glossary. Mutable fields by kind: ${patchFieldHints}.`,
  // Model-visible steering only; runtime parsing intentionally remains permissive
  // so the handler can return localized branch errors instead of an opaque union
  // failure. The branch schema moves to the invocation response below.
  parityJsonSchemaHints: {
    patch: { minProperties: 1 },
  },
  schema: {
    id: z.string().describe("Exact entry id to patch"),
    entry_kind: z.enum(["finding", "rule", "loop-design", "change-log"])
      .describe("Entry kind branch used to select the invocation-time patch schema."),
    patch: z.preprocess(deepStripEnvelope, z.record(z.string(), z.unknown()))
      .describe("Free-form mutable patch object. Send one or more fields; branch validation and the full patch_schema arrive in an error payload when needed."),
    _expected_version: z.number().optional()
      .describe("Optional CAS version; omitted means the handler captures the current version."),
    mechanism_check: z.coerce.boolean().optional()
      .describe("Finding-only passthrough for mechanism_check; ignored for other kinds."),
    code_fingerprint: z.string().optional()
      .describe("Finding-only passthrough; immutable. Use meta_state_refresh_file_index to refresh the baseline."),
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
      return reject(root, { patched: false, reason: "not_found", id });
    }

    if (entry.entry_kind !== entry_kind) {
      return reject(root, {
        patched: false,
        reason: "branch_mismatch",
        id,
        expected: entry_kind,
        actual: entry.entry_kind,
      });
    }

    if (entry.entry_kind === "change-log") {
      return reject(root, { patched: false, reason: "change_log_immutable", id });
    }

    // Patch-create parity: the buildProcessView (hint-registry.js) reads
    // `rule.hint_suggestion` unconditionally for agent-checklist rules, so
    // any rule that lacks it (because it was promoted before the field
    // existed) must gain it via a single patch that supplies the field.
    // The reject reason is named so a follow-up patch that includes
    // `hint_suggestion` is the obvious next step.
    if (entry.entry_kind === "rule" && entry.pattern_type === "agent-checklist") {
      const hasCurrent = typeof entry.hint_suggestion === "string" && entry.hint_suggestion.length >= 20;
      const hasPatch = typeof patch.hint_suggestion === "string" && patch.hint_suggestion.length >= 20 && patch.hint_suggestion.length <= 200 && !/[\n\r]/.test(patch.hint_suggestion);
      if (!hasCurrent && !hasPatch) {
        return reject(root, {
          patched: false,
          reason: "hint_suggestion_required_for_agent_checklist",
          id,
          message: "Agent-checklist rule patch must include a `hint_suggestion` field (single-line, 20-200 chars) when the rule has none. The buildProcessView in hint-registry.js reads it unconditionally; a missing field would make the rule drop from the process-hint view at render time.",
        });
      }
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

    // Phase 4: `supersedes` on a rule patch is the rule→rule supersession
    // edge. Strip it from the patch (the on-record field is
    // inert-historical; the live edge is a citation row) and emit the
    // citation post-write. `origin` on a rule patch is rejected outright
    // — it was de-routed in Phase 4 (canonical promotion edge is the
    // citation emitted by `meta_state_promote_rule`).
    let supersedesEmitted = null;
    if (entry_kind === "rule") {
      if (effectivePatch && Object.prototype.hasOwnProperty.call(effectivePatch, "origin")) {
        return reject(root, {
          patched: false,
          reason: "origin_inert_historical",
          id,
          entry_kind,
          message: "`origin` is inert-historical on rule entries (Phase 4 of meta-state-lifecycle-migration). The canonical promotion edge is a citation row emitted by meta_state_promote_rule. Migrate via meta_state_promote_rule, not meta_state_patch.",
        });
      }
      if (effectivePatch && typeof effectivePatch.supersedes === "string" && effectivePatch.supersedes.length > 0) {
        supersedesEmitted = effectivePatch.supersedes;
        const { supersedes: _drop, ...rest } = effectivePatch;
        effectivePatch = rest;
      }
    }

    const deniedFields = Object.keys(effectivePatch).filter((k) => IMMUTABLE_PATCH_FIELDS.has(k));
    if (deniedFields.length > 0) {
      return reject(root, {
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
      });
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
      return reject(root, {
        patched: false,
        reason: "empty_patch",
        id,
        entry_kind,
        hint: buildEmptyPatchHint(entry_kind),
        patch_schema: buildPatchSchemaPayload(entry_kind),
      });
    }

// per-branch validation. The model-visible
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
      return reject(root, {
        patched: false,
        reason: "invalid_field",
        id,
        entry_kind,
        field_errors: branchParse.error.issues.map((i) => {
          const field = Array.isArray(i.path) && i.path.length > 0 ? i.path.join(".") : "(root)";
          const glossary = getFieldGlossaryEntry(field);
          return {
            field,
            message: i.message,
            ...(glossary ? { glossary } : {}),
          };
        }),
        patch_schema: buildPatchSchemaPayload(entry_kind),
      });
    }

    const currentVersion = entry.version ?? 0;
    const effectiveExpectedVersion = _expected_version !== undefined
      ? _expected_version
      : currentVersion;
    const patchWithCAS = { ...effectivePatch, _expected_version: effectiveExpectedVersion };

    const updateResult = await updateEntry(root, id, patchWithCAS);

    // Phase 4: emit the rule→rule supersedes citation after the patch
    // lands. Atomic append + cache invalidation (handled by
    // appendCitationEntryAtomic).
    if (supersedesEmitted) {
      const now = new Date().toISOString();
      appendCitationEntryAtomic(root, {
        id: `citation-rule-supersedes-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        entry_kind: "citation",
        source: id,
        target: supersedesEmitted,
        rationale: "supersedes",
        recorded_at: now,
        recorded_by: "operator",
        status: "active",
      });
    }

    if (updateResult === "version_mismatch") {
      const freshEntries = readRegistry(root);
      const fresh = freshEntries.find((e) => e.id === id);
      return reject(root, {
        patched: false,
        reason: "version_mismatch",
        id,
        current_version: fresh?.version ?? 0,
      });
    }

    if (updateResult === "validation_failed") {
      return reject(root, { patched: false, reason: "validation_failed", id });
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

/**
 * Serialize only the selected branch for invocation-time diagnostics.
 * Never call z.toJSONSchema on the root tool schema: createLoopTool uses a
 * root-to-$ref override. Branch schemas have no override and are safe to emit.
 */
function buildPatchSchemaPayload(entryKind) {
  return z.toJSONSchema(buildPatchSchemaFor(entryKind), { target: "draft-7", io: "input" });
}

// Shared rejection path: log the result to the gate log and return it as the
// tool's text content. Every non-success branch in the handler uses this so
// the log+return shape stays identical (closes the fallow patch-tool clone).
function reject(root, result) {
  appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_patch", ...result });
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
}

// schema-derived empty_patch hint. The prior
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
  return `patch must contain at least one mutable field for entry_kind=${entryKind}. Mutable content fields: ${fieldList}. For status / closure use meta_state_supersede (emits a citation) or meta_state_resolve; for schema / rule / tool / policy / surface changes use meta_state_log_change. Phase 3: consolidated_into is inert-historical; use meta_state_supersede to emit a citation.`;
}
