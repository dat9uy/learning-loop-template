/**
 * File readers for constraint gate — reads observation YAML files and budget YAML files.
 * All readers are fail-open: return empty defaults on error.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

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
 */
// fallow-ignore-next-line complexity
export function readRuntimeObservations(root) {
  const sidecarPath = join(root || resolveRoot(), "runtime-state.jsonl");
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
      const constraints = AFFECTED_SYSTEM_TO_CONSTRAINTS[entry.affected_system];
      if (!constraints) continue;
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

/**
 * Read budget-state entries from runtime-state.jsonl.
 * Returns array of budget-shaped objects, or [] on error.
 */
// fallow-ignore-next-line complexity
function readRuntimeBudgets(root) {
  const sidecarPath = join(root || resolveRoot(), "runtime-state.jsonl");
  try {
    const raw = readFileSync(sidecarPath, "utf8");
    const lines = raw.split("\n").filter((line) => line.trim() !== "");
    const budgets = [];
    for (const line of lines) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry.kind === "budget-state") {
        budgets.push(entry);
      }
    }
    return budgets;
  } catch (err) {
    console.error(`gate: failed to read runtime-state budgets: ${err.message}`);
    return [];
  }
}
