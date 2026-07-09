import { deepStripEnvelope } from "../../core/envelope-stripper.js";
import { z } from "zod";
import { resolveRoot } from "#lib/resolve-root.js";
import { metaStateBatch } from "../../core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";

const BATCH_SIZE_LIMIT = Number(process.env.META_STATE_BATCH_LIMIT) || 500;

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
  },
  handler: async ({ operations }) => {
    const root = resolveRoot();
    // Defense-in-depth: the Zod schema above strips envelopes on the MCP wire
    // path, but direct handler callers (tests, agent bypasses) skip Zod, so
    // unwrap any {item: [...]} coercion here too. Idempotent on uncoerced input.
    const unwrapped = deepStripEnvelope(operations);
    const result = await metaStateBatch(root, unwrapped);
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
