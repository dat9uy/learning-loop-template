import { deepStripEnvelope } from "../../core/envelope-stripper.js";
import { z } from "zod";
import { resolveRoot } from "#lib/resolve-root.js";
import { metaStateBatch } from "../../core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
// Plan 260712-0300 Phase 2: single source of truth for BATCH_SIZE_LIMIT.
// Both the handler and the core (meta-state.js) import from core/constants.js
// so the 500-op cap is enforced uniformly — closes the 100-vs-500 reject window.
import { BATCH_SIZE_LIMIT } from "../../core/constants.js";
// Plan 260712-0300 Phase 2: import kind enum for the new optional `envelope`
// field parallel to `operations` on the batch request shape.
import { OPERATION_ENVELOPE_KINDS } from "../../core/operation-envelope.js";

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
