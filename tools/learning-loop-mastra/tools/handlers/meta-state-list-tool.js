import { z } from "zod";
import { stripEnvelope } from "../../core/envelope-stripper.js";
import {
  readRegistry,
  readRegistryAllVersions,
  filterEntries,
} from "../../core/meta-state.js";
import { buildInverseIndexes, summarize } from "../../core/loop-introspect.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

// Set of statuses excluded by default from `meta_state_list` results.
// `superseded` is kept here for backward compatibility with un-migrated or
// historical on-disk findings: the canonical writeable enum no longer accepts
// `superseded` (it collapses to `resolved` + a citation), but entries already
// on disk may still carry it, and `isOpen` already treats it as terminal — so
// the default view must exclude it too, or a closed finding would surface in
// the open-views list. `archived` is excluded upstream by the
// entry_kind/status filter pair, not here.
const EXCLUDABLE_STATUSES = new Set(["resolved", "superseded", "accepted"]);

const REF_FIELDS = [
  // `consolidated_into` / `origin` / `supersedes` /
  // `promoted_to_rule` were collapsed into citation rows. The new wire
  // shape is `ref_field:"citation"`, which sources from
  // `citations_inverse` (the citation-backed inverse map).
  "citation",
  "addresses",
  "proposed_design_for",
  "reopens",
];

