import { metaStateChangeEntrySchema } from "../meta-state.js";
import { deepFreeze } from "./deep-freeze.js";
import { parseConsolidates } from "./consolidates-refs.js";

export function createChangeLog(data) {
  const parsed = metaStateChangeEntrySchema.parse(data);
  return deepFreeze({
    kind: "change-log",
    data: parsed,
    schema: metaStateChangeEntrySchema,

    outboundRefs() {
      const refs = [];
      if (parsed.supersedes) {
        refs.push({ kind: "change-log", id: parsed.supersedes, field: "supersedes" });
      }
      // Plan 260715-0801 Validation Q2: schema is z.array(z.string()).
      // The migration script converts legacy CSV strings to one-element
      // arrays, so the array form is canonical. Tolerate the legacy
      // string form for in-flight processes that read pre-migration data.
      // Parser shared with scripts/validate-registry-refs.js (DRY).
      for (const id of parseConsolidates(parsed.consolidates)) {
        refs.push({ kind: "finding", id, field: "consolidates" });
      }
      return refs;
    },

    inboundRefs(root) {
      const refs = [];
      for (const entry of root) {
        if (entry.entry_kind === "finding" && entry.consolidated_into === parsed.id) {
          refs.push({ kind: "finding", id: entry.id, field: "consolidated_into" });
        }
        if (entry.entry_kind === "change-log" && entry.supersedes === parsed.id) {
          refs.push({ kind: "change-log", id: entry.id, field: "supersedes" });
        }
      }
      return refs;
    },
  });
}
