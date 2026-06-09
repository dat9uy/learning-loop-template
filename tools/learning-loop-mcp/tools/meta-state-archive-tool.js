import { z } from "zod";
import { resolveRoot } from "#lib/resolve-root.js";
import { readRegistry, archiveEntry } from "#mcp/core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";

const ARCHIVE_DECISION_RULE = (entry) => {
  if (entry.status === "archived") return false;
  // Rule 1: reported > 30d AND not acked
  if (entry.status === "reported" && entry.created_at) {
    const ageMs = Date.now() - new Date(entry.created_at).getTime();
    if (ageMs > 30 * 24 * 60 * 60 * 1000 && !entry.acked_at) return true;
  }
  // Rule 2: resolved > 90d
  if (entry.status === "resolved" && entry.resolved_at) {
    const ageMs = Date.now() - new Date(entry.resolved_at).getTime();
    if (ageMs > 90 * 24 * 60 * 60 * 1000) return true;
  }
  return false;
};

export const metaStateArchiveTool = {
  name: "meta_state_archive",
  description: "Archive findings to reduce registry size. Decision rule (NOT enforced, documented): archive entries that are (status=reported AND age > 30d AND not acked) OR (status=resolved AND resolved > 90d). Operator can override by passing override ids with a reason. Archived entries stay in meta-state.jsonl with status=archived, archived_at, archived_by, archived_reason fields. Default meta_state_list excludes archived; pass include_archived: true to include. Re-archiving is a no-op (returns already_archived).",
  schema: {
    candidates: z.array(z.string()).default([])
      .describe("Optional explicit list of entry ids to evaluate against the decision rule. If empty, the rule is applied to the entire registry."),
    override: z.array(z.string()).default([])
      .describe("Operator override: force-archive these specific ids regardless of the decision rule."),
    reason: z.string().optional()
      .describe("Default reason for archives triggered by the decision rule (used in archived_reason). Override ids use their own per-id reason."),
  },
  handler: async ({ candidates = [], override = [], reason }) => {
    const root = resolveRoot();
    const allEntries = readRegistry(root);
    const targets = new Set();

    const rulePool = candidates.length > 0
      ? allEntries.filter((e) => candidates.includes(e.id))
      : allEntries;
    for (const entry of rulePool) {
      if (ARCHIVE_DECISION_RULE(entry)) targets.add(entry.id);
    }

    for (const id of override) targets.add(id);

    const archived = [];
    const already_archived = [];
    const not_found = [];
    for (const id of targets) {
      const result = await archiveEntry(root, id, reason ?? "decision_rule_or_override", "operator");
      if (result.archived) archived.push({ id, archived_at: result.archived_at });
      else if (result.reason === "already_archived") already_archived.push(id);
      else if (result.reason === "not_found") not_found.push(id);
    }

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "meta_state_archive",
      archived_count: archived.length,
      already_archived_count: already_archived.length,
      not_found_count: not_found.length,
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ archived, already_archived, not_found }),
      }],
    };
  },
};
