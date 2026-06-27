import { metaStateChangeEntrySchema } from "../meta-state.js";
import { deepFreeze } from "./deep-freeze.js";

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
      if (typeof parsed.consolidates === "string" && parsed.consolidates.trim()) {
        const ids = parsed.consolidates.split(",").map((s) => s.trim()).filter(Boolean);
        for (const id of ids) {
          refs.push({ kind: "finding", id, field: "consolidates" });
        }
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
