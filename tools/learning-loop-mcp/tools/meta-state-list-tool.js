import { z } from "zod";
import {
  readRegistry,
  checkExpiry,
  filterEntries,
  updateEntry,
} from "#mcp/core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

const TERMINAL_STATUSES = new Set(["auto-resolved", "expired", "resolved"]);

export const metaStateListTool = {
  name: "meta_state_list",
  description: "List meta-state registry entries. By default excludes terminal statuses (auto-resolved, expired, resolved). Runs auto-resolve and expiry checks before returning.",
  schema: {
    category: z.string().optional().describe("Filter by category"),
    status: z.string().optional().describe("Filter by status"),
    affected_system: z.string().optional().describe("Filter by affected system"),
    include_expired: z.boolean().optional().default(false).describe("Include terminal statuses in results"),
    entry_kind: z.enum(["finding", "change-log"]).optional()
      .describe("Filter by entry kind; default = both"),
  },
  handler: async ({ category, status, affected_system, include_expired, entry_kind }) => {
    const root = resolveRoot();
    const entries = readRegistry(root);
    const now = new Date().toISOString();
    const updated = [];

    for (const entry of entries) {
      let newStatus = null;
      const expired = checkExpiry(entry);

      if (expired) {
        newStatus = expired;
      }

      if (newStatus && newStatus !== entry.status) {
        await updateEntry(root, entry.id, { status: newStatus, resolved_at: now, resolved_by: "auto-resolve" });
        entry.status = newStatus;
        entry.resolved_at = now;
        entry.resolved_by = "auto-resolve";
      }
      updated.push(entry);
    }

    const activeFilters = {
      ...(category && { category }),
      ...(status && { status }),
      ...(affected_system && { affected_system }),
      ...(entry_kind && { entry_kind }),
    };

    let result = filterEntries(updated, activeFilters);

    if (!include_expired) {
      result = result.filter((e) => !TERMINAL_STATUSES.has(e.status));
    }

    appendGateLog(root, {
      timestamp: now,
      tool: "meta_state_list",
      count: result.length,
      filters_applied: activeFilters,
      include_expired,
    });

    const output = {
      entries: result,
      count: result.length,
      filters_applied: activeFilters,
      include_expired: include_expired || false,
      entry_kind_filter: entry_kind || null,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
    };
  },
};
