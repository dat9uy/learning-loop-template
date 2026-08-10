/**
 * File readers for constraint gate — reads observation YAML files and budget YAML files.
 * All readers are fail-open: return empty defaults on error.
 */

import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertinvariantSync } from "./operation-invariant.js";
// Consume the shared runtime-state read path so the sidecar parse is no
// longer forked (B-widening of the runtime-state read extraction). A
// "null" line (JSON.parse("null") → null) used to trip the outer try/catch
// and wipe the projection to []; now it's skipped at the parse layer
// (parsed → null, then .filter(Boolean)) and the projection only sees valid
// row objects.
//
// the helper now dedups to max_by(version) per id
// (kind-before-collapse), so the projection emits one observation per
// (id × constraint) instead of one per RAW active row. `obs.updated_at` is
// now the authoritative per-surface-latest timestamp.
import {
  readRuntimeStateRows,
  collapseLatestBudgetStateById,
} from "./runtime-state.js";

const AFFECTED_SYSTEM_TO_CONSTRAINTS = {
  vnstock: ["vendor-api", "package-manager"],
  // Gate-verb observations: identity mapping so an operator can satisfy a
  // `gate-verb:<verb>` constraint by recording a runtime-state entry whose
  // affected_system names the constraint directly (e.g.
  // `runtime_state_record({affected_system: "gate-verb:bash", ...})`).
  // The verb set comes from patterns.json config — the same source the
  // gate matches against — so the observation path and the match path can
  // never drift apart.
  ...Object.fromEntries(
    (JSON.parse(
      readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), "patterns.json"),
        "utf8",
      ),
    )["gate-verbs"] || []).map((entry) => {
      const verb = typeof entry === "string" ? entry : entry.verb;
      const constraint = `gate-verb:${verb}`;
      return [constraint, [constraint]];
    }),
  ),
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
 * Active entries whose affected_system is NOT in
 * AFFECTED_SYSTEM_TO_CONSTRAINTS no longer silently drop. The
 * universal `assertinvariant` wrapper at the lookup step emits a structured
 * failure via gate-log AND pushes an observation with
 * `constraint_type: "unmapped-active-entry"` so downstream consumers see the
 * drift. Closes finding `meta-260630T2110Z`.
 *
 * The parse moved to readRuntimeStateRows. The outer try/catch is retained as
 * defensive (verified that `assertinvariantSync`
 * cannot throw — it validates `root` upfront and returns {ok:false} on bad
 * root; the operation lambda only does property access on primitives which
 * returns undefined rather than throws). A future projection-body throw on a
 * row shape that passed .filter(Boolean) but is missing fields would
 * otherwise propagate uncaught into the bash + inbound gates.
 *
 * The kind+status filter is load-bearing.
 * `runtime-state.jsonl` mixes two row kinds — `ledger-event` (immutable
 * audit, out of the budget gate by kind) and `budget-state` (the tracking
 * lifecycle, `status: active` rows participate in the stale scan). The
 * `unmapped-active-entry` drift check fires ONLY for `kind: budget-state`
 * rows missing an `AFFECTED_SYSTEM_TO_CONSTRAINTS` mapping — ledger-event
 * rows are out by kind, so emitting a drift observation for them would
 * pollute the gate.
 */
// fallow-ignore-next-line complexity -- collapse → per-row lifecycle/kind guard chain with the assertinvariantSync unmapped-active-entry invariant; branches are validation guards
export function readRuntimeObservations(root) {
  const resolvedRoot = root || resolveRoot();
  try {
// kind-before-collapse dedup so the projection
    // emits ONE observation per (id × constraint) = the latest max_by(version)
    // budget-state row. obs.updated_at is now the authoritative
    // per-surface-latest timestamp. The kind filter MUST happen BEFORE the
    // dedup so a canonical-id ledger-event cannot shadow a budget-state row
    // (see runtime-state.js#collapseLatestBudgetStateById; re-red-team F1).
    const rows = collapseLatestBudgetStateById(readRuntimeStateRows(resolvedRoot));
    const observations = [];
    for (const entry of rows) {
      // Lifecycle filter: paused / stopped / initial rows are out of scope.
      // The dedup above collapses to the LATEST row per id; that row must
      // still be active for its observation to surface. Consequence (intended):
      // a surface whose latest budget-state row is paused/stopped — e.g. after
      // runtime_state_pause appends a higher-version paused row under the
      // canonical id — projects NO observation, so checkObservationExists
      // returns not-found and makeGateDecision blocks the constraint. A
      // paused/stopped surface should not satisfy the "observation required"
      // constraint. (The inbound gate separately skips paused surfaces
      // upstream for staleness warnings; this is the bash-gate constraint
      // counterpart, not a contradiction.)
      if (entry.status !== "active") continue;
// universal `assertinvariantSync`
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
