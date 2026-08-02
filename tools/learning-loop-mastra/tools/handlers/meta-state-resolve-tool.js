import { z } from "zod";
import { readRegistry } from "../../core/meta-state.js";
import { applyUpdateAndCheck } from "../../core/update-entry-helpers.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { loadPromotedRules, checkResolutionEvidence } from "../../core/gate-logic.js";

// TERMINAL_STATUSES collapses to {resolved, accepted} after Phase 3
// (`superseded` was folded into `resolved` + a citation row).
// `archived` is runtime-applied and excluded from the short-circuit (an
// already-archived entry is filtered upstream by the entry_kind check; this set
// only gates the resolved/accepted branch).
const TERMINAL_STATUSES = new Set(["resolved", "accepted"]);

export const metaStateResolveTool = {
  name: "meta_state_resolve",
  description: "Mark a meta-state finding resolved. Only finding entries can be resolved; rules, designs, and change-logs are rejected. Resolution evidence is gate-checked. Phase 5: the `cascade_from` writer was removed — new cascades cannot be initiated; close a stale parent by calling meta_state_resolve on it directly. The `reopens` field + read path are retained for the 17 historical edges.",
  schema: {
    id: z.string().describe("Exact entry id to resolve"),
    resolution: z.string().optional().describe("How it was resolved"),
    resolved_by: z.enum(["operator", "auto-resolve"]).optional().default("operator").describe("Who resolved it"),
  },
  handler: async ({ id, resolution, resolved_by }) => {
    const root = resolveRoot();
    const entries = readRegistry(root);
    const entry = entries.find((e) => e.id === id);

    if (!entry) {
      const result = { resolved: false, reason: "not_found", id };
      appendGateLog(root, {
        timestamp: new Date().toISOString(),
        tool: "meta_state_resolve",
        ...result,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }

    if (entry.entry_kind === "change-log") {
      const result = { resolved: false, reason: "change_log_immutable", id };
      appendGateLog(root, {
        timestamp: new Date().toISOString(),
        tool: "meta_state_resolve",
        ...result,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }

    if (entry.entry_kind !== "finding") {
      const result = { resolved: false, reason: "not_a_finding", id, entry_kind: entry.entry_kind };
      appendGateLog(root, {
        timestamp: new Date().toISOString(),
        tool: "meta_state_resolve",
        ...result,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }

    if (TERMINAL_STATUSES.has(entry.status)) {
      const result = {
        resolved: false,
        reason: "already_terminal",
        id,
        current_status: entry.status,
      };
      appendGateLog(root, {
        timestamp: new Date().toISOString(),
        tool: "meta_state_resolve",
        ...result,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }

    // Consult determinism-checklist rules before resolving
    const rules = loadPromotedRules(root);

    // Consult global rules (applies_to_resolution === "*") for every resolution
    for (const rule of rules) {
      if (rule.pattern_type !== "determinism-checklist") continue;
      if (rule.applies_to_resolution !== "*") continue;
      const evidence = checkResolutionEvidence(rule, root);
      if (!evidence.satisfied) {
        const result = { resolved: false, reason: "resolution_evidence_required", ...evidence };
        appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_resolve", ...result });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    }

    for (const rule of rules) {
      if (rule.pattern_type !== "determinism-checklist") continue;
      if (rule.applies_to_resolution !== id) continue;
      const evidence = checkResolutionEvidence(rule, root);
      if (!evidence.satisfied) {
        const result = {
          resolved: false,
          reason: "resolution_evidence_required",
          ...evidence,
        };
        appendGateLog(root, {
          timestamp: new Date().toISOString(),
          tool: "meta_state_resolve",
          ...result,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      }
    }

    // Phase 5: cascade branch removed. The cascade was the one mutation
    // that un-closed a record as a side-effect of opening another. New
    // cascades cannot be initiated; closing a stale parent is now an
    // explicit `meta_state_resolve` on the parent. The 17 historical
    // edges + the read path + `validateCascadeChildren` are retained
    // for historical reads via `meta_state_relationship_validate`.

    const now = new Date().toISOString();
    const patch = {
      status: "resolved",
      resolved_at: now,
      resolved_by,
      ...(resolution && { resolution }),
    };
// closes C16 (resolve handler ignored
    // updateEntry's null return). applyUpdateAndCheck re-reads the registry
    // and surfaces updateEntry's actual outcome — null → not_found,
    // version_mismatch → tagged failure, throw on unexpected returns.
    const updateOutcome = await applyUpdateAndCheck(root, id, patch, "meta_state_resolve");
    if (!updateOutcome.ok) {
      const result = {
        resolved: false,
        reason: updateOutcome.reason,
        id,
        ...(updateOutcome.current_version !== undefined ? { current_version: updateOutcome.current_version } : {}),
      };
      appendGateLog(root, { timestamp: now, tool: "meta_state_resolve", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    const result = {
      resolved: true,
      id,
      status: "resolved",
      resolved_by,
      ...(resolution && { resolution }),
    };

    appendGateLog(root, {
      timestamp: now,
      tool: "meta_state_resolve",
      ...result,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
};

/**
 * Validate cascade children. Returns { valid, valid_children } on success,
 * or { valid: false, reason, ... } on failure. Does NOT apply any patch.
 * Each child must exist, have `reopens` containing the parent id, and be
 * in `active` or `resolved` status. Superseded children are rejected.
 *
 * retargeted the cascade to operate on `stale` parents
 * (the legacy `expired` status was removed). The cascade is reachable
 * today via stale or active parents only.
 */
function validateCascadeChildren(root, parent, childIds, entries) {
  const validChildren = [];
  const missingIds = [];
  const badChildren = [];

  for (const childId of childIds) {
    const child = entries.find((e) => e.id === childId);
    if (!child) {
      missingIds.push(childId);
      continue;
    }
    if (!Array.isArray(child.reopens) || !child.reopens.includes(parent.id)) {
      badChildren.push({
        child_id: childId,
        reason: "not_reopening",
        expected_reopens: parent.id,
        actual_reopens: child.reopens ?? null,
      });
      continue;
    }
// child status check uses
    // isOpen (covers open/active/reported/stale) instead of literal active
    // and `child.status !== "resolved"`. This is the resolved+any-open
    // cascade invariant — same shape, sourced from the predicate.
    if (!isOpen(child) && child.status !== "resolved") {
      badChildren.push({
        child_id: childId,
        reason: "unresolved",
        child_status: child.status,
      });
      continue;
    }
    validChildren.push(childId);
  }

  if (missingIds.length > 0) {
    return { valid: false, reason: "cascade_child_not_found", id: parent.id, missing_ids: missingIds };
  }
  if (badChildren.length > 0) {
    const reason = badChildren[0].reason === "not_reopening"
      ? "cascade_child_not_reopening"
      : "cascade_child_unresolved";
    return { valid: false, reason, id: parent.id, bad_children: badChildren };
  }

  return { valid: true, valid_children: validChildren };
}
