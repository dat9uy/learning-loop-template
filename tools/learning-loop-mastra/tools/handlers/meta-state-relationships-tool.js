import { z } from "zod";
import { readRegistry } from "../../core/meta-state.js";
import { factoryFor } from "../../core/entry/index.js";
import { inverseRefs } from "../../core/entry/relationship-graph.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { findEntryOrNotFound } from "#lib/find-entry.js";
import { isStaleView, buildDriftSignals } from "../../core/stale-view.js";

/**
 * Group an array of {kind, id, field} refs by field name, collapsing
 * multi-valued fields (reopens) into arrays.
 *
 * `consolidates` was de-routed from `CROSS_REFS`. The
 * consolidated edge is sourced from `citations_inverse` and surfaced as
 * `cited_by` (generic) instead of `consolidated_by` (named).
 */
function groupOutbound(refs) {
  const result = {};
  for (const ref of refs) {
    if (ref.field === "reopens") {
      // reopens is multi-valued: collect into array
      if (!result.reopens) result.reopens = [];
      result.reopens.push(ref.id);
    } else if (ref.field === "proposed_design_for" || ref.field === "addresses") {
      // Multi-valued fields: collect into array
      if (!result[ref.field]) result[ref.field] = [];
      result[ref.field].push(ref.id);
    } else {
      result[ref.field] = ref.id;
    }
  }
  return result;
}

/**
 * Map factory inbound field names to the wire-shape key names used by
 * the current tool. The consolidated edge collapsed into a
 * citation row (generic `cited_by`). origin /
 * supersedes / promoted_to_rule collapse into the same citation row — they
 * surface as `cited_by` (generic) alongside consolidated. The other 3
 * named inbound keys (reopens, addresses, proposed_design_for) are
 * unchanged.
 */
const INBOUND_KEY_MAP = {
  reopens:           "reopened_by",
  addresses:         "addressed_by",
};

function groupInbound(refs) {
  const result = {};
  for (const ref of refs) {
    // Citation rows surface as `cited_by` (generic, sourced
    // from `citations_inverse`). A citation entry's `forwardRefs` emits
    // `source` (skip — `cited_by` is target-keyed) and `target`
    // (the edge that says "this target was cited by source"). Only the
    // `target` ref maps to `cited_by`; the `source` ref is the
    // emitting side and would conflate with the emitter's own id on
    // inbound queries. This subsumes the named `consolidated_by` /
    // `superseded_by` / `origin_of` / `promoted_from` keys retired
    // alongside the de-routing.
    let key;
    if (ref.field === "target") {
      key = "cited_by";
    } else if (ref.field === "source") {
      // The source side of a citation is the emitter; querying the
      // emitter's inbound surfaces this ref as the emitter's own id
      // (no useful wire information — drop).
      continue;
    } else {
      key = INBOUND_KEY_MAP[ref.field] ?? ref.field;
    }
    if (!result[key]) result[key] = [];
    result[key].push(ref.id);
  }
  return result;
}

/**
 * Compute dangling outbound refs: refs whose target is stale-view, missing,
 * or superseded. Replaces the old `stale-ref` follow-up emission that sweep
 * used to produce — the information is now a derived view over the
 * relationship graph instead of a recorded finding kind.
 *
 * CROSS-TOOL DIVERGENCE (red-team F2):
 * This function does NOT have access to a source entry (it receives only
 * outbound `refs` + the entry list), so it cannot distinguish immutable +
 * terminal-source `missing` refs (`historical` in the post-merge validator).
 * The post-merge `tools/learning-loop-mastra/scripts/validate-registry-refs.js`
 * classifies `historical` as informational, but this tool's `dangling_refs`
 * retains the flat `missing`/`stale`/`superseded`/`resolved` reasons. Per
 * YAGNI, agents using `meta_state_relationships` see `dangling_refs` as
 * today (no `historical` label); the `historical` label lives only in the
 * post-merge validator's `computeDanglingRefs` (different function, different
 * signature, different surface).
 *
 * Read-only / pure function over `entries` (the registry snapshot the caller
 * has already loaded). `refs` is the outbound-ref array produced by the
 * factory — `{ kind, id, field }` per ref.
 *
* 
 *   - the stale-branch uses `isStaleView(target)` (covers literal `stale` and
 *     any open entry that is stale-view by age/drift) instead of `status === "stale"`
 *   - the dead `auto-resolved` branch is dropped (the enum-collapse removed
 *     `auto-resolved`; the read-site here is the only place that mentioned it)
 *
 * Reason classification:
 *   - target not in registry         -> "missing"
 *   - target.entry_kind !== expected -> "missing" (kind mismatch is the
 *                                       same informational class)
 *   - isStaleView(target)            -> "stale"
 *   - target.status === "superseded" -> "superseded"
 *   - target.status === "resolved"   -> "resolved" (terminal, the ref
 *                                       cannot be resolved by re-verifying
 *                                       or re-dispatching)
 *
 * Returns the dangling list. Refs whose target is open but not stale-view
 * are NOT dangling — those are healthy ongoing references.
 */
