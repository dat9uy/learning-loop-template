import { z } from "zod";
import { readRegistry } from "../../core/meta-state.js";
import { factoryFor } from "../../core/entry/index.js";
import { buildInverseIndexes } from "../../core/loop-introspect.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { findEntryOrNotFound } from "#lib/find-entry.js";

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
 * Read-only tool: queries the relationship graph without mutating the registry.
 * Reimplemented on top of factory methods (Mechanism B). Wire shape is preserved;
 * the dual-field promoted_to_rule migration logic is retained for legacy findings.
 */
export const metaStateRelationshipsTool = {
  name: "meta_state_relationships",
  description: "Query the relationship graph for a single meta-state entry. Returns inbound, outbound, or both directions of cross-references (1-hop traversal only). Read-only, no operator gate required.",
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
      const refs = factory.outboundRefs(entries);

      // Dual-field fallback for promoted_to_rule (legacy migration):
      // if the finding doesn't have promoted_to_rule declared, look up
      // origin_inverse to find the rule that originated from this finding.
      // Mirrors the current tool's lines 43-53.
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
      result.outbound = Object.keys(outbound).length > 0 ? outbound : null;
    }

    if (direction === "inbound" || direction === "both") {
      const refs = factory.inboundRefs(entries);
      const inbound = groupInbound(refs);
      result.inbound = Object.keys(inbound).length > 0 ? inbound : null;
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
