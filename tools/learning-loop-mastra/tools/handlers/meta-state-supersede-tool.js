import { z } from "zod";
import { readRegistry } from "../../core/meta-state.js";
import { applyUpdateAndCheck } from "../../core/update-entry-helpers.js";
import { replyWithLog, loadEntry } from "../lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { isLiveSession } from "#lib/session-mode.js";

export const metaStateSupersedeTool = {
  name: "meta_state_supersede",
  description: "Mark a finding as superseded by a change-log entry. Atomically stamps status=superseded + superseded_at + superseded_by + consolidated_into. Closes the gap that meta_state_patch's IMMUTABLE_PATCH_FIELDS deny-list blocks. Gated on LOOP_SESSION_MODE=live. Use for backfilling findings that were incorrectly auto-resolved by the TTL sweep (e.g., a finding was TTL-killed but the underlying bug is still relevant — the consolidated_into change-log captures the lineage).",
  schema: {
    id: z.string().describe("Finding entry id to supersede"),
    consolidated_into: z.string().describe("Id of the change-log entry that is the canonical source"),
    resolution: z.string().optional().describe("Human-readable resolution note"),
    _expected_version: z.coerce.number().optional()
      .describe("Optional CAS: supersede succeeds only if current entry.version === _expected_version."),
  },
  handler: async ({ id, consolidated_into, resolution, _expected_version }) => {
    if (!isLiveSession()) {
      return replyWithLog(resolveRoot(), "meta_state_supersede", { superseded: false, reason: "live_session_required", id });
    }
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
      status: "superseded",
      superseded_at: now,
      superseded_by: "operator",
      consolidated_into,
      ...(resolution && { resolution }),
      _expected_version: expectedVersion,
    };
    const updateOutcome = await applyUpdateAndCheck(root, id, patch, "meta_state_supersede");
    if (!updateOutcome.ok) {
      return replyWithLog(root, "meta_state_supersede", { superseded: false, reason: updateOutcome.reason, id, current_version: updateOutcome.current_version });
    }
    return replyWithLog(root, "meta_state_supersede", {
      superseded: true,
      id,
      status: "superseded",
      consolidated_into,
      superseded_at: now,
      superseded_by: "operator",
      ...(resolution && { resolution }),
    });
  },
};