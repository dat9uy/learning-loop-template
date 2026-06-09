import { z } from "zod";
import {
  readRegistry,
  checkExpiry,
  filterEntries,
  updateEntry,
} from "#mcp/core/meta-state.js";
import { summarize } from "#mcp/core/loop-introspect.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

const TERMINAL_STATUSES = new Set(["auto-resolved", "expired", "resolved"]);

/**
 * Compact projection: same field whitelist as `summarize` in
 * core/loop-introspect.js, minus `description_preview`.
 *
 * Why share with `summarize` (not maintain a parallel 8-field list):
 * the gap-resolution work relies on both `meta_state_list({ compact: true })`
 * and `loop_describe({ tier: 'cold', description_mode: 'summary' })` returning
 * consistent shapes for the same entry id. The two callers (list API and
 * cold-tier summary) have different token-cost targets — `toCompact` saves
 * by stripping `description_preview` (200 chars × N entries); `summarize`
 * keeps the preview for cold-tier relationship-scan context. Field set
 * is identical otherwise.
 */
function toCompact(entry) {
  const { description_preview, ...rest } = summarize(entry);
  return rest;
}

export const metaStateListTool = {
  name: "meta_state_list",
  description: "List meta-state registry entries. By default excludes terminal statuses (auto-resolved, expired, resolved). Runs auto-resolve and expiry checks before returning.",
  schema: {
    category: z.string().optional().describe("Filter by category"),
    status: z.string().optional().describe("Filter by status"),
    affected_system: z.string().optional().describe("Filter by affected system"),
    session_id: z.string().optional().describe("Filter by session_id (idempotency key for hook-emitted findings)"),
    include_expired: z.boolean().optional().default(false).describe("Include terminal statuses in results"),
    entry_kind: z.enum(["finding", "change-log", "rule", "loop-design"]).optional()
      .describe("Filter by a single entry kind; default = both (legacy)"),
    entry_kinds: z.array(z.enum(["finding", "change-log", "rule", "loop-design"])).optional()
      .describe("Filter by multiple entry kinds (takes precedence over entry_kind if both set)"),
    compact: z.boolean().optional().default(false).describe("Return only id, entry_kind, status, and ref fields (~4KB for 53 entries vs ~85KB full)"),
    include_archived: z.boolean().optional().default(false).describe("Include archived entries in results (default false)"),
  },
  handler: async ({ category, status, affected_system, session_id, include_expired, entry_kind, entry_kinds, compact, include_archived }) => {
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
        await updateEntry(root, entry.id, { status: newStatus });
        entry.status = newStatus;
      }
      updated.push(entry);
    }

    const activeFilters = {
      ...(category && { category }),
      ...(status && { status }),
      ...(affected_system && { affected_system }),
      ...(session_id && { session_id }),
      ...(entry_kind && !entry_kinds && { entry_kind }),
    };

    let result;
    if (entry_kinds) {
      result = updated.filter((e) => entry_kinds.includes(e.entry_kind));
    } else {
      result = filterEntries(updated, activeFilters);
    }

    if (!include_expired) {
      result = result.filter((e) => !TERMINAL_STATUSES.has(e.status));
    }
    if (!include_archived) {
      result = result.filter((e) => e.status !== "archived");
    }

    appendGateLog(root, {
      timestamp: now,
      tool: "meta_state_list",
      count: result.length,
      filters_applied: activeFilters,
      include_expired,
    });

    const output = {
      entries: compact ? result.map(toCompact) : result,
      count: result.length,
      filters_applied: activeFilters,
      include_expired: include_expired || false,
      include_archived: include_archived || false,
      entry_kind_filter: entry_kind || null,
      entry_kinds_filter: entry_kinds || null,
      compact: compact || false,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
    };
  },
};
