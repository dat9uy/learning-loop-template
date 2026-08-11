import { z } from "zod";
import { readRegistry } from "../../core/meta-state.js";
import { applyUpdateAndCheck } from "../../core/update-entry-helpers.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { loadPromotedRules, checkResolutionEvidence } from "../../core/gate-logic.js";

// TERMINAL_STATUSES collapses to {resolved, accepted}
// (`superseded` was folded into `resolved` + a citation row).
// `archived` is runtime-applied and excluded from the short-circuit (an
// already-archived entry is filtered upstream by the entry_kind check; this set
// only gates the resolved/accepted branch).
const TERMINAL_STATUSES = new Set(["resolved", "accepted"]);

export const metaStateResolveTool = {
  name: "meta_state_resolve",
  description: "Mark a meta-state finding resolved. This is the ONLY closure option to offer — there is no separate `supersede` choice. `meta_state_supersede` is an internal resolve flavor that additionally emits a change-log citation row; it is never an agent-offered alternative. Only finding entries can be resolved; rules, designs, and change-logs are rejected. Resolution evidence is gate-checked. The `cascade_from` writer was removed — new cascades cannot be initiated; close a stale parent by calling meta_state_resolve on it directly. The `reopens` field + read path are retained for the 17 historical edges.",
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

    // The cascade branch was removed. The cascade was the one mutation
    // that un-closed a record as a side-effect of opening another. New
    // cascades cannot be initiated; closing a stale parent is now an
    // explicit `meta_state_resolve` on the parent. The 17 historical
    // edges + the read path are retained for historical reads via
    // `meta_state_relationship_validate`.

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
