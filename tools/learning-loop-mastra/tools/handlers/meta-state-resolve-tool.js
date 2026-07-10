import { stripEnvelope } from "../../core/envelope-stripper.js";
import { z } from "zod";
import { readRegistry } from "../../core/meta-state.js";
import { applyUpdateAndCheck } from "../../core/update-entry-helpers.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { loadPromotedRules, checkResolutionEvidence } from "../../core/gate-logic.js";
import { isOpen } from "../../core/stale-view.js";

// Plan 260707-0812 Phase 2: TERMINAL_STATUSES collapses to {resolved, superseded}.
// `archived` is runtime-applied and excluded from the short-circuit (an
// already-archived entry is filtered upstream by the entry_kind check; this set
// only gates the resolved/superseded branch).
const TERMINAL_STATUSES = new Set(["resolved", "superseded"]);

export const metaStateResolveTool = {
  name: "meta_state_resolve",
  description: "Mark a meta-state finding as resolved (terminal). Entry will be compacted after 7 days. Use when the operator (or auto-resolve) decides a finding is closed and the underlying issue is gone. Only entry_kind=finding can be resolved; rules, loop-designs, and change-logs are rejected. Consult-gate may block resolution when promoted rules require resolution evidence (e.g., cold-session discoverability test must pass). Not for recording a new issue (use `meta_state_report` instead) or logging a system change (use `meta_state_log_change` instead). Cascade path: when `cascade_from` is provided, the parent is closed in 1 call after validating that each child reopens it. The parent must be isOpen (status ∈ {open, active, reported, stale}); terminal parents are rejected by the already_terminal guard above. `meta_state_ack` was removed in plan 260707-0812; engagement signals flow through resolve/promote/supersede/dispatch/re-verify.",
  schema: {
    id: z.string().describe("Exact entry id to resolve"),
    resolution: z.string().optional().describe("How it was resolved"),
    resolved_by: z.enum(["operator", "auto-resolve"]).optional().default("operator").describe("Who resolved it"),
    cascade_from: z.preprocess(stripEnvelope, z.array(z.string())).optional()
      .describe("Optional list of finding ids whose `reopens` field must include this entry's id. When provided, each child must exist, have `reopens` containing this entry's id, and be isOpen or resolved. The parent must also be isOpen (open/active/reported/stale); terminal parents are rejected by the already_terminal guard. The legacy `reported -> active -> resolved` ack flow was removed in plan 260707-0812."),
  },
  handler: async ({ id, resolution, resolved_by, cascade_from }) => {
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

    // Consult resolution-evidence-required rules before resolving
    const rules = loadPromotedRules(root);

    // Consult global rules (applies_to_resolution === "*") for every resolution
    for (const rule of rules) {
      if (rule.pattern_type !== "resolution-evidence-required") continue;
      if (rule.applies_to_resolution !== "*") continue;
      const evidence = checkResolutionEvidence(rule, root);
      if (!evidence.satisfied) {
        const result = { resolved: false, reason: "resolution_evidence_required", ...evidence };
        appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_resolve", ...result });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    }

    for (const rule of rules) {
      if (rule.pattern_type !== "resolution-evidence-required") continue;
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

    // Cascade branch: when cascade_from is provided, validate children, then
    // close the parent in 1 step. Plan 260707-0812 Phase 2 (red-team C3):
    // the reported-cascade block is removed — `meta_state_ack` is gone, so
    // legacy `reported` parents are isOpen and cascade-closeable like every
    // other open parent. The parent must be isOpen; terminal parents hit the
    // early-return above. `expires_at`/`acked_at` writes were dropped with
    // the enum collapse.
    if (cascade_from?.length > 0) {
      const childValidation = validateCascadeChildren(root, entry, cascade_from, entries);
      if (!childValidation.valid) {
        appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_resolve", id: entry.id, ...childValidation });
        return { content: [{ type: "text", text: JSON.stringify({ resolved: false, ...childValidation }) }] };
      }

      if (!isOpen(entry)) {
        const result = {
          resolved: false,
          reason: "cascade_parent_not_open",
          id: entry.id,
          current_status: entry.status ?? null,
        };
        appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_resolve", ...result });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }

      // Parent is open (open/active/reported/stale) — fall through to the
      // normal resolve path below. The consult-gate was already consulted
      // above (it does not gate on `cascade_from`). The patch sets
      // `status: "resolved"`, `resolved_at`, `resolved_by`, optional
      // `resolution` in 1 call.
    }

    const now = new Date().toISOString();
    const patch = {
      status: "resolved",
      resolved_at: now,
      resolved_by,
      ...(resolution && { resolution }),
    };
    // Plan 260711-0030 Phase 3: closes C16 (resolve handler ignored
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
 * Plan 260611-1000 retargeted the cascade to operate on `stale` parents
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
    // Plan 260707-0812 Phase 2 (red-team C3): child status check uses
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
