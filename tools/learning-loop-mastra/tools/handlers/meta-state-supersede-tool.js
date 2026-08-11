import { z } from "zod";
import { readRegistry, appendCitationEntryAtomic } from "../../core/meta-state.js";
import { applyUpdateAndCheck } from "../../core/update-entry-helpers.js";
import { replyWithLog, loadEntry } from "../lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

/**
 * Close a finding by citing it to a change-log entry. Atomically stamps
 * status=resolved + resolved_at + resolved_by + resolution AND emits a
 * citation row {source: finding, target: change-log, rationale:…} so the
 * supersede lineage is asserted in `citations.jsonl` rather than stamped
 * on the record. The prior `superseded` + `consolidated_into` /
 * `superseded_at` / `superseded_by` fields are kept `.optional()` on the
 * finding schema (inert-historical — old version lines still parse) but
 * are no longer written or indexed.
 */
export const metaStateSupersedeTool = {
  name: "meta_state_supersede",
  description: "INTERNAL resolve flavor — do NOT offer this as a closure option. The default closure for any finding is `meta_state_resolve`. This tool exists only for the specific case where the finding's closure is itself a change-log citation: it stamps status=resolved + resolved_at + resolved_by + resolution AND emits a citation row {source: finding, target: change-log, rationale:\"consolidated into <change-log id>\"}. When an agent is closing a finding, always use `meta_state_resolve` unless the closure already cites a change-log entry.",
  schema: {
    id: z.string().describe("Finding entry id to supersede"),
    consolidated_into: z.string().describe("Id of the change-log entry that is the canonical source"),
    resolution: z.string().optional().describe("Human-readable resolution note"),
    _expected_version: z.coerce.number().optional()
      .describe("Optional CAS: supersede succeeds only if current entry.version === _expected_version."),
  },
  handler: async ({ id, consolidated_into, resolution, _expected_version }) => {
    const root = resolveRoot();
    const entry = loadEntry(root, id);
    if (!entry) {
      return replyWithLog(root, "meta_state_supersede", { superseded: false, reason: "not_found", id });
    }
    if (entry.entry_kind !== "finding") {
      return replyWithLog(root, "meta_state_supersede", { superseded: false, reason: "not_a_finding", id, entry_kind: entry.entry_kind });
    }
    // Validate consolidated_into is an existing change-log
    const target = readRegistry(root).find((e) => e.id === consolidated_into);
    if (!target || target.entry_kind !== "change-log") {
      return replyWithLog(root, "meta_state_supersede", { superseded: false, reason: "consolidated_into_not_a_change_log", id, consolidated_into });
    }
    const currentVersion = entry.version ?? 0;
    const expectedVersion = _expected_version !== undefined ? _expected_version : currentVersion;
    const now = new Date().toISOString();
    const patch = {
      status: "resolved",
      resolved_at: now,
      resolved_by: "operator",
      ...(resolution && { resolution }),
      _expected_version: expectedVersion,
    };
    const updateOutcome = await applyUpdateAndCheck(root, id, patch, "meta_state_supersede");
    if (!updateOutcome.ok) {
      return replyWithLog(root, "meta_state_supersede", { superseded: false, reason: updateOutcome.reason, id, current_version: updateOutcome.current_version });
    }
    // Emit the citation row. The citation's source is the finding being
    // superseded; the target is the canonical change-log. The verb stays
    // prose in `rationale` per the untyped-verb decision (no runtime
    // branch consumes the verb). Append is atomic + cache-invalidating;
    // the leak-guard routes citation entries to citations.jsonl only.
    const citation = {
      id: `citation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      entry_kind: "citation",
      source: id,
      target: consolidated_into,
      rationale: `consolidated into ${consolidated_into}`,
      recorded_at: now,
      recorded_by: "operator",
      status: "active",
    };
    appendCitationEntryAtomic(root, citation);
    return replyWithLog(root, "meta_state_supersede", {
      superseded: true,
      id,
      status: "resolved",
      consolidated_into,
      citation_id: citation.id,
      resolved_at: now,
      resolved_by: "operator",
      ...(resolution && { resolution }),
    });
  },
};