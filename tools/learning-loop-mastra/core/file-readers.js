/**
 * File readers for constraint gate — reads observation YAML files and budget YAML files.
 * All readers are fail-open: return empty defaults on error.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertinvariantSync } from "./operation-invariant.js";

const AFFECTED_SYSTEM_TO_CONSTRAINTS = {
  vnstock: ["vendor-api", "package-manager"],
};

/**
 * Resolve project root from this file's location.
 * tools/learning-loop-mcp/core/file-readers.js → ../../
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
 * Fail-open: returns [] on error or malformed lines.
 *
 * Plan 260712-0724 (Implementation 3): active entries whose affected_system
 * is NOT in AFFECTED_SYSTEM_TO_CONSTRAINTS no longer silently drop. The
 * universal `assertinvariant` wrapper at the lookup step emits a structured
 * failure via gate-log AND pushes an observation with
 * `constraint_type: "unmapped-active-entry"` so downstream consumers see the
 * drift. Closes finding `meta-260630T2110Z`.
 */
// fallow-ignore-next-line complexity
export function readRuntimeObservations(root) {
  const resolvedRoot = root || resolveRoot();
  const sidecarPath = join(resolvedRoot, "runtime-state.jsonl");
  try {
    const raw = readFileSync(sidecarPath, "utf8");
    const lines = raw.split("\n").filter((line) => line.trim() !== "");
    const observations = [];
    for (const line of lines) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue; // skip malformed lines
      }
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