// Inverse-map-backed fields are O(1) via buildInverseIndexes.
// Scan-backed fields (proposed_design_for) iterate entries and tolerate
// the wire-format wrap {item: [...]} that meta_state_patch can produce on
// top-level arrays under passthrough ZodObject fields. `citation` is
// inverse-backed via `citations_inverse`.
const INVERSE_BACKED_REF_FIELDS = new Set([
  "addresses",
  "reopens",
  "citation",
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
  description: "Read the meta-state registry. Defaults to a compact projection excluding resolved/accepted entries; use id/session_id/ref_by+ref_field for narrow queries and include_all_versions:true for history. Read-only. An id-filtered query whose ids exist but are excluded by the default terminal-status/archived filter emits an `excluded_ids` notice (pass include_archived:true to include them).",
  schema: {
    category: z.string().optional().describe("Filter by category"),
    status: z.string().optional().describe("Filter by status"),
    affected_system: z.string().optional().describe("Filter by affected system"),
    session_id: z.string().optional().describe("Filter by session_id (idempotency key for hook-emitted findings)"),
    entry_kind: z.enum(["finding", "change-log", "rule", "loop-design"]).optional()
      .describe("Filter by a single entry kind; default = both (legacy)"),
    entry_kinds: z.preprocess(stripEnvelope, z.array(z.enum(["finding", "change-log", "rule", "loop-design"]))).optional()
      .describe("Filter by multiple entry kinds (takes precedence over entry_kind if both set)"),
    id: z.preprocess(stripEnvelope, z.union([z.string(), z.array(z.string())])).optional()
      .describe("Filter by id (string or string[]). Exact-match only; ids are full slugs, not prefixes. Missing ids are silently skipped, but a queried id that is a unique non-empty prefix of exactly one registry id surfaces an `id_prefix_hints` entry naming the full id. A queried id that EXISTS but is excluded by the default terminal-status/archived filter surfaces an `excluded_ids` notice (with its projected status) — pass `include_archived: true` to include it. Pairs with `ref_by`/`ref_field` for the narrow query path."),
    ref_by: z.string().optional()
      .describe("Filter entries that reference this id in `ref_field`. Required with `ref_field`."),
    ref_field: z.enum(REF_FIELDS).optional()
      .describe("Field used by the `ref_by` filter. Required with `ref_by`."),
    compact: z.coerce.boolean().optional().default(true).describe("Default: true — return only id, entry_kind, status, and ref fields (token-efficient). Pass `compact: false` for the full entry shape (~85KB for 53 entries)."),
    include_archived: z.coerce.boolean().optional().default(false).describe("Include archived entries in results (default false)"),
    include_all_versions: z.coerce.boolean().optional().default(false).describe("Default: false — the read collapses to one entry per id (max_by(version)). Pass true to return every version line per id (the v0 open + v1 resolved + … sequence on disk), sorted by (id, version). Orthogonal to include_archived (status filter) and compact (projection shape); the three compose. Under ref_by/ref_field, a matching id appears once per version line."),
  },
  handler: async ({ category, status, affected_system, session_id, entry_kind, entry_kinds, id, ref_by, ref_field, compact = true, include_archived, include_all_versions }) => {
    const root = resolveRoot();
    const entries = include_all_versions ? readRegistryAllVersions(root) : readRegistry(root);
    const now = new Date().toISOString();

    // Validate ref_by/ref_field pair
    if ((ref_by && !ref_field) || (!ref_by && ref_field)) {
      return {
        content: [{ type: "text", text: JSON.stringify({
          error: "ref_pair_required",
          message: "ref_by and ref_field must be set together",
        }) }],
      };
    }

    // Read-only: meta_state_list does not write status. The legacy
    // `checkExpiry`→`updateEntry` side effect flipped past-TTL entries to
    // `stale` and `updateEntry`'s compaction deleted terminal entries older
    // than 7 days, so every list call mutated the live registry — including
    // re-staling terminal (archived/resolved) entries once the `reported`-only
    // guard was lifted. That contradicts the collapsed status model, where
    // `stale` is a derived evidence-freshness view (see `core/stale-view.js`),
    // not a writable status. The past-TTL signal stays available via
    // `isStaleView` for callers that want it. (`checkExpiry` was deleted.)
    let result = entries;

    // Filter pipeline order: ref_by/ref_field first (most selective),
    // then id (set membership), then existing filters.

    // Step 1: ref_by/ref_field filter
    if (ref_by && ref_field) {
      let matchingIds = new Set();

      if (INVERSE_BACKED_REF_FIELDS.has(ref_field)) {
        const inverse = buildInverseIndexes(entries);
        const inverseMap = {
          addresses: inverse.addresses_inverse,
          reopens: inverse.reopens_inverse,
          citation: inverse.citations_inverse,
        }[ref_field];
        const refs = inverseMap.get(ref_by) || [];
        matchingIds = new Set(refs);
      } else if (ref_field === "proposed_design_for") {
        // Scan: pick loop-designs where proposed_design_for includes ref_by.
        // Tolerate the wire-format wrap {item: [...]}.
        for (const e of entries) {
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
      ...(include_all_versions && { include_all_versions: true }),
    };

    if (entry_kinds) {
      result = result.filter((e) => entry_kinds.includes(e.entry_kind));
    } else {
      result = filterEntries(result, activeFilters);
    }

    // Snapshot the id-filtered match set AFTER the non-status filters
    // (category/status/session/affected_system/entry_kind/ref) and BEFORE the
    // terminal-status exclusion below, so an id that exists but gets dropped
    // ONLY by the default terminal/archived exclusion can be reported as
    // `excluded_ids` instead of silently returning count 0. This is the "say
    // so in output (N rows excluded; pass include_archived)" half of finding
    // meta-260801T2348Z. For id-filtered queries the caller explicitly named
    // these ids; an empty array with no notice is indistinguishable from "id
    // does not exist", which pushed agents to grep meta-state.jsonl raw (the
    // loop-anti-pattern the finding records).
    //
    // Snapshotting here (not before Step 3) is deliberate: an id dropped by an
    // explicit status/category/entry_kind filter is NOT an exclusion the
    // `include_archived` retry can recover — surfacing it as `excluded_ids`
    // would be a false positive with a dead-end retry hint. Only ids that
    // survived the caller's own filters and were then dropped by the DEFAULT
    // terminal/archived view are genuine exclusions.
    const preExclusionIds =
      id !== undefined
        ? Array.from(new Set(result.map((e) => e.id)))
        : null;
    // Projected (max-by-version) status per id from the SAME set Step 4 will
    // exclude over (`result` after Step 3), with the identical tie-break (later
    // created_at wins on equal version). The notice must report the status the
    // exclusion actually dropped — projecting from the full `entries` instead
    // would disagree when Step 3 filters drop the terminal line of a
    // mixed-version id (minor false positive/negative divergence).
    const preExclusionProjected =
      id !== undefined
        ? (() => {
            const projected = new Map();
            for (const e of result) {
              if (typeof e.id !== "string") continue;
              const prev = projected.get(e.id);
              if (!prev || (e.version ?? 0) > (prev.version ?? 0)) {
                projected.set(e.id, e);
              } else if ((e.version ?? 0) === (prev.version ?? 0)) {
                const prevT = prev.created_at ?? "";
                const nextT = e.created_at ?? "";
                if (nextT > prevT) projected.set(e.id, e);
              }
            }
            return projected;
          })()
        : null;

    // Terminal statuses are excluded by default. If the caller explicitly
    // filters by a terminal status (e.g., status="resolved"), honor that
    // filter — the user is opting in to terminal entries.
    // include_archived: true is the unified "show me the audit trail" affordance;
    // it surfaces all 4 terminal statuses (resolved, accepted, auto-resolved,
    // archived) without requiring callers to know which statuses are terminal.
    // (`superseded` collapsed into `resolved` + a citation.)
    //
    // Exclusion is an id-level property, not a per-line one: "is this id
    // open?" is answered by the id's projected (max-by-version) status. Under
    // `include_all_versions`, an id with history v0:open → v1:resolved has a
    // projected status of `resolved` (terminal). Filtering per line would
    // drop the v1:resolved line but leave the v0:open line, leaking a phantom
    // open status for a resolved id — an agent auditing history would see a
    // resolved finding as still open and could double-resolve or mis-derive
    // drift. So under `include_all_versions` we collapse exclusion at the id
    // level: if the id's max-version line is terminal (or archived), drop ALL
    // lines for that id under the default view, matching the collapsed view.
    // Callers opt into the full audit trail with `include_archived: true`.
    // The projected (default) path has one line per id, so per-line and
    // id-level exclusion coincide there; the per-line filter stays as the
    // cheap fallback for that path.
    // An explicit `status:"archived"` filter is a caller opt-in to archived
    // entries, exactly like `status:"resolved"` is for terminal ones. `archived`
    // is not a member of EXCLUDABLE_STATUSES (it's excluded via the separate
    // per-line `!include_archived` filter), so without this the caller who
    // explicitly queried archived would get the "you haven't opted in to
    // archived" notice — a false positive. Treating it as an explicit terminal
    // opt-in suppresses the notice and matches the caller's stated intent.
    const isExplicitStatusFilter =
      typeof status === "string" && (EXCLUDABLE_STATUSES.has(status) || status === "archived");
    const includeTerminal = include_archived || isExplicitStatusFilter;
    if (!includeTerminal && include_all_versions) {
      // Project max-by-version status per id from the loaded all-versions
      // entries (same tie-break as the projection: later created_at wins on
      // equal version). Drop every line of an id whose projected status is
      // terminal. Archived is also id-level here: a tombstoned id's earlier
      // open lines must not surface under the default view.
      const projectedStatus = new Map();
      for (const e of result) {
        const prev = projectedStatus.get(e.id);
        if (!prev) {
          projectedStatus.set(e.id, e);
          continue;
        }
        const prevV = prev.version ?? 0;
        const nextV = e.version ?? 0;
        if (nextV > prevV) {
          projectedStatus.set(e.id, e);
        } else if (nextV === prevV) {
          const prevT = prev.created_at ?? "";
          const nextT = e.created_at ?? "";
          if (nextT > prevT) projectedStatus.set(e.id, e);
        }
      }
      const excludedIds = new Set();
      for (const [eid, e] of projectedStatus) {
        if (EXCLUDABLE_STATUSES.has(e.status) || e.status === "archived") {
          excludedIds.add(eid);
        }
      }
      result = result.filter((e) => !excludedIds.has(e.id));
    } else if (!includeTerminal) {
      result = result.filter((e) => !EXCLUDABLE_STATUSES.has(e.status));
      if (!include_archived) {
        result = result.filter((e) => e.status !== "archived");
      }
    } else if (!include_archived) {
      result = result.filter((e) => e.status !== "archived");
    }

    appendGateLog(root, {
      timestamp: now,
      tool: "meta_state_list",
      count: result.length,
      filters_applied: activeFilters,
    });

    // Excluded-id notice (finding meta-260801T2348Z). When an id-filtered
    // query drops a queried id purely because of the DEFAULT terminal-status /
    // archived exclusion (the caller did NOT opt into terminal entries), the
    // caller named that id explicitly — an empty result must say so, not read
    // as "id does not exist". Emit one row per dropped queried id carrying its
    // projected (max-by-version) status + entry_kind + the exact retry incantation.
    //
    // Fires ONLY when terminal entries were excluded (includeTerminal false),
    // so a caller who passed include_archived:true or an explicit terminal
    // status filter gets no noise. Queried ids that don't exist at all stay
    // silent here (the id_prefix_hints did-you-mean path owns that case).
    let excludedIdsNotice;
    if (id !== undefined && preExclusionIds !== null && preExclusionProjected !== null) {
      const projectedStatusOf = (eid) => preExclusionProjected.get(eid)?.status ?? null;
      const projectedKindOf = (eid) => preExclusionProjected.get(eid)?.entry_kind ?? null;
      const excluded = preExclusionIds.filter((eid) => {
        const status = projectedStatusOf(eid);
        const isTerminal = EXCLUDABLE_STATUSES.has(status) || status === "archived";
        // Per-line exclusion can drop a line whose status is terminal even when
        // the id-level projected status is not; the pre-exclusion id set is the
        // id-filtered match set BEFORE Step 4, so an id whose EVERY matching
        // line was dropped is excluded.
        const droppedByPerLine = !result.some((e) => e.id === eid);
        return isTerminal && droppedByPerLine;
      });
      if (excluded.length > 0 && !includeTerminal) {
        excludedIdsNotice = excluded.map((eid) => ({
          id: eid,
          entry_kind: projectedKindOf(eid),
          status: projectedStatusOf(eid),
          note: "id exists but its projected status is terminal/archived; the default view excludes it. Pass include_archived:true (or an explicit status filter) to include it.",
        }));
      }
    }

    // Did-you-mean: when an id query misses, surface a unique proper-prefix
    // match so the agent retries once with the full slug instead of guessing
    // (or re-querying with include_archived, etc.). Exact-match semantics are
    // unchanged — this only adds an advisory field to the empty/miss envelope.
    //
    // Fires per queried id that does NOT exact-match any registry id, when it
    // is a non-empty proper prefix of EXACTLY ONE registry id. Ambiguous
    // (2+) and zero-prefix matches stay silent so the hint can never mislead.
    // `suggested_status` is included so the agent can fold include_archived /
    // status into the same retry when the match is terminal — saves a second
    // round-trip. Built from the full collapsed registry (one row per id,
    // max_by(version)) so include_all_versions does not double-count an id
    // and suppress the hint.
    let idPrefixHints;
    if (id !== undefined) {
      const queriedIds = Array.isArray(id) ? id : [id];
      const canonical = new Map();
      for (const e of entries) {
        if (typeof e.id !== "string") continue;
        const prev = canonical.get(e.id);
        if (!prev || (e.version ?? 0) > (prev.version ?? 0)) canonical.set(e.id, e);
      }
      for (const q of queriedIds) {
        if (typeof q !== "string" || q.length === 0 || canonical.has(q)) continue;
        let matchId = null;
        let matchStatus = null;
        let matchCount = 0;
        for (const [eid, e] of canonical) {
          if (eid.length > q.length && eid.startsWith(q)) {
            matchCount++;
            if (matchCount > 1) break;
            matchId = eid;
            matchStatus = e.status ?? null;
          }
        }
        if (matchCount === 1) {
          (idPrefixHints ??= []).push({
            queried: q,
            suggested_id: matchId,
            suggested_status: matchStatus,
            note: "id is exact-match only; retry with the full id (add include_archived:true if suggested_status is terminal)",
          });
        }
      }
    }

    const output = {
      entries: compact ? result.map(toCompact) : result,
      count: result.length,
      filters_applied: activeFilters,
      include_archived: include_archived || false,
      include_all_versions: include_all_versions || false,
      entry_kind_filter: entry_kind || null,
      entry_kinds_filter: entry_kinds || null,
      id_filter: id !== undefined ? (Array.isArray(id) ? id : [id]) : null,
      ref_by_filter: ref_by || null,
      ref_field_filter: ref_field || null,
      compact: compact ?? true,
      ...(excludedIdsNotice ? { excluded_ids: excludedIdsNotice } : {}),
      ...(idPrefixHints ? { id_prefix_hints: idPrefixHints } : {}),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
    };
  },
};
