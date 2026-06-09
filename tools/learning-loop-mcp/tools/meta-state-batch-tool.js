import { z } from "zod";
import { resolveRoot } from "#lib/resolve-root.js";
import { metaStateBatch } from "#mcp/core/meta-state.js";
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
    operations: z.array(opSchema).min(1).max(BATCH_SIZE_LIMIT).describe(`Array of operations to apply (1-${BATCH_SIZE_LIMIT} ops; default limit 500, overridable via META_STATE_BATCH_LIMIT)`),
  },
  handler: async ({ operations }) => {
    const root = resolveRoot();
    const result = await metaStateBatch(root, operations);
    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "meta_state_batch",
      op_count: operations.length,
      applied: result.applied,
      failed_at: result.failed_at,
      reason: result.reason ?? null,
    });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};
