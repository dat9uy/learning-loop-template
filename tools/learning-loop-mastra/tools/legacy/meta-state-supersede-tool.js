import { z } from "zod";
import { readRegistry } from "../../core/meta-state.js";
import { applyUpdateAndCheck } from "../../core/update-entry-helpers.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";

export const metaStateSupersedeTool = {
  name: "meta_state_supersede",
  description: "Mark a finding as superseded by a change-log entry. Atomically stamps status=superseded + superseded_at + superseded_by + consolidated_into. Closes the gap that meta_state_patch's IMMUTABLE_PATCH_FIELDS deny-list blocks. Gated on OPERATOR_MODE=1. Use for backfilling findings that were incorrectly auto-resolved by the TTL sweep (e.g., a finding was TTL-killed but the underlying bug is still relevant — the consolidated_into change-log captures the lineage).",
  schema: {
    id: z.string().describe("Finding entry id to supersede"),
    consolidated_into: z.string().describe("Id of the change-log entry that is the canonical source"),
    resolution: z.string().optional().describe("Human-readable resolution note"),
    _expected_version: z.coerce.number().optional()
      .describe("Optional CAS: supersede succeeds only if current entry.version === _expected_version."),
  },
  handler: async ({ id, consolidated_into, resolution, _expected_version }) => {
    if (process.env.OPERATOR_MODE !== "1" && process.env.OPERATOR_MODE !== "true") {
      const result = { superseded: false, reason: "operator_role_required", id };
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    const root = resolveRoot();
    const entries = readRegistry(root);
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      const result = { superseded: false, reason: "not_found", id };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_supersede", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    if (entry.entry_kind !== "finding") {
      const result = { superseded: false, reason: "not_a_finding", id, entry_kind: entry.entry_kind };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_supersede", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    // Validate consolidated_into is an existing change-log
    const target = entries.find((e) => e.id === consolidated_into);
    if (!target || target.entry_kind !== "change-log") {
      const result = { superseded: false, reason: "consolidated_into_not_a_change_log", id, consolidated_into };
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_supersede", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    const currentVersion = entry.version ?? 0;
    const expectedVersion = _expected_version !== undefined ? _expected_version : currentVersion;
    const now = new Date().toISOString();
    const patch = {
      status: "superseded",
      superseded_at: now,
      superseded_by: "operator",
      consolidated_into,
      ...(resolution && { resolution }),
      _expected_version: expectedVersion,
    };
    const updateOutcome = await applyUpdateAndCheck(root, id, patch, "meta_state_supersede");
    if (!updateOutcome.ok) {
      const result = { superseded: false, reason: updateOutcome.reason, id, current_version: updateOutcome.current_version };
      appendGateLog(root, { timestamp: now, tool: "meta_state_supersede", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    const result = {
      superseded: true,
      id,
      status: "superseded",
      consolidated_into,
      superseded_at: now,
      superseded_by: "operator",
      ...(resolution && { resolution }),
    };
    appendGateLog(root, { timestamp: now, tool: "meta_state_supersede", ...result });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};
