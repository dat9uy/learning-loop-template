import { z } from "zod";
import { readRegistry, updateEntry } from "#mcp/core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const metaStateMigrateExpiredToStaleTool = {
  name: "meta_state_migrate_expired_to_stale",
  description:
    "Migrate a single `expired` finding to the new `stale` lifecycle (one-way). " +
    "The 24h TTL no longer applies (expires_at is cleared); the entry is now re-verifiable " +
    "via meta_state_re_verify and closeable via meta_state_resolve. " +
    "Preconditions: entry exists, entry_kind === 'finding', status === 'expired', " +
    "expires_at is non-null AND past. " +
    "This is a state-machine transition, not a resolve — it bypasses the `resolution-evidence-required` " +
    "consult-gate by design (the gate is for closing findings, not for migrating lifecycle). " +
    "Use when an operator wants to bring a legacy `expired` finding into the new lifecycle. " +
    "Not for fresh reports (use meta_state_report), active findings (use meta_state_re_verify), " +
    "or terminal closes (use meta_state_resolve).",
  schema: {
    id: z.string().describe("Exact id of the `expired` finding to migrate."),
  },
  handler: async ({ id }) => {
    const root = resolveRoot();
    const entries = readRegistry(root);
    const entry = entries.find((e) => e.id === id);

    if (!entry) {
      const result = { migrated: false, reason: "not_found", id };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_migrate_expired_to_stale", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    if (entry.entry_kind !== "finding") {
      const result = { migrated: false, reason: "wrong_kind", id, entry_kind: entry.entry_kind };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_migrate_expired_to_stale", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    if (entry.status !== "expired") {
      const result = { migrated: false, reason: "wrong_status", id, current_status: entry.status };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_migrate_expired_to_stale", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    if (!entry.expires_at || Date.now() <= new Date(entry.expires_at).getTime()) {
      const result = { migrated: false, reason: "not_past_ttl", id, expires_at: entry.expires_at };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_migrate_expired_to_stale", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    const now = new Date().toISOString();
    // updateEntry auto-increments version; do NOT include version in the patch.
    const patch = {
      status: "stale",
      expires_at: null,
      last_verified_at: now,
    };
    await updateEntry(root, id, patch);

    const result = {
      migrated: true,
      id,
      status: "stale",
      expires_at: null,
      last_verified_at: now,
    };
    appendGateLog(root, { timestamp: now, tool: "meta_state_migrate_expired_to_stale", ...result });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};
