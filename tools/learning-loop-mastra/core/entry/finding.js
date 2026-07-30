import { metaStateFindingEntrySchema } from "../meta-state.js";
import { isOpen, isStaleView } from "../stale-view.js";
import { deepFreeze } from "./deep-freeze.js";
import { forwardRefs, inverseRefs } from "./relationship-graph.js";

export function createFinding(data) {
  const parsed = metaStateFindingEntrySchema.parse(data);
  return deepFreeze({
    kind: "finding",
    data: parsed,
    schema: metaStateFindingEntrySchema,

    // Plan 260707-0812 Phase 2: `isActive`/`isStale` renamed to
    // `isOpen`/`isStaleView`. Semantics: the open predicate tolerates legacy
    // `active`/`reported`/`stale` as open; the stale-view predicate checks
    // age + drift. See core/stale-view.js for the canonical implementations.
    isOpen()     { return isOpen(parsed); },
    isStaleView(){ return isStaleView(parsed); },
    isBlocking() { return parsed.severity === "escalate"; },

    outboundRefs(entries) {
      // Delegate to the centralized graph — single source of truth for
      // cross-ref fields per kind. Plan 260730-0240 centralizes the
      // outbound/inbound implementations into core/entry/relationship-graph.js.
      return forwardRefs(parsed, entries);
    },

    inboundRefs(root) {
      // Inverse via the graph: scan registry for any entry whose forward
      // refs point at `parsed.id`. Replaces the previous per-kind inline
      // inboundFromRule/inboundFromChangeLog/inboundFromFinding dispatchers.
      return inverseRefs(parsed.id, root);
    },
  });
}
