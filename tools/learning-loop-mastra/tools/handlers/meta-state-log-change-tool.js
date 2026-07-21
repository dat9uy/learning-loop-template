import { z } from "zod";
import { writeEntry, generateId, metaStateChangeEntrySchema } from "../../core/meta-state.js";
import { slugify } from "../../core/slugify.js";
import { assertWriteVisible, WriteNotVisibleError } from "../../core/update-entry-helpers.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { stripEnvelope } from "../../core/envelope-stripper.js";

// Plan 260711-0030 Phase 2: in-process idempotency cache dropped.
// The previous 60s Map at this module masked silent-persistence-fail by
// returning {logged: true, cache_hit: true} when the underlying writeEntry
// silently dropped the entry. With Phase 1's cross-process file lock, the
// underlying write is safe; idempotency now belongs to the durable registry
// (the freshly-generated `id` differs for each call because `created_at`
// advances within the millisecond). Replay protection, if needed, lives in
// `meta_state_list({id: ...})`, not in a per-process Map.

// Plan 260715-0801 Validation Q2: consolidates is z.array(z.string()) per the
// schema. The MCP wire-format array-guard requires every array field to be
// wrapped with z.preprocess(stripEnvelope, ...) so the SDK's wire-format
// coercion (which can drop arrays wrapped in {item: [...]} envelopes) doesn't
// silently strip the field. See tools/learning-loop-mastra/__tests__/legacy-mcp/
// wire-format-array-guard.test.js for the regression test.
//
// NOTE: do NOT use `metaStateChangeEntrySchema.pick({consolidates: preprocess-wrapped})`
// — zod's `.pick()` collapses the preprocess wrap to just `optional` on a
// ZodObject with optional fields. Build the schema as a plain z.object with
// the preprocess-wrapped field passed directly. The pipe → transform →
// optional → array chain is preserved this way.
// The field glossary is the pull surface for repeated semantics; keep
// always-on descriptions to compact pointers while preserving constraints.
const describeChangeField = (field, schema) => schema.describe(`See field_glossary.${field}`);

export const metaStateLogChangeTool = {
  name: "meta_state_log_change",
  description: "Append an immutable system change-log entry.",
  schema: z.object({
    change_dimension: describeChangeField("change_dimension", metaStateChangeEntrySchema.shape.change_dimension),
    change_target: describeChangeField("change_target", metaStateChangeEntrySchema.shape.change_target),
    change_diff: describeChangeField("change_diff", metaStateChangeEntrySchema.shape.change_diff),
    reason: describeChangeField("reason", metaStateChangeEntrySchema.shape.reason),
    applies_to: describeChangeField("applies_to", metaStateChangeEntrySchema.shape.applies_to),
    supersedes: describeChangeField("supersedes", metaStateChangeEntrySchema.shape.supersedes),
    // Plan 260712-0300 — operation_envelope: accepts the magnitude envelope from auto-emit.
    consolidates: describeChangeField("consolidates", z.preprocess(stripEnvelope, z.array(z.string()).optional())),
    evidence_code_ref: describeChangeField("evidence_code_ref", metaStateChangeEntrySchema.shape.evidence_code_ref),
    evidence_journal: describeChangeField("evidence_journal", metaStateChangeEntrySchema.shape.evidence_journal),
    operation_envelope: describeChangeField("operation_envelope", metaStateChangeEntrySchema.shape.operation_envelope),
  }).strict().shape,
  handler: async ({
    change_dimension,
    change_target,
    change_diff,
    reason,
    applies_to,
    supersedes,
    consolidates,
    evidence_code_ref,
    evidence_journal,
    operation_envelope,
  }) => {
    const root = resolveRoot();

    const id = generateId(slugify(change_target));
    const now = new Date();

    // Plan 260715-0801 Validation Q2: schema is z.array(z.string()).
    // Normalize a single string (or comma-separated string) into the array
    // form the schema requires. Back-compat for callers still passing a
    // single id; array form passes through unchanged.
    const consolidatesNormalized = Array.isArray(consolidates)
      ? consolidates
      : (typeof consolidates === "string" && consolidates.trim())
        ? consolidates.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;

    const entry = {
      id,
      entry_kind: "change-log",
      change_dimension,
      change_target,
      change_diff,
      reason,
      ...(applies_to && { applies_to }),
      ...(supersedes && { supersedes }),
      ...(consolidatesNormalized && { consolidates: consolidatesNormalized }),
      ...(evidence_code_ref && { evidence_code_ref }),
      ...(evidence_journal && { evidence_journal }),
      // Plan 260712-0300: optional magnitude envelope; the MIGRATED_FIELDS
      // projection + .strict() gate ensures the field is only written when
      // it round-trips Zod validation (no caller-supplied garbage on writes
      // because the `meta_state_batch` envelope is auto-emit, not caller-set).
      ...(operation_envelope && { operation_envelope }),
      status: "active",
      created_at: now.toISOString(),
      version: 0,
    };

    await writeEntry(root, entry);

    // Plan 260711-0030 Phase 3: post-write visibility re-read. Closes T4
    // (silent-persistence-fail class). If the entry is not visible after
    // writeEntry returns, return a structured failure rather than claiming
    // {logged: true}.
    try {
      await assertWriteVisible(root, id, "meta_state_log_change");
    } catch (err) {
      if (err instanceof WriteNotVisibleError) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              logged: false,
              ok: false,
              reason: "write_not_visible",
              id,
            }),
          }],
        };
      }
      throw err;
    }

    appendGateLog(root, {
      timestamp: now.toISOString(),
      tool: "meta_state_log_change",
      id,
      change_dimension,
      change_target,
    });

    const result = {
      logged: true,
      id,
      entry_kind: "change-log",
      change_dimension,
      change_target,
      created_at: now.toISOString(),
    };

    return {
      content: [{
        type: "text",
        text: JSON.stringify(result),
      }],
    };
  },
};
