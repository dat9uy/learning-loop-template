import { metaStateFindingEntrySchema } from "../meta-state.js";
import { isOpen, isStaleView } from "../stale-view.js";
import { deepFreeze } from "./deep-freeze.js";

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

    outboundRefs() {
      const refs = [];
      if (parsed.consolidated_into) {
        refs.push({ kind: "change-log", id: parsed.consolidated_into, field: "consolidated_into" });
      }
      if (Array.isArray(parsed.reopens)) {
        for (const id of parsed.reopens) {
          refs.push({ kind: "finding", id, field: "reopens" });
        }
      }
      if (parsed.promoted_to_rule) {
        refs.push({ kind: "rule", id: parsed.promoted_to_rule, field: "promoted_to_rule" });
      }
      return refs;
    },

    inboundRefs(root) {
      const refs = [];
      for (const entry of root) {
        const kind = entry.entry_kind ?? "finding";
        if (kind === "rule" && entry.origin === parsed.id) {
          refs.push({ kind: "rule", id: entry.id, field: "origin" });
        }
        if (kind === "change-log" && typeof entry.consolidates === "string") {
          const ids = entry.consolidates.split(",").map((s) => s.trim());
          if (ids.includes(parsed.id)) {
            refs.push({ kind: "change-log", id: entry.id, field: "consolidated_into" });
          }
        }
        if (kind === "finding" && Array.isArray(entry.reopens) && entry.reopens.includes(parsed.id)) {
          refs.push({ kind: "finding", id: entry.id, field: "reopens" });
        }
        // Cross-kind: loop-design.addresses or proposed_design_for referencing this finding
        if (kind === "loop-design") {
          if (Array.isArray(entry.addresses) && entry.addresses.includes(parsed.id)) {
            refs.push({ kind: "loop-design", id: entry.id, field: "addresses" });
          }
          if (Array.isArray(entry.proposed_design_for) && entry.proposed_design_for.includes(parsed.id)) {
            refs.push({ kind: "loop-design", id: entry.id, field: "proposed_design_for" });
          }
        }
      }
      return refs;
    },
  });
}
