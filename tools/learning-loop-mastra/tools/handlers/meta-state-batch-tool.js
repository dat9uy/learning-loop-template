import { deepStripEnvelope } from "../../core/envelope-stripper.js";
import { z } from "zod";
import { resolveRoot } from "#lib/resolve-root.js";
import { listMutableFieldsCsv } from "#lib/patch-hints.js";
import {
  metaStateBatch,
  readRegistry,
  buildPatchSchemaFor,
  IMMUTABLE_PATCH_FIELDS,
} from "../../core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
// Plan 260712-0300 Phase 2: single source of truth for BATCH_SIZE_LIMIT.
// Both the handler and the core (meta-state.js) import from core/constants.js
// so the 500-op cap is enforced uniformly — closes the 100-vs-500 reject window.
import { BATCH_SIZE_LIMIT } from "../../core/constants.js";
// Plan 260712-0300 Phase 2: import kind enum for the new optional `envelope`
// field parallel to `operations` on the batch request shape.
import { OPERATION_ENVELOPE_KINDS } from "../../core/operation-envelope.js";

// Plan 260717-1145 Phase 3: identity + CAS keys whose presence does NOT
// constitute an inline content field on an update op. Centralized here so
// the no-content check and the per-kind validator stay in sync with core
// (which strips exactly these when it processes an update op).
const BATCH_UPDATE_IDENTITY_KEYS = new Set(["op", "id", "_expected_version", "entry_kind", "envelope"]);

const opSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("write"),
    entry: z.record(z.string(), z.unknown()).describe("Entry to write; validated against metaStateEntrySchema"),
  }),
  z.object({
    op: z.literal("update"),
    id: z.string().describe("Entry id to update"),
    _expected_version: z.number().optional().describe("Optional CAS version"),
  }).passthrough().describe("Update op; additional fields are merged into the entry"),
  z.object({
    op: z.literal("delete"),
    id: z.string().describe("Entry id to delete"),
  }),
  z.object({
    op: z.literal("archive"),
    id: z.string().describe("Entry id to archive"),
    reason: z.string().optional().describe("Reason for archival"),
    archived_by: z.string().optional().describe("Who triggered the archive"),
  }),
]);

export const metaStateBatchTool = {
  name: "meta_state_batch",
  description: "Apply a batch of meta-state operations atomically. Single tool, single lock, single cache invalidation. Operations: write | update | delete | archive. Cap: 500 ops per call (covers the documented 268-finding scout closeout with 1.87x headroom; overridable via META_STATE_BATCH_LIMIT env var). On any failure, all prior ops are rolled back and the registry is unchanged. Use this for high-volume closeouts to keep cache invalidations at 1 instead of N.",
  schema: {
    // Recursive envelope strip handles top-level `operations: {item:[...]}` coercion
    // AND nested arrays inside each entry (e.g. change_diff.added, loop-design.addresses)
    // since z.preprocess recurses into the parsed value before inner schema validation.
    operations: z.preprocess(
      deepStripEnvelope,
      z.array(opSchema).min(1).max(BATCH_SIZE_LIMIT)
    ).describe(`Array of operations to apply (1-${BATCH_SIZE_LIMIT} ops; default limit 500, overridable via META_STATE_BATCH_LIMIT)`),
    // Plan 260712-0300 Phase 2: optional magnitude envelope. When present, an
    // envelope-annotated change-log is auto-emitted AFTER the batch lands with
    // pre_count/post_count computed from the registry before/after the batch
    // and content_hash = SHA-256(kind + target + canonical op-list + entry-id-set).
    envelope: z.preprocess(
      deepStripEnvelope,
      z.object({
        kind: z.enum(OPERATION_ENVELOPE_KINDS)
          .describe("Magnitude kind; see loop-design-operation-envelope-on-change-log. Compat with ops is enforced at buildEnvelope (KIND_OP_COMPATIBILITY)."),
        target: z.string().min(1).max(200)
          .regex(/^[^\x00-\x1f\x7f]+$/, "target must not contain control chars")
          .regex(/^(?!.*\.\.).*$/, "target must not contain '..' path segments")
          .describe("Identifier for the batch's target (e.g., 'drift-closeout-2026-07-12'). Validated for path safety; not a filesystem path."),
      }).optional()
    ).describe("Optional magnitude envelope; when present, an envelope-annotated change-log is auto-emitted after the batch lands. pre_count/post_count are computed from the registry before/after the batch; content_hash is a SHA-256 of kind+target+canonical op-list+entry-id-set (NOT a replay protection). See loop-design-operation-envelope-on-change-log."),
  },
  handler: async ({ operations, envelope }) => {
    const root = resolveRoot();
    // Defense-in-depth: the Zod schema above strips envelopes on the MCP wire
    // path, but direct handler callers (tests, agent bypasses) skip Zod, so
    // unwrap any {item: [...]} coercion here too. Idempotent on uncoerced input.
    const unwrapped = deepStripEnvelope(operations);
    const unwrappedEnvelope = envelope ? deepStripEnvelope(envelope) : undefined;

    // Plan 260717-1145 Phase 3: per-op preflight for update ops. Pre-walk
    // runs BEFORE metaStateBatch so a rejected op fails the whole batch
    // atomically (matches core's rollback shape: {applied:0, failed_at:i,
    // reason, op, ...extra}). The preflight logic lives in preflightUpdateOp
    // — pulled out of this handler to keep cognitive complexity under the
    // fallow threshold (was 22 / threshold 15 in PR #67).
    if (Array.isArray(unwrapped)) {
      const existingById = new Map(readRegistry(root).map((e) => [e.id, e]));
      for (let i = 0; i < unwrapped.length; i++) {
        const result = preflightUpdateOp(root, unwrapped, i, existingById);
        if (result) return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    }

    const result = await metaStateBatch(root, unwrapped, unwrappedEnvelope);
    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "meta_state_batch",
      op_count: Array.isArray(unwrapped) ? unwrapped.length : 0,
      applied: result.applied,
      failed_at: result.failed_at,
      reason: result.reason ?? null,
    });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};

