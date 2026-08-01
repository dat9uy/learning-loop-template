import { metaStateChangeEntrySchema } from "../meta-state.js";
import { deepFreeze } from "./deep-freeze.js";
import { forwardRefs, inverseRefs } from "./relationship-graph.js";

export function createChangeLog(data) {
  const parsed = metaStateChangeEntrySchema.parse(data);
  return deepFreeze({
    kind: "change-log",
    data: parsed,
    schema: metaStateChangeEntrySchema,

    outboundRefs(entries) {
      // Delegate to the centralized graph — single source of truth for
      // cross-ref fields per kind. The graph module collapses the
      // bespoke change-log outbound extractor into the graph.
      return forwardRefs(parsed, entries);
    },

    inboundRefs(root) {
      // Inverse via the graph. Replaces the previous manual loop scanning
      // for entries with `consolidated_into === parsed.id` or
      // `supersedes === parsed.id`.
      return inverseRefs(parsed.id, root);
    },
  });
}
