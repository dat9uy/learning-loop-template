import { metaStateLoopDesignSchema } from "../meta-state.js";
import { deepFreeze } from "./deep-freeze.js";

export function createLoopDesign(data) {
  const parsed = metaStateLoopDesignSchema.parse(data);

  // Resolve entry kind for proposed_design_for refs:
  // rule ids start with "rule-", everything else defaults to "finding".
  function kindForId(id) {
    return typeof id === "string" && id.startsWith("rule-") ? "rule" : "finding";
  }

  return deepFreeze({
    kind: "loop-design",
    data: parsed,
    schema: metaStateLoopDesignSchema,

    outboundRefs() {
      const refs = [];
      if (Array.isArray(parsed.proposed_design_for)) {
        for (const id of parsed.proposed_design_for) {
          refs.push({ kind: kindForId(id), id, field: "proposed_design_for" });
        }
      }
      if (Array.isArray(parsed.addresses)) {
        for (const id of parsed.addresses) {
          refs.push({ kind: kindForId(id), id, field: "addresses" });
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
