import { metaStateLoopDesignSchema } from "../meta-state.js";
import { deepFreeze } from "./deep-freeze.js";
import { forwardRefs } from "./relationship-graph.js";

export function createLoopDesign(data) {
  // Plan 260731-1325 Phase 1: status:"archived" is now schema-valid on the
  // loop-design enum (deleteEntry appends tombstones for non-change-log kinds).
  const parsed = metaStateLoopDesignSchema.parse(data);

  return deepFreeze({
    kind: "loop-design",
    data: parsed,
    schema: metaStateLoopDesignSchema,

    outboundRefs(entries) {
      // Delegate to the centralized graph — single source of truth for
      // cross-ref fields per kind. Plan 260730-0240 folds the bespoke
      // loop-design kindForId helper into the graph (also fixes the
      // validator's kind-"meta" bug: meta-… fallback returns "finding").
      return forwardRefs(parsed, entries);
    },

    inboundRefs(_root) {
      // loop-design is a leaf in the graph — no entry type points to it.
      return [];
    },
  });
}
