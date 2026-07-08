// consistency-check.js — Pure status/audit-field drift detector.
//
// Implements the remediation from finding meta-260614T1236Z
// (no automated registry consistency check exists). Detects drift
// between an entry's `status` field and its audit-trail fields
// (e.g., status=active must not carry resolved_at).
//
// Pure function: no I/O, no subprocess, no resolveRoot call. The tool
// layer (tools/handlers/meta-state-consistency-check-tool.js) is
// responsible for root resolution and registry reading.
//
// v1 invariant set: F-1, F-2, F-3, F-4, NEW-1. See plan
// 260626-1734-phase-e-registry-drift-fix/plan.md §Resolved Design
// Decisions (D1, D4).

export const META_STATE_CONSISTENCY_INVARIANTS = [
  { id: "F-1", status: "active", kind: "finding",
    forbid: ["resolved_at", "resolved_by", "resolution"] },
  { id: "F-2", status: "archived", kind: "finding",
    require: ["archived_at", "archived_by", "archived_reason"] },
  { id: "F-3", status: "resolved", kind: "finding",
    require: ["resolved_by"] },
  { id: "F-4", status: "superseded", kind: "finding",
    require: ["consolidated_into"] },
  { id: "NEW-1", status: "reported", kind: "finding",
    forbid: ["resolved_at", "resolved_by"] },
];

// null and undefined both count as "not set". Anything else (including
// empty string, 0, false) counts as set. This matches the schema's
// treatment of nullable fields (meta-state.js:99-103, resolved_at
// nullable etc.).
function isSet(v) {
  return v !== null && v !== undefined;
}

/**
 * Run the consistency check across a registry of entries.
 *
 * @param {Array<object>} entries — full registry (filter-agnostic;
 *   caller is responsible for pre-filtering, mirroring the SP3 contract
 *   at core/query-drift.js).
 * @returns {{ drift_count: number, drift_events: Array<{
 *   id: string, entry_kind: string, status: string,
 *   invariant_id: string, message: string,
 *   present_fields: string[]|null, missing_fields: string[]|null,
 *   forbidden_fields: string[]|null,
 * }> }}
 */
export function consistencyCheck(entries) {
  const drift_events = [];

  for (const entry of entries) {
    // v1 scope: finding + change-log only. Rule + loop-design branches
    // are deferred to v2 per plan D1.
    if (entry.entry_kind !== "finding" && entry.entry_kind !== "change-log") {
      continue;
    }

    for (const inv of META_STATE_CONSISTENCY_INVARIANTS) {
      // Each invariant targets a specific entry_kind + status pair.
      if (inv.kind !== entry.entry_kind) continue;
      if (inv.status !== entry.status) continue;

      // Check forbidden fields (status has fields it MUST NOT carry).
      if (inv.forbid) {
        const present = inv.forbid.filter((f) => isSet(entry[f]));
        if (present.length > 0) {
          drift_events.push({
            id: entry.id,
            entry_kind: entry.entry_kind,
            status: entry.status,
            invariant_id: inv.id,
            message: `${inv.id}: status=${entry.status} must not carry ${present.join(", ")}`,
            present_fields: present,
            missing_fields: null,
            forbidden_fields: present,
          });
        }
      }

      // Check required fields (status has fields it MUST carry).
      if (inv.require) {
        const present = inv.require.filter((f) => isSet(entry[f]));
        const missing = inv.require.filter((f) => !isSet(entry[f]));
        if (missing.length > 0) {
          drift_events.push({
            id: entry.id,
            entry_kind: entry.entry_kind,
            status: entry.status,
            invariant_id: inv.id,
            message: `${inv.id}: status=${entry.status} missing required fields: ${missing.join(", ")}`,
            present_fields: present,
            missing_fields: missing,
            forbidden_fields: null,
          });
        }
      }
    }
  }

  // Deterministic sort by (entry_kind, id, invariant_id) — covered by
  // the C-12 ordering test. localeCompare gives stable lexicographic
  // ordering across platforms (matches query-drift.js style).
  drift_events.sort((a, b) =>
    a.entry_kind.localeCompare(b.entry_kind) ||
    a.id.localeCompare(b.id) ||
    a.invariant_id.localeCompare(b.invariant_id)
  );

  return { drift_count: drift_events.length, drift_events };
}