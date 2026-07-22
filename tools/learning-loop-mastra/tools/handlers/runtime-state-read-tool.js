import { z } from "zod";
import { resolveRoot } from "#lib/resolve-root.js";
import { readRuntimeStateRowsLatest, verifyRow, AFFECTED_SYSTEM_ENUM_RUNTIME } from "../../core/runtime-state.js";

// Compact projection drops `metadata` only. `fingerprint` is a SHA-256 row-integrity
// hash returned by the record tool, not a metadata blob — it is retained in compact
// mode so callers can verify row integrity by default. `fingerprint_valid` is the
// v2 verifyRow result: true means the stored fingerprint matches a recomputation
// over the row's fields (the row is intact); false means the row has been
// mutated post-write or the sidecar was not yet migrated to v2.
function toCompactRow(row) {
  const { metadata: _metadata, ...rest } = row;
  return rest;
}

export const runtimeStateReadTool = {
  name: "runtime_state_read",
  description: "Read runtime-state rows with filters and fingerprint flags.",
  schema: {
    affected_system: z.enum(AFFECTED_SYSTEM_ENUM_RUNTIME).optional()
      .describe("Affected system filter"),
    kind: z.enum(["ledger-event", "budget-state"]).optional()
      .describe("Row kind filter"),
    since: z.string().datetime().optional()
      .describe("Timestamp lower bound"),
    until: z.string().datetime().optional()
      .describe("Timestamp upper bound"),
    limit: z.coerce.number().int().min(1).max(1000).default(20)
      .describe("Maximum rows (default 20; max 1000)"),
    compact: z.coerce.boolean().optional().default(true)
      .describe("Drop metadata but retain fingerprint (default true)"),
  },
  handler: async ({ affected_system, kind, since, until, limit = 20, compact = true }) => {
    const root = resolveRoot();
    // Dedup to one row per id (max_by(version), newest timestamp, last-in-file).
    // `readRuntimeStateRows` (raw) stays the shared reader for history + the
    // inbound gate, which never wants the deduped view.
    const rows = readRuntimeStateRowsLatest(root);

    let result = rows;

    if (affected_system) {
      result = result.filter((r) => r.affected_system === affected_system);
    }
    if (kind) {
      result = result.filter((r) => r.kind === kind);
    }
    if (since) {
      const sinceMs = new Date(since).getTime();
      result = result.filter((r) => new Date(r.timestamp).getTime() >= sinceMs);
    }
    if (until) {
      const untilMs = new Date(until).getTime();
      result = result.filter((r) => new Date(r.timestamp).getTime() <= untilMs);
    }

    // total reports the filtered count BEFORE the limit slice, so callers can
    // detect truncation via `total > count`. count alone is misleading because
    // it reads from the post-slice array.
    const total = result.length;
    result = result.slice(0, limit);
    // Every returned row carries `fingerprint_valid` so callers can detect
    // tampering or pre-v2-migration state without a separate verify call.
    // `verifyRow` runs against the FULL row (before the compact projection
    // drops `metadata`); otherwise compact mode would always verify false
    // because `verifyRow` hashes canonicalized metadata.
    const rows_out = result.map((r) => ({
      ...(compact ? toCompactRow(r) : r),
      fingerprint_valid: verifyRow(r),
    }));

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ total, count: result.length, rows: rows_out }),
      }],
    };
  },
};
