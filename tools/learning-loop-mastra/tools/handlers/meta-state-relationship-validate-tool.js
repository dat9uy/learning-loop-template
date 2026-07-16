import { z } from "zod";
import { readRegistry, readFileIndex } from "../../core/meta-state.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { isStaleView, computeCurrentHashes } from "../../core/stale-view.js";
import { appendGateLog } from "#lib/gate-logging.js";

const FINDING_ID_REGEX = /meta-\d{6}T\d{4}Z-[a-z0-9-]+/g;
// Plan 260707-0812 Phase 2 (red-team H2): ORPHAN_STATUSES was a literal Set
// over `status:"stale"`. Post-enum-collapse, `stale` is a derived view
// (`isStaleView`). The Set is replaced with a predicate: a referenced id is
// an orphan when the target is stale-view and not claimed in reopens.
// Legacy `stale` entries are tolerated by `isStaleView` pre-migration; this
// stays correct after the migration flips them to `open` (age + drift still
// surface stale-view).
function isOrphanStatus(entry, signals) {
  return isStaleView(entry, signals);
}

export const metaStateRelationshipValidateTool = {
  name: "meta_state_relationship_validate",
  description:
    "Read-only lint: scan a description for finding-id references and warn when any referenced " +
    "id is stale-view and the caller has not declared a structural field referencing it. " +
    "Use before meta_state_report to catch orphan cross-references early. " +
    "Returns { warned, orphans, unknown_refs, referenced, suggestion }. " +
    "Pure read; safe to call repeatedly. " +
    "Not for navigating existing relationships (use meta_state_relationships) or creating findings (use meta_state_report).",
  schema: {
    description: z.string().min(1).describe("The description text to lint for finding-id references."),
    entry_id: z.string().optional().describe("Optional id of an existing entry whose `reopens` field should be checked against the referenced ids."),
  },
  handler: async ({ description, entry_id }) => {
    const root = resolveRoot();
    const entries = readRegistry(root);

    // Plan 260716-0624 Phase 02: build drift signals (fileIndex + codeHashes)
    // so the orphan predicate can fire on drift, not just age. RT: M20 — log
    // non-"missing" skipped paths as a gate-log breadcrumb.
    const signals = buildStaleSignals(entries, root);

    const entryById = new Map(entries.map((e) => [e.id, e]));
    const referenced = Array.from(new Set(description.match(FINDING_ID_REGEX) ?? []));
    const claimed = collectClaimed(entryById.get(entry_id));
    const { orphans, unknown_refs } = classifyReferences(referenced, entryById, claimed, signals);

    const result = buildResult(orphans, unknown_refs, referenced);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};

function buildStaleSignals(entries, root) {
  const fileIndex = readFileIndex(root);
  const { ok: codeHashes, skipped } = computeCurrentHashes(entries, root);
  const gateLogTimestamp = new Date().toISOString();
  for (const s of skipped) {
    if (s.reason !== "missing") {
      appendGateLog(root, {
        timestamp: gateLogTimestamp,
        tool: "meta_state_relationship_validate",
        action: "compute_current_hash_skipped",
        canonical: s.canonical,
        reason: s.reason,
      });
    }
  }
  return { fileIndex, codeHashes };
}

// Resolve the `reopens` set on the optional `entry_id`. The new finding
// declares it via `reopens: [...]` so those ids are not orphans.
function collectClaimed(entry) {
  const claimed = new Set();
  if (!entry || !Array.isArray(entry.reopens)) return claimed;
  for (const id of entry.reopens) claimed.add(id);
  return claimed;
}

// Walk the referenced ids and bucket them: unknown (not in registry) vs orphan
// (stale-view AND not in the claimed set).
function classifyReferences(referenced, entryById, claimed, signals) {
  const orphans = [];
  const unknown_refs = [];
  for (const id of referenced) {
    const target = entryById.get(id);
    if (!target) {
      unknown_refs.push(id);
      continue;
    }
    if (isOrphanStatus(target, signals) && !claimed.has(id)) {
      orphans.push(id);
    }
  }
  return { orphans, unknown_refs };
}

// Assemble the wire result with the operator-facing suggestion text. The
// suggestion is the prescriptive next step (reopens on the new entry + a
// cascade-resolve on each stale parent).
function buildResult(orphans, unknown_refs, referenced) {
  const warned = orphans.length > 0 || unknown_refs.length > 0;
  const result = { warned, referenced };
  if (orphans.length > 0) result.orphans = orphans;
  if (unknown_refs.length > 0) result.unknown_refs = unknown_refs;
  if (orphans.length > 0) {
    result.suggestion = `Pass reopens: ${JSON.stringify(orphans)} on your meta_state_report call. ` +
      `Then call meta_state_resolve({ id: '<parent_id>', cascade_from: ['<new_finding_id>'] }) ` +
      `to close each stale parent in 1 step.`;
  } else if (unknown_refs.length > 0) {
    result.suggestion = `${unknown_refs.join(", ")} not in registry. Did you typo? If intentional, ignore.`;
  }
  return result;
}
