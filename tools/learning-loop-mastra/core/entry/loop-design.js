import { metaStateLoopDesignSchema } from "../meta-state.js";
import { deepFreeze } from "./deep-freeze.js";

export function createLoopDesign(data) {
  const parsed = metaStateLoopDesignSchema.parse(data);

  // Resolve entry kind for proposed_design_for / addresses refs.
  // Lookup-first when entries are available (canonical); fall back to a
  // prefix heuristic when the target entry is not in the registry (dangling
  // ref case where registry lookup is meaningless).
  function kindForId(id, entries) {
    if (entries) {
      const found = entries.find((e) => e.id === id);
      if (found) return found.entry_kind ?? "finding";
    }
    return typeof id === "string" && id.startsWith("rule-") ? "rule" : "finding";
  }

  return deepFreeze({
    kind: "loop-design",
    data: parsed,
    schema: metaStateLoopDesignSchema,

    outboundRefs(entries) {
      const refs = [];
      if (Array.isArray(parsed.proposed_design_for)) {
        for (const id of parsed.proposed_design_for) {
          refs.push({ kind: kindForId(id, entries), id, field: "proposed_design_for" });
        }
      }
      if (Array.isArray(parsed.addresses)) {
        for (const id of parsed.addresses) {
          refs.push({ kind: kindForId(id, entries), id, field: "addresses" });
        }
      }
      return refs;
    },

    inboundRefs(_root) {
      // loop-design is a leaf in the graph — no entry type points to it.
      return [];
    },
  });
}
