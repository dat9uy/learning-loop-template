import { z } from "zod";
import { readRegistry } from "../../core/meta-state.js";
import { factoryFor } from "../../core/entry/index.js";
import { buildInverseIndexes } from "../../core/loop-introspect.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { findEntryOrNotFound } from "#lib/find-entry.js";
import { isStaleView } from "../../core/stale-view.js";
import { computeCurrentHashes } from "../../core/stale-view.js";
import { readFileIndex } from "../../core/meta-state.js";

/**
 * Group an array of {kind, id, field} refs by field name, collapsing
 * multi-valued fields (reopens, consolidates) into arrays.
 */
function groupOutbound(refs) {
  const result = {};
  for (const ref of refs) {
    if (ref.field === "reopens") {
      // reopens is multi-valued: collect into array
      if (!result.reopens) result.reopens = [];
      result.reopens.push(ref.id);
    } else if (ref.field === "consolidates") {
      // consolidates maps to consolidated_into on the finding side,
      // but on the change-log outbound it's a comma-separated list → array
      if (!result.consolidates) result.consolidates = [];
      result.consolidates.push(ref.id);
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
 * the current tool. Preserves the 6 canonical inbound key names.
 */
const INBOUND_KEY_MAP = {
  consolidated_into: "consolidated_by",
  supersedes:        "superseded_by",
  origin:            "origin_of",
  promoted_to_rule:  "promoted_from",
  reopens:           "reopened_by",
  addresses:         "addressed_by",
};

function groupInbound(refs) {
  const result = {};
  for (const ref of refs) {
    const key = INBOUND_KEY_MAP[ref.field] ?? ref.field;
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
 * CROSS-TOOL DIVERGENCE (Plan 260715-1608 Phase 1, red-team F2):
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
 * Plan 260707-0812 Phase 2 (red-team H3):
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
  // Plan 260716-0624 Phase 02 (RT: M23): signals threaded through so the
  // stale-branch fires on drift, not just age. RT: M20 — caller (resolveDanglingRefs)
  // is responsible for gate-logging non-"missing" skipped paths.
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
    } else if (status === "superseded") {
      dangling.push({ field: ref.field, target_id: ref.id, target_kind: ref.kind, reason: "superseded" });
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
 * Phase 1 (Rec 8 collapse, plan 260704-0301-stale-findings-dispatch-handle):
 * the `dangling_refs` derived field surfaces refs whose target is stale,
 * missing, superseded, or resolved. This replaces the old `stale-ref`
 * follow-up emission that sweep used to produce — the same information is
 * now a derived query over the relationship graph instead of a recorded
 * finding kind.
 */
export const metaStateRelationshipsTool = {
  name: "meta_state_relationships",
  description: "Query the relationship graph for a single meta-state entry. Returns inbound, outbound, or both directions of cross-references (1-hop traversal only). The `dangling_refs` derived field surfaces outbound refs whose target is stale, missing, superseded, or resolved — replacing the old stale-ref follow-up emission. Read-only, no operator gate required.",
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
      // Plan 260716-0624 Phase 02: build drift signals so the dangling-refs
      // predicate surfaces drift-stale targets, not just age-stale ones.
      const fileIndex = readFileIndex(root);
      const { ok: codeHashes, skipped } = computeCurrentHashes(entries, root);
      const gateLogTimestamp = new Date().toISOString();
      for (const s of skipped) {
        if (s.reason !== "missing") {
          appendGateLog(root, {
            timestamp: gateLogTimestamp,
            tool: "meta_state_relationships",
            action: "compute_current_hash_skipped",
            canonical: s.canonical,
            reason: s.reason,
          });
        }
      }
      const signals = { fileIndex, codeHashes };
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

// Resolve outbound refs for the entry, including the dual-field fallback for
// promoted_to_rule (legacy migration: if the finding doesn't have
// promoted_to_rule declared, look up origin_inverse to find the rule that
// originated from this finding). Returns the grouped wire shape, or null when
// the entry has no outbound refs.
function resolveOutboundRefs(factory, entry, id, entries) {
  const refs = factory.outboundRefs(entries);
  if (entry.entry_kind === "finding" || entry.entry_kind === undefined) {
    const hasPromoted = refs.some((r) => r.field === "promoted_to_rule");
    if (!hasPromoted) {
      const inverse = buildInverseIndexes(entries);
      const rulesFromOrigin = inverse.origin_inverse.get(id);
      if (rulesFromOrigin && rulesFromOrigin.length > 0) {
        refs.push({ kind: "rule", id: rulesFromOrigin[0], field: "promoted_to_rule" });
      }
    }
  }
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
