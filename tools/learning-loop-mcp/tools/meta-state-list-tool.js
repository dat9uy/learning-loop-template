import { z } from "zod";
import {
  readRegistry,
  checkExpiry,
  filterEntries,
  updateEntry,
} from "#mcp/core/meta-state.js";
import { buildInverseIndexes, summarize } from "#mcp/core/loop-introspect.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

// The legacy 'expired' status was removed in plan 260611-1000. This set
// mirrors the canonical TERMINAL_STATUSES in core/meta-state.js.
const TERMINAL_STATUSES = new Set(["auto-resolved", "resolved", "superseded"]);

const REF_FIELDS = [
  "consolidated_into",
  "supersedes",
  "addresses",
  "proposed_design_for",
  "origin",
  "reopens",
];

// Inverse-map-backed fields are O(1) via buildInverseIndexes.
// Scan-backed fields (consolidated_into, proposed_design_for) iterate
// entries and tolerate the wire-format wrap {item: [...]} that
// meta_state_patch can produce on top-level arrays under passthrough
// ZodObject fields.
const INVERSE_BACKED_REF_FIELDS = new Set([
  "supersedes",
  "addresses",
  "origin",
  "reopens",
]);

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
  description: "List meta-state registry entries. By default excludes terminal statuses (auto-resolved, resolved, superseded). Runs auto-resolve and expiry checks before returning. Use when you need to inspect, filter, or audit the registry. Pass `compact: true` for a token-efficient view (4KB vs 85KB for 53 entries). The narrow-query filters `id` (string|string[]), `session_id`, and `ref_by`+`ref_field` are the preferred way to fetch a specific entry or its 1-hop neighborhood without dumping the full registry. Not for mutating entries (use `meta_state_patch` or `meta_state_log_change` instead). The legacy `include_expired` parameter was removed in plan 260611-1000-remove-expired-status phase 3; terminal statuses are always excluded by default.",
  schema: {
    category: z.string().optional().describe("Filter by category"),
    status: z.string().optional().describe("Filter by status"),
    affected_system: z.string().optional().describe("Filter by affected system"),
    session_id: z.string().optional().describe("Filter by session_id (idempotency key for hook-emitted findings)"),
    entry_kind: z.enum(["finding", "change-log", "rule", "loop-design"]).optional()
      .describe("Filter by a single entry kind; default = both (legacy)"),
    entry_kinds: z.array(z.enum(["finding", "change-log", "rule", "loop-design"])).optional()
      .describe("Filter by multiple entry kinds (takes precedence over entry_kind if both set)"),
    id: z.union([z.string(), z.array(z.string())]).optional()
      .describe("Filter by id (string or string[]). Missing ids are silently skipped. Pairs with `ref_by`/`ref_field` for the narrow query path."),
    ref_by: z.string().optional()
      .describe("Filter entries that reference this id in `ref_field`. Required with `ref_field`."),
    ref_field: z.enum(REF_FIELDS).optional()
      .describe("Field used by the `ref_by` filter. Required with `ref_by`."),
    compact: z.boolean().optional().default(false).describe("Return only id, entry_kind, status, and ref fields (~4KB for 53 entries vs ~85KB full)"),
    include_archived: z.boolean().optional().default(false).describe("Include archived entries in results (default false)"),
  },
  handler: async ({ category, status, affected_system, session_id, entry_kind, entry_kinds, id, ref_by, ref_field, compact, include_archived }) => {
    const root = resolveRoot();
    const entries = readRegistry(root);
    const now = new Date().toISOString();
    const updated = [];

    // Validate ref_by/ref_field pair
    if ((ref_by && !ref_field) || (!ref_by && ref_field)) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "ref_pair_required",
          message: "ref_by and ref_field must be set together",
        }) }],
      };
    }

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

    let result = updated;

    // Filter pipeline order: ref_by/ref_field first (most selective),
    // then id (set membership), then existing filters.

    // Step 1: ref_by/ref_field filter
    if (ref_by && ref_field) {
      let matchingIds = new Set();

      if (INVERSE_BACKED_REF_FIELDS.has(ref_field)) {
        const inverse = buildInverseIndexes(updated);
        const inverseMap = {
          supersedes: inverse.supersedes_inverse,
          addresses: inverse.addresses_inverse,
          origin: inverse.origin_inverse,
          reopens: inverse.reopens_inverse,
        }[ref_field];
        const refs = inverseMap.get(ref_by) || [];
        matchingIds = new Set(refs);
      } else if (ref_field === "consolidated_into") {
        // Scan: pick change-logs where consolidates === ref_by
        for (const e of updated) {
          if (e.entry_kind === "change-log" && e.consolidates === ref_by) {
            matchingIds.add(e.id);
          }
        }
      } else if (ref_field === "proposed_design_for") {
        // Scan: pick loop-designs where proposed_design_for includes ref_by.
        // Tolerate the wire-format wrap {item: [...]}.
        for (const e of updated) {
          if (e.entry_kind === "loop-design") {
            const refs = e.proposed_design_for;
            if (Array.isArray(refs) && refs.includes(ref_by)) {
              matchingIds.add(e.id);
            }
          }
        }
      }

      result = result.filter((e) => matchingIds.has(e.id));
    }

    // Step 2: id filter
    if (id !== undefined) {
      const idSet = new Set(Array.isArray(id) ? id : [id]);
      result = result.filter((e) => idSet.has(e.id));
    }

    // Step 3: existing filters
    const activeFilters = {
      ...(category && { category }),
      ...(status && { status }),
      ...(affected_system && { affected_system }),
      ...(session_id && { session_id }),
      ...(entry_kind && !entry_kinds && { entry_kind }),
      ...(id !== undefined && { id: Array.isArray(id) ? id : [id] }),
      ...(ref_by && { ref_by }),
      ...(ref_field && { ref_field }),
    };

    if (entry_kinds) {
      result = result.filter((e) => entry_kinds.includes(e.entry_kind));
    } else {
      result = filterEntries(result, activeFilters);
    }

    // Plan 260611-1000: terminal statuses are excluded by default. If the
    // caller explicitly filters by a terminal status (e.g., status="resolved"),
    // honor that filter — the user is opting in to terminal entries.
    const isExplicitStatusFilter = typeof status === "string" && TERMINAL_STATUSES.has(status);
    if (!isExplicitStatusFilter) {
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
    });

    const output = {
      entries: compact ? result.map(toCompact) : result,
      count: result.length,
      filters_applied: activeFilters,
      include_archived: include_archived || false,
      entry_kind_filter: entry_kind || null,
      entry_kinds_filter: entry_kinds || null,
      id_filter: id !== undefined ? (Array.isArray(id) ? id : [id]) : null,
      ref_by_filter: ref_by || null,
      ref_field_filter: ref_field || null,
      compact: compact || false,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
    };
  },
};
