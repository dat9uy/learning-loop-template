import { z } from "zod";
import { shipLoopDesign } from "../../core/meta-state.js";
import { replyWithLog, loadEntry } from "../lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { isLiveSession } from "#lib/session-mode.js";

/**
 * Plan 260712-0724 follow-up — Fix A: meta_state_ship_loop_design.
 *
 * Closes Implementation 3 Gap #1: no MCP tool could previously flip a
 * loop-design's status from `active` to `inactive` because meta_state_patch
 * omits status from the loop-design patch projection and IMMUTABLE_PATCH_FIELDS
 * blocks status on the batch update path. meta_state_supersede explicitly
 * rejects non-findings. The previous workaround was to set shipped_in_plan +
 * shipped_at via patch and leave status at "active" — but downstream consumers
 * reading status directly still saw the loop-design as active.
 *
 * This tool calls the new `shipLoopDesign` core helper which atomically stamps
 * status + shipped_in_plan + shipped_at under the registry lock, with the
 * entry_kind and current-status preconditions enforced. Idempotent: an
 * already-shipped loop-design returns shipped:false with reason:already_shipped.
 *
 * Gated on LOOP_SESSION_MODE=live (matches meta_state_supersede and
 * meta_state_promote_rule — these are operator-decided lifecycle flips, not
 * agent-driven mutations).
 */
export const metaStateShipLoopDesignTool = {
  name: "meta_state_ship_loop_design",
  description: "Atomically mark a loop-design entry as shipped (status: active → inactive) and stamp shipped_in_plan + shipped_at. Closes Implementation 3 Gap #1 — no MCP tool could previously flip loop-design status. The single source of truth for loop-design ship semantics. Gated on LOOP_SESSION_MODE=live. Idempotent: re-shipping returns already_shipped.",
  schema: {
    id: z.string().describe("Loop-design entry id to ship"),
    shipped_in_plan: z.string().min(1).max(200).describe("Plan id (e.g., 260712-0724-assertinvariant-universal-primitive). Recorded on the entry as shipped_in_plan."),
    _expected_version: z.coerce.number().optional()
      .describe("Optional CAS: ship succeeds only if current entry.version === _expected_version."),
  },
  handler: async ({ id, shipped_in_plan, _expected_version }) => {
    if (!isLiveSession()) {
      return replyWithLog(resolveRoot(), "meta_state_ship_loop_design", { shipped: false, reason: "live_session_required", id });
    }
    const root = resolveRoot();
    const entry = loadEntry(root, id);
    if (!entry) {
      return replyWithLog(root, "meta_state_ship_loop_design", { shipped: false, reason: "not_found", id });
    }
    if (entry.entry_kind !== "loop-design") {
      return replyWithLog(root, "meta_state_ship_loop_design", { shipped: false, reason: "not_a_loop_design", id, entry_kind: entry.entry_kind });
    }
    const currentVersion = entry.version ?? 0;
    const expectedVersion = _expected_version !== undefined ? _expected_version : currentVersion;
    const outcome = await shipLoopDesign(root, id, shipped_in_plan, expectedVersion);
    return replyWithLog(root, "meta_state_ship_loop_design", { ...outcome, id, shipped_in_plan });
  },
};