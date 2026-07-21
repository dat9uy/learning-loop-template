import { z } from "zod";
import { stripEnvelope } from "../../core/envelope-stripper.js";
import { strictBooleanGuard } from "../../core/strict-boolean-guard.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { readRegistry, archiveEntry } from "../../core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";
import { isOpen } from "../../core/stale-view.js";

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
  // Plan 260707-0812 Phase 2 (red-team H1): the decision rule keys on `isOpen`
  // (covers open/active/reported/stale) plus age. The `!entry.acked_at` check
  // is removed — `acked_at` is gone with `meta_state_ack`, and without it
  // `undefined` would mass-archive legacy entries without `acked_at` set.
  //
  // Rule 1: isOpen AND age > 30d, measured from the freshness reference time
  // (`last_verified_at` || `created_at`). Using `last_verified_at` when present
  // keeps an open finding that was re-verified recently out of the archive set
  // even when it was created >30d ago — the post-collapse freshness model
  // centers on `last_verified_at` (the same field `isStaleView`/`re_verify`
  // use), so the archive rule must not contradict it by keying on `created_at`
  // alone.
  if (isOpen(entry)) {
    const ref = entry.last_verified_at || entry.created_at;
    if (ref) {
      const ageMs = Date.now() - new Date(ref).getTime();
      if (ageMs > 30 * 24 * 60 * 60 * 1000) return true;
    }
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
  description: "Archive old or explicitly overridden findings; multi-id overrides require preview then confirm:true.",
  schema: {
    candidates: z.preprocess(stripEnvelope, z.array(z.string())).default([])
      .describe("Candidate finding ids; empty means evaluate the registry."),
    override: z.preprocess(stripEnvelope, z.array(z.string())).default([])
      .describe("Finding ids to force-archive."),
    reason: z.string().optional()
      .describe("Archive reason."),
    confirm: z.union([z.boolean(), z.string()]).transform(strictBooleanGuard).optional()
      .describe("Confirm a multi-id override after preview."),
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

    const targets = collectTargets(allEntries, candidates, override);
    const result = await archiveTargets(root, allEntries, targets, reason);

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "meta_state_archive",
      archived_count: result.archived.length,
      already_archived_count: result.already_archived.length,
      not_found_count: result.not_found.length,
      rejected_count: result.rejected.length,
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify(result),
      }],
    };
  },
};

// Build the set of entry ids to archive: the decision-rule picks on the
// candidate pool (or the full registry when no candidates given), plus every
// id in the operator override. The bulk override guard above is independent
// and runs before this.
function collectTargets(allEntries, candidates, override) {
  const targets = new Set();
  const rulePool = candidates.length > 0
    ? allEntries.filter((e) => candidates.includes(e.id))
    : allEntries;
  for (const entry of rulePool) {
    if (ARCHIVE_DECISION_RULE(entry)) targets.add(entry.id);
  }
  for (const id of override) targets.add(id);
  return targets;
}

// Walk the target ids, classify each by current registry state, and dispatch
// the actual archive write. Returns the per-bucket tallies the handler logs.
async function archiveTargets(root, allEntries, targets, reason) {
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
  return { archived, already_archived, not_found, rejected };
}
