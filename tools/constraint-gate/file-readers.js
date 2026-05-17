/**
 * File readers for constraint gate — reads coordination config,
 * observation YAML files, and budget YAML files.
 * All readers are fail-open: return empty defaults on error.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

/**
 * Resolve project root from this file's location.
 * tools/constraint-gate/file-readers.js → ../../
 */
function resolveRoot() {
  return dirname(dirname(dirname(fileURLToPath(import.meta.url))));
}

/**
 * Read coordination-config.json. Returns parsed object or {} on error.
 */
export function readCoordinationConfig(root) {
  const configPath = join(root || resolveRoot(), ".claude", "coordination", "coordination-config.json");
  try {
    return JSON.parse(readFileSync(configPath, "utf8"));
  } catch (err) {
    console.error(`gate: failed to read coordination config: ${err.message}`);
    return {};
  }
}

/**
 * Read all observation YAML files from records/observations/.
 * Uses uniqueKeys: false to tolerate duplicate YAML keys.
 * Returns array of parsed observations, or [] on error.
 */
export function readObservations(root) {
  const obsDir = join(root || resolveRoot(), "records", "observations");
  try {
    const files = readdirSync(obsDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
    const observations = [];
    for (const file of files) {
      try {
        const content = readFileSync(join(obsDir, file), "utf8");
        const parsed = parseYaml(content, { uniqueKeys: false });
        if (parsed && typeof parsed === "object") {
          observations.push(parsed);
        }
      } catch (err) {
        console.error(`gate: failed to parse observation ${file}: ${err.message}`);
      }
    }
    return observations;
  } catch (err) {
    console.error(`gate: failed to read observations dir: ${err.message}`);
    return [];
  }
}

/**
 * Read budget YAML files (*-resource-budget.yaml) from records/observations/.
 * Returns array of parsed budgets, or [] on error.
 */
export function readBudgets(root) {
  const obsDir = join(root || resolveRoot(), "records", "observations");
  try {
    const files = readdirSync(obsDir).filter((f) => f.endsWith("-resource-budget.yaml"));
    const budgets = [];
    for (const file of files) {
      try {
        const content = readFileSync(join(obsDir, file), "utf8");
        const parsed = parseYaml(content, { uniqueKeys: false });
        if (parsed && typeof parsed === "object") {
          budgets.push(parsed);
        }
      } catch (err) {
        console.error(`gate: failed to parse budget ${file}: ${err.message}`);
      }
    }
    return budgets;
  } catch (err) {
    console.error(`gate: failed to read budgets dir: ${err.message}`);
    return [];
  }
}
