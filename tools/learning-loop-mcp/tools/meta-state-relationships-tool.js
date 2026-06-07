import { z } from "zod";
import { readRegistry } from "#mcp/core/meta-state.js";
import { buildInverseIndexes } from "#mcp/core/loop-introspect.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const metaStateRelationshipsTool = {
  name: "meta_state_relationships",
  description: "Query the relationship graph for a single meta-state entry. Returns inbound, outbound, or both directions of cross-references (1-hop traversal only).",
  schema: {
    id: z.string().min(1).describe("Entry id to query relationships for"),
    direction: z.enum(["inbound", "outbound", "both"]).optional().default("both")
      .describe("Relationship direction: inbound=inverse refs, outbound=forward refs, both=union. Default: both"),
  },
  handler: async ({ id, direction = "both" }) => {
    const root = resolveRoot();
    const entries = readRegistry(root);
    const entry = entries.find((e) => e.id === id);

    if (!entry) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "entry_not_found", id }) }],
      };
    }

    // Build inverse indexes for inbound lookups
    const inverse = buildInverseIndexes(entries);

    // Forward refs (outbound)
    const outbound = {};
    if (entry.origin && typeof entry.origin === "string") outbound.origin = entry.origin;
    if (entry.addresses && Array.isArray(entry.addresses)) outbound.addresses = entry.addresses;
    if (entry.consolidated_into && typeof entry.consolidated_into === "string") outbound.consolidated_into = entry.consolidated_into;
    if (entry.supersedes && typeof entry.supersedes === "string") outbound.supersedes = entry.supersedes;
    if (entry.promoted_to_rule && typeof entry.promoted_to_rule === "string") outbound.promoted_to_rule = entry.promoted_to_rule;
    if (entry.proposed_design_for && Array.isArray(entry.proposed_design_for)) outbound.proposed_design_for = entry.proposed_design_for;

    // Inbound refs (inverse maps)
    const inbound = {};
    const inboundAddresses = inverse.addresses_inverse.get(id);
    if (inboundAddresses && inboundAddresses.length > 0) inbound.addressed_by = inboundAddresses;
    const inboundSupersedes = inverse.supersedes_inverse.get(id);
    if (inboundSupersedes && inboundSupersedes.length > 0) inbound.superseded_by = inboundSupersedes;
    const inboundOrigin = inverse.origin_inverse.get(id);
    if (inboundOrigin && inboundOrigin.length > 0) inbound.origin_of = inboundOrigin;
    const inboundPromoted = inverse.promoted_to_rule_inverse.get(id);
    if (inboundPromoted && inboundPromoted.length > 0) inbound.promoted_from = inboundPromoted;

    const result = {
      id,
      direction,
      entry_kind: entry.entry_kind,
    };

    if (direction === "outbound" || direction === "both") {
      result.outbound = Object.keys(outbound).length > 0 ? outbound : null;
    }
    if (direction === "inbound" || direction === "both") {
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
