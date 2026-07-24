/**
 * File readers for constraint gate — reads observation YAML files and budget YAML files.
 * All readers are fail-open: return empty defaults on error.
 */

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assertinvariantSync } from "./operation-invariant.js";
// Plan 260720-1112 Phase 1: consume the shared runtime-state read path so the
// sidecar parse is no longer forked (B-widening of plan 260719-2201). A
// "null" line (JSON.parse("null") → null) used to trip the outer try/catch
// and wipe the projection to []; now it's skipped at the parse layer
// (parsed → null, then .filter(Boolean)) and the projection only sees valid
// row objects.
import { readRuntimeStateRows } from "./runtime-state.js";

const AFFECTED_SYSTEM_TO_CONSTRAINTS = {
  vnstock: ["vendor-api", "package-manager"],
};

/**
 * Resolve project root from this file's location.
 * tools/learning-loop-mastra/core/file-readers.js → ../../../
 */
function resolveRoot() {
  return dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
}

/**
 * Read active runtime-state entries from runtime-state.jsonl and return
 * observation-shaped objects for constraint gate compatibility.
 *
 * Reverse mapping from affected_system → constraint_type:
 *   vnstock → ["vendor-api", "package-manager"]
 *
 * Each active entry yields one observation-shaped object per mapped constraint.
 * Fail-open: returns [] on error.
 *
 * Plan 260712-0724 (Implementation 3): active entries whose affected_system
 * is NOT in AFFECTED_SYSTEM_TO_CONSTRAINTS no longer silently drop. The
 * universal `assertinvariant` wrapper at the lookup step emits a structured
 * failure via gate-log AND pushes an observation with
 * `constraint_type: "unmapped-active-entry"` so downstream consumers see the
 * drift. Closes finding `meta-260630T2110Z`.
 *
 * Plan 260720-1112 Phase 1: parse moved to readRuntimeStateRows. The outer
 * try/catch is retained as defensive (verified that `assertinvariantSync`
 * cannot throw — it validates `root` upfront and returns {ok:false} on bad
 * root; the operation lambda only does property access on primitives which
 * returns undefined rather than throws). A future projection-body throw on a
 * row shape that passed .filter(Boolean) but is missing fields would
 * otherwise propagate uncaught into the bash + inbound gates.
 *
 * Plan 260724-1119 Phase 2 (R5): the kind+status filter is load-bearing.
 * `runtime-state.jsonl` mixes two row kinds — `ledger-event` (immutable
 * audit, out of the budget gate by kind) and `budget-state` (the tracking
 * lifecycle, `status: active` rows participate in the stale scan). The
 * `unmapped-active-entry` drift check fires ONLY for `kind: budget-state`
 * rows missing an `AFFECTED_SYSTEM_TO_CONSTRAINTS` mapping — ledger-event
 * rows are out by kind, so emitting a drift observation for them would
 * pollute the gate.
 */
// fallow-ignore-next-line complexity
export function readRuntimeObservations(root) {
  const resolvedRoot = root || resolveRoot();
  try {
    const rows = readRuntimeStateRows(resolvedRoot);
    const observations = [];
    for (const entry of rows) {
      // Plan 260724-1119 Phase 2 (R5): kind+status filter. Ledger-event
      // rows are out of scope by kind (concept boundary, not an exemption
      // the gate grants). Budget-state rows with non-active status are
      // also excluded — a paused or stopped surface's rows must not
      // surface as stale observations; the lifecycle excludes them, not
      // a gate filter applied after the fact.
      if (entry.kind !== "budget-state") continue;
      if (entry.status !== "active") continue;
      // Plan 260712-0724 (Implementation 3): universal `assertinvariantSync`
      // wrapper at the affected_system→constraints lookup. Pre-condition:
      // an active entry's affected_system MUST be in
      // AFFECTED_SYSTEM_TO_CONSTRAINTS — otherwise the lookup silently
      // produces no observations, hiding the schema-vs-implementation drift.
      // The wrapper fires BEFORE the inner push loop. On unmapped active
      // entries, a structured failure observation is added so downstream
      // consumers can flag the drift via the same constraint_type path.
      // Sync variant — the consumer (bash + inbound gates) is sync.
      const lookupResult = assertinvariantSync(
        () => ({ constraints: AFFECTED_SYSTEM_TO_CONSTRAINTS[entry.affected_system] }),
        {
          accept: {
            context: () => ({
              status: entry.status,
              affected_system: entry.affected_system,
              entry_id: entry.id,
            }),
            check: ({ status, affected_system }) =>
              status !== "active" ||
              AFFECTED_SYSTEM_TO_CONSTRAINTS[affected_system] !== undefined,
          },
          returnOnFail: {
            reason_code: "unmapped_active_entry",
            constraint_type: "unmapped-active-entry",
            affected_system: entry.affected_system,
            entry_id: entry.id,
          },
          root: resolvedRoot,
        }
      );
      const constraints = lookupResult.ok
        ? lookupResult.constraints
        : undefined;
      if (!constraints) {
        if (!lookupResult.ok) {
          observations.push({
            id: entry.id,
            status: entry.status,
            constraint_type: "unmapped-active-entry",
            constraint: "unmapped-active-entry",
            affected_system: entry.affected_system,
            updated_at: entry.timestamp,
            metadata: entry.metadata || {},
            escalation_reason: lookupResult.reason,
          });
        }
        continue;
      }
      for (const constraintType of constraints) {
        observations.push({
          id: entry.id,
          status: entry.status,
          constraint_type: constraintType,
          constraint: constraintType,
          affected_system: entry.affected_system,
          updated_at: entry.timestamp,
          metadata: entry.metadata || {},
        });
      }
    }
    return observations;
  } catch (err) {
    console.error(`gate: failed to read runtime-state.jsonl: ${err.message}`);
    return [];
  }
}
