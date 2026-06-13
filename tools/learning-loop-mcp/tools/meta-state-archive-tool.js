import { z } from "zod";
import { resolveRoot } from "#lib/resolve-root.js";
import { readRegistry, archiveEntry } from "#mcp/core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";

function buildPreview(allEntries, override) {
  return override.map((id) => {
    const entry = allEntries.find((e) => e.id === id);
    if (!entry) {
      return { id, entry_kind: null, status: "not_found" };
    }

    const preview = {
      id,
      entry_kind: entry.entry_kind,
      status: entry.status,
    };

    const desc = entry.description || "";
    preview.description_preview = desc.length > 200 ? desc.slice(0, 200) + "..." : desc;

    if (entry.status === "archived") {
      preview.already_archived = true;
    } else if (entry.entry_kind !== "finding") {
      preview.rejected_reason = "not_a_finding";
    }

    return preview;
  });
}

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
  description: "Archive findings to reduce registry size. Decision rule (NOT enforced, documented): archive entries that are (status=reported AND age > 30d AND not acked) OR (status=resolved AND resolved > 90d). Operator can override by passing override ids with a reason. Only entry_kind=finding can be archived; rules, change-logs, and loop-designs are rejected. Multi-id overrides require a preview/confirm step: pass override with more than one id to receive a preview, then call again with confirm: true to archive. Archived entries stay in meta-state.jsonl with status=archived, archived_at, archived_by, archived_reason fields. Default meta_state_list excludes archived; pass include_archived: true to include. Re-archiving is a no-op (returns already_archived).",
  schema: {
    candidates: z.array(z.string()).default([])
      .describe("Optional explicit list of entry ids to evaluate against the decision rule. If empty, the rule is applied to the entire registry."),
    override: z.array(z.string()).default([])
      .describe("Operator override: force-archive these specific ids regardless of the decision rule."),
    reason: z.string().optional()
      .describe("Default reason for archives triggered by the decision rule (used in archived_reason). Override ids use their own per-id reason."),
    confirm: z.boolean().optional()
      .describe("Confirm a multi-id override archive after reviewing the preview. Required when override has more than one id."),
  },
  handler: async ({ candidates = [], override = [], reason, confirm = false }) => {
    const root = resolveRoot();
    const allEntries = readRegistry(root);

    // Bulk override guard: require explicit confirmation before archiving more
    // than one operator-specified id. This forces the caller to review each
    // entry's entry_kind, status, and description before proceeding.
    if (override.length > 1 && !confirm) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ready: false,
            note: "Review the preview and pass confirm: true to proceed with the archive.",
            preview: buildPreview(allEntries, override),
          }),
        }],
      };
    }

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
    const rejected = [];
    for (const id of targets) {
      const entry = allEntries.find((e) => e.id === id);
      if (!entry) {
        not_found.push(id);
        continue;
      }
      if (entry.status === "archived") {
        already_archived.push(id);
        continue;
      }
      if (entry.entry_kind !== "finding") {
        rejected.push({ id, entry_kind: entry.entry_kind, reason: "not_a_finding" });
        continue;
      }
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
      rejected_count: rejected.length,
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ archived, already_archived, not_found, rejected }),
      }],
    };
  },
};