function computeDanglingRefs(refs, entries, signals = {}) {
  // Signals are threaded through so the stale-branch fires on drift, not
  // just age. The caller (resolveDanglingRefs) is responsible for
  // gate-logging non-"missing" skipped paths.
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const dangling = [];
  for (const ref of refs) {
    const target = entryById.get(ref.id);
    if (!target) {
      dangling.push({
        field: ref.field,
        target_id: ref.id,
        target_kind: ref.kind,
        reason: "missing",
      });
      continue;
    }
    const status = target.status;
    if (isStaleView(target, signals)) {
      dangling.push({ field: ref.field, target_id: ref.id, target_kind: ref.kind, reason: "stale" });
    } else if (status === "resolved") {
      dangling.push({ field: ref.field, target_id: ref.id, target_kind: ref.kind, reason: "resolved" });
    }
  }
  return dangling;
}

/**
 * Read-only tool: queries the relationship graph without mutating the registry.
 * Reimplemented on top of factory methods (Mechanism B). Wire shape is preserved;
 * the dual-field promoted_to_rule migration logic is retained for legacy findings.
 *
 * Rec 8 collapse: the `dangling_refs` derived field surfaces refs whose
 * target is stale, missing, superseded, or resolved. This replaces the old
 * `stale-ref` follow-up emission that sweep used to produce — the same
 * information is now a derived query over the relationship graph instead
 * of a recorded finding kind.
 */
export const metaStateRelationshipsTool = {
  name: "meta_state_relationships",
  description: "Query the relationship graph for a single meta-state entry. Returns inbound, outbound, or both directions of cross-references (1-hop traversal only). The `dangling_refs` derived field surfaces outbound refs whose target is stale, missing, or resolved — replacing the old stale-ref follow-up emission (`superseded` collapsed into `resolved` + a citation; `superseded` reason retired). Read-only, no operator gate required.",
  schema: {
    id: z.string().min(1).describe("Entry id to query relationships for"),
    direction: z.enum(["inbound", "outbound", "both"]).optional().default("both")
      .describe("Relationship direction: inbound=inverse refs, outbound=forward refs, both=union. Default: both"),
  },
  handler: async ({ id, direction = "both" }) => {
    const root = resolveRoot();
    const { entry, notFoundResponse } = findEntryOrNotFound(root, id);
    if (notFoundResponse) return notFoundResponse;
    const entries = readRegistry(root);

    const factory = factoryFor(entry);
    const result = {
      id,
      direction,
      entry_kind: entry.entry_kind ?? "finding",
    };

    if (direction === "outbound" || direction === "both") {
// build drift signals so the dangling-refs
      // predicate surfaces drift-stale targets, not just age-stale ones.
      const signals = buildDriftSignals(entries, root, {
        toolName: "meta_state_relationships",
      });
      result.outbound = resolveOutboundRefs(factory, entry, id, entries);
      result.dangling_refs = resolveDanglingRefs(factory, entries, signals);
    }

    if (direction === "inbound" || direction === "both") {
      result.inbound = resolveInboundRefs(factory, entries);
    }

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "meta_state_relationships",
      id,
      direction,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
};

// Resolve outbound refs for the entry. The dual-field
// `promoted_to_rule` fallback is removed: the canonical promotion edge is now a
// citation row emitted by `meta_state_promote_rule`. The fallback no
// longer resolves — findings queryable via `cited_by` (the generic citation view)
// surface the citing rule through the inbound path. Outbound retains
// the non-relationship fields (`reopens`, `addresses`, `proposed_design_for`).
function resolveOutboundRefs(factory, entry, id, entries) {
  const refs = factory.outboundRefs(entries);
  const outbound = groupOutbound(refs);
  return Object.keys(outbound).length > 0 ? outbound : null;
}

// Dangling outbound refs: refs whose target is stale-view, missing, superseded,
// or resolved. Refs whose target is open-but-not-stale are healthy. Returns
// the dangling list (or null when empty).
function resolveDanglingRefs(factory, entries, signals) {
  const refs = factory.outboundRefs(entries);
  const dangling = computeDanglingRefs(refs, entries, signals);
  return dangling.length > 0 ? dangling : null;
}

// Inbound refs grouped by the wire-shape key. Returns the grouped shape, or
// null when the entry has no inbound refs.
function resolveInboundRefs(factory, entries) {
  const refs = factory.inboundRefs(entries);
  const inbound = groupInbound(refs);
  return Object.keys(inbound).length > 0 ? inbound : null;
}
