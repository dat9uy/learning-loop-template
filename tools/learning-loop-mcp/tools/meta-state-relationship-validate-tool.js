import { z } from "zod";
import { readRegistry } from "#mcp/core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";

const FINDING_ID_REGEX = /meta-\d{6}T\d{4}Z-[a-z0-9-]+/g;
// The legacy 'expired' status was removed in plan 260611-1000. Only 'stale'
// parents are now considered orphans (linter warns when a new finding
// references a stale id without declaring it in `reopens`).
const ORPHAN_STATUSES = new Set(["stale"]);

export const metaStateRelationshipValidateTool = {
  name: "meta_state_relationship_validate",
  description:
    "Read-only lint: scan a description for finding-id references and warn when any referenced " +
    "id is `stale` and the caller has not declared a structural field referencing it. " +
    "Use before meta_state_report to catch orphan cross-references early. " +
    "Returns { warned, orphans, unknown_refs, referenced, suggestion }. " +
    "Pure read; safe to call repeatedly. " +
    "Not for navigating existing relationships (use meta_state_relationships) or creating findings (use meta_state_report).",
  schema: {
    description: z.string().min(1).describe("The description text to lint for finding-id references."),
    entry_id: z.string().optional().describe("Optional id of an existing entry whose `reopens` field should be checked against the referenced ids."),
  },
  handler: async ({ description, entry_id }) => {
    const root = resolveRoot();
    const entries = readRegistry(root);

    const entryById = new Map(entries.map((e) => [e.id, e]));
    const referenced = Array.from(new Set(description.match(FINDING_ID_REGEX) ?? []));

    const claimed = new Set();
    if (entry_id) {
      const entry = entryById.get(entry_id);
      if (entry && Array.isArray(entry.reopens)) {
        for (const id of entry.reopens) claimed.add(id);
      }
    }

    const orphans = [];
    const unknown_refs = [];
    for (const id of referenced) {
      const target = entryById.get(id);
      if (!target) {
        unknown_refs.push(id);
        continue;
      }
      if (ORPHAN_STATUSES.has(target.status) && !claimed.has(id)) {
        orphans.push(id);
      }
    }

    const warned = orphans.length > 0 || unknown_refs.length > 0;
    const result = { warned, referenced };

    if (orphans.length > 0) result.orphans = orphans;
    if (unknown_refs.length > 0) result.unknown_refs = unknown_refs;

    if (orphans.length > 0) {
      result.suggestion = `Pass reopens: ${JSON.stringify(orphans)} on your meta_state_report call. ` +
        `Then call meta_state_resolve({ id: '<parent_id>', cascade_from: ['<new_finding_id>'] }) ` +
        `to close each stale parent in 1 step.`;
    } else if (unknown_refs.length > 0) {
      result.suggestion = `${unknown_refs.join(", ")} not in registry. Did you typo? If intentional, ignore.`;
    }

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};