// Plan 260717-1145 Phase 3: per-op preflight for update ops. Returns a
// rejection-result object {reason, ...} if the op should fail-fast; null if
// the op passes preflight and should fall through to metaStateBatch.
//
// Order matters (mirrors the patch tool's order so the same op shape behaves
// identically on both surfaces):
//   1. not_found          — core handles it (return null, let core fire)
//   2. immutable_field    — core handles it (return null, let core fire)
//   3. no_content         — pre-walk: zero-content update is a silent-success
//                           bug (same class as patch's empty-{}, via core's
//                           entriesEqual short-circuit on the inline fields)
//   4. invalid_field      — pre-walk: real-but-invalid inline field otherwise
//                           returns opaque z.union "Invalid input" path:[]
//
// (1) and (2) intentionally pass-through to core so the existing core
// behavior (with its deny-list precedence) is preserved; (3) and (4) are
// the new pre-walk rejections introduced by plan 260717-1145 Phase 3.
function preflightUpdateOp(root, ops, i, existingById) {
  const op = ops[i];
  if (!op || op.op !== "update") return null;
  const existing = existingById.get(op.id);
  if (!existing) return null; // not_found — let core fire
  const inlineKeys = Object.keys(op).filter((k) => !BATCH_UPDATE_IDENTITY_KEYS.has(k));
  // IMMUTABLE_PATCH_FIELDS deny-list takes precedence over the new
  // no_content / invalid_field paths — strip those keys from per-branch
  // validation so they don't trigger a misleading "unknown field"
  // invalid_field rejection. Let core's deny-list fire on its own.
  const denied = inlineKeys.filter((k) => IMMUTABLE_PATCH_FIELDS.has(k));
  if (denied.length > 0) return null; // immutable_field — let core fire
  if (inlineKeys.length === 0) {
    return buildNoContentResult(root, ops, i, op, existing);
  }
  const branchSchema = buildPatchSchemaFor(existing.entry_kind);
  const inlinePatch = Object.fromEntries(inlineKeys.map((k) => [k, op[k]]));
  const parsed = branchSchema.safeParse(inlinePatch);
  if (!parsed.success) {
    return buildInvalidFieldResult(root, ops, i, op, existing, parsed.error);
  }
  return null;
}

// Build the no_content rejection result + gate-log entry. Pulled out of
// preflightUpdateOp to keep the preflight function under the fallow
// cognitive threshold (was 22 / threshold 15 in PR #67).
function buildNoContentResult(root, ops, i, op, existing) {
  const result = {
    applied: 0,
    failed_at: i,
    reason: "no_content",
    op,
    id: op.id,
    entry_kind: existing.entry_kind,
    hint: buildNoContentHint(existing.entry_kind),
  };
  appendGateLog(root, {
    timestamp: new Date().toISOString(),
    tool: "meta_state_batch",
    op_count: ops.length,
    applied: 0,
    failed_at: i,
    reason: "no_content",
  });
  return result;
}

// Build the invalid_field rejection result + gate-log entry. Pulled out
// alongside buildNoContentResult for the same fallow-cognitive reason.
function buildInvalidFieldResult(root, ops, i, op, existing, error) {
  const result = {
    applied: 0,
    failed_at: i,
    reason: "invalid_field",
    op,
    id: op.id,
    entry_kind: existing.entry_kind,
    field_errors: error.issues.map(formatFieldIssue),
  };
  appendGateLog(root, {
    timestamp: new Date().toISOString(),
    tool: "meta_state_batch",
    op_count: ops.length,
    applied: 0,
    failed_at: i,
    reason: "invalid_field",
  });
  return result;
}

// Pulled out of the previous inline map callback to flatten cognitive
// complexity (Array.isArray && ternary) out of the handler scope.
function formatFieldIssue(issue) {
  return {
    field: Array.isArray(issue.path) && issue.path.length > 0 ? issue.path.join(".") : "(root)",
    message: issue.message,
  };
}

// Plan 260717-1145 Phase 3: schema-derived no_content hint for batch update
// ops. Mirrors Phase 4's per-kind hint on the patch tool — same source
// (buildPatchSchemaFor's shape via listMutableFieldsCsv), different delivery
// surface (batch op vs patch tool call). The hint names the kind's mutable
// content fields and notes the inline placement (no nested patch:{} on the op).
function buildNoContentHint(kind) {
  const fieldList = listMutableFieldsCsv(kind, "see the patch schema for the full field list");
  return `update op must contain at least one mutable field for entry_kind=${kind} (content goes inline on the op, not in a nested patch:{}). Mutable fields: ${fieldList}. For status/consolidated_into use meta_state_supersede; for resolved use meta_state_resolve; for schema/rule/tool/policy/surface changes use meta_state_log_change.`;
}
