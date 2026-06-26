import { z } from "zod";
import {
  readRegistry,
  updateEntry,
} from "../../core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const metaStateAckTool = {
  name: "meta_state_ack",
  description:
    "Acknowledge a reported or stale meta-state entry, promoting it to active. For reported entries this removes the 24h TTL. For stale entries this re-pins acked_at so future checkStaleness sweeps use the new reference instead of created_at.",
  schema: {
    id: z.string().describe("Exact entry id to ack"),
    reason: z.string().optional().describe("Operator note"),
  },
  handler: async ({ id, reason }) => {
    const root = resolveRoot();
    const entries = readRegistry(root);
    const entry = entries.find((e) => e.id === id);

    if (!entry) {
      const result = { acked: false, reason: "not_found", id };
      appendGateLog(root, {
        timestamp: new Date().toISOString(),
        tool: "meta_state_ack",
        ...result,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }

    // Allow ack from reported (TTL window) or stale (past staleness window).
    // Both transitions set acked_at so future checkStaleness sweeps use it
    // as the staleness reference instead of created_at.
    if (entry.status !== "reported" && entry.status !== "stale") {
      const result = {
        acked: false,
        reason: "already_active_or_terminal",
        id,
        current_status: entry.status,
      };
      appendGateLog(root, {
        timestamp: new Date().toISOString(),
        tool: "meta_state_ack",
        ...result,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }

    const now = new Date().toISOString();
    await updateEntry(root, id, { status: "active", acked_at: now, expires_at: null });

    const result = {
      acked: true,
      id,
      status: "active",
      from_status: entry.status,
      ...(reason && { reason }),
    };

    appendGateLog(root, {
      timestamp: now,
      tool: "meta_state_ack",
      ...result,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};
