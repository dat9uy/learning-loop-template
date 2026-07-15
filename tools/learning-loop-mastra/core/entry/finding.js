import { metaStateFindingEntrySchema } from "../meta-state.js";
import { isOpen, isStaleView } from "../stale-view.js";
import { deepFreeze } from "./deep-freeze.js";
import { inboundFromLoopDesign } from "./inbound-from-loop-design.js";

// Per-kind inbound-ref extractors. Each returns an array (0 or 1 refs) so
// `inboundRefs` can flatten them via spread. Extracted in Phase 4 to lower
// the cognitive complexity of the entry-level dispatcher.
function inboundFromRule(entry, parsed) {
  if (entry.origin !== parsed.id) return [];
  return [{ kind: "rule", id: entry.id, field: "origin" }];
}

function inboundFromChangeLog(entry, parsed) {
  // Plan 260715-0801 Validation Q2: consolidates is z.array(z.string())
  // post-migration. The migration script normalizes legacy CSV strings to
  // one-element arrays. Tolerate the legacy string form for in-flight
  // processes that read pre-migration data.
  const cl = entry.consolidates;
  const ids = Array.isArray(cl)
    ? cl
    : typeof cl === "string"
      ? cl.split(",").map((s) => s.trim())
      : [];
  if (!ids.includes(parsed.id)) return [];
  return [{ kind: "change-log", id: entry.id, field: "consolidated_into" }];
}

function inboundFromFinding(entry, parsed) {
  if (!Array.isArray(entry.reopens) || !entry.reopens.includes(parsed.id)) return [];
  return [{ kind: "finding", id: entry.id, field: "reopens" }];
}

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
        if (kind === "rule") refs.push(...inboundFromRule(entry, parsed));
        if (kind === "change-log") refs.push(...inboundFromChangeLog(entry, parsed));
        if (kind === "finding") refs.push(...inboundFromFinding(entry, parsed));
        if (kind === "loop-design") refs.push(...inboundFromLoopDesign(entry, parsed));
      }
      return refs;
    },
  });
}
