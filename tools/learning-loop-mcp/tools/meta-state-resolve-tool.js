import { z } from "zod";
import {
  readRegistry,
  updateEntry,
} from "#mcp/core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { loadPromotedRules, checkResolutionEvidence } from "#mcp/core/gate-logic.js";

const TERMINAL_STATUSES = new Set(["auto-resolved", "expired", "resolved"]);

export const metaStateResolveTool = {
  name: "meta_state_resolve",
  description: "Mark a meta-state entry as resolved (terminal). Entry will be compacted after 7 days. Use when the operator (or auto-resolve) decides a finding is closed and the underlying issue is gone. Consult-gate may block resolution when promoted rules require resolution evidence (e.g., cold-session discoverability test must pass). Not for recording a new issue (use `meta_state_report` instead) or logging a system change (use `meta_state_log_change` instead).",
  schema: {
    id: z.string().describe("Exact entry id to resolve"),
    resolution: z.string().optional().describe("How it was resolved"),
    resolved_by: z.enum(["operator", "auto-resolve"]).optional().default("operator").describe("Who resolved it"),
    cascade_from: z.array(z.string()).optional()
      .describe("Optional list of finding ids whose `reopens` field must include this entry's id. When provided AND this entry's status is 'expired': validate each child (exists, reopens includes parent, status is 'active' or 'resolved'), then transition this entry to 'resolved' and stamp `cascade_resolved_by`. Mirrors the inverse of `meta_state_supersede`. Operator gate still applies."),
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

    if (TERMINAL_STATUSES.has(entry.status) && !(entry.status === "expired" && cascade_from?.length > 0)) {
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
      if (rule.promoted_to_rule?.pattern_type !== "resolution-evidence-required") continue;
      if (rule.promoted_to_rule?.applies_to_resolution !== "*") continue;
      const evidence = checkResolutionEvidence(rule, root);
      if (!evidence.satisfied) {
        const result = { resolved: false, reason: "resolution_evidence_required", ...evidence };
        appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_resolve", ...result });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    }

    for (const rule of rules) {
      if (rule.promoted_to_rule?.pattern_type !== "resolution-evidence-required") continue;
      if (rule.promoted_to_rule?.applies_to_resolution !== id) continue;
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

    // Cascade branch: only when entry is expired AND cascade_from is provided
    if (entry.status === "expired" && cascade_from?.length > 0) {
      const result = await validateAndApplyCascade(root, entry, cascade_from, entries, resolution, resolved_by);
      appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_resolve", ...result });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    const now = new Date().toISOString();
    const patch = {
      status: "resolved",
      resolved_at: now,
      resolved_by,
      ...(resolution && { resolution }),
    };
    await updateEntry(root, id, patch);

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
 * Validate cascade children and apply the cascade resolution.
 * Each child must exist, have `reopens` containing the parent id, and be
 * in `active` or `resolved` status. Superseded children are rejected.
 *
 * Forward-compat note: if `expired` is deprecated, this cascade becomes
 * unreachable. Future migration path is to accept `stale` or remove.
 */
async function validateAndApplyCascade(root, parent, childIds, entries, resolution, resolvedBy) {
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
    if (child.status !== "active" && child.status !== "resolved") {
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
    return { resolved: false, reason: "cascade_child_not_found", id: parent.id, missing_ids: missingIds };
  }
  if (badChildren.length > 0) {
    const reason = badChildren[0].reason === "not_reopening"
      ? "cascade_child_not_reopening"
      : "cascade_child_unresolved";
    return { resolved: false, reason, id: parent.id, bad_children: badChildren };
  }

  // All children valid — apply the cascade
  const now = new Date().toISOString();
  const patch = {
    status: "resolved",
    resolved_at: now,
    resolved_by: resolvedBy,
    cascade_resolved_by: validChildren,
    ...(resolution && { resolution }),
  };
  await updateEntry(root, parent.id, patch);
  return {
    resolved: true,
    id: parent.id,
    status: "resolved",
    resolved_by: resolvedBy,
    cascade_resolved_by: validChildren,
    ...(resolution && { resolution }),
  };
}
