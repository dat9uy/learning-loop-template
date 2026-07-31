import { z } from "zod";
import { stripEnvelope } from "../../core/envelope-stripper.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { restoreEntry } from "../../core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";

export const metaStateUnarchiveTool = {
  name: "meta_state_unarchive",
  description: "Restore an archived entry by true-appending a new line that supersedes the archive tombstone. Restores the pre-archive status + content. Rejects already-active entries (not_archived), change-logs (not_archived), and delete-tombstones (delete_not_restorable).",
  schema: {
    id: z.preprocess(stripEnvelope, z.string()).describe("Entry id to restore."),
    reason: z.string().optional().describe("Restore reason (audit-only)."),
  },
  handler: async ({ id, reason }) => {
    const root = resolveRoot();
    const result = await restoreEntry(root, id, reason ?? "operator restore");
    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "meta_state_unarchive",
      id,
      restored: result.restored,
      reason: result.reason,
      restored_status: result.restored_status,
      restored_at: result.restored_at,
      version: result.version,
    });
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result),
      }],
    };
  },
};
