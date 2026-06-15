import { appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { readDecisionLog } from "./gate-decision-log.js";
import { readRegistry } from "./meta-state.js";
import { slugify } from "./slugify.js";

const RECURRENCE_THRESHOLD_N = 3;
const RECURRENCE_WINDOW_MS = 10 * 60 * 1000;
const COMMAND_PREFIX_MAX_LEN = 50;

/**
 * Normalize a command prefix for grouping.
 * First 50 chars; remove single + double quotes; collapse whitespace.
 *
 * @param {string} command
 * @returns {string}
 */
export function normalizePrefix(command) {
  if (typeof command !== "string") return "";
  return command
    .slice(0, COMMAND_PREFIX_MAX_LEN)
    .replace(/['"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find all (rule_id, command_prefix_normalized) groups that exceed the
 * threshold within the configured window.
 *
 * @param {string} root
 * @param {object} options
 * @param {number} options.threshold
 * @param {number} options.windowMs
 * @returns {Array}
 */
export function findRecurrentGroups(root, options = {}) {
  const threshold = options.threshold ?? RECURRENCE_THRESHOLD_N;
  const windowMs = options.windowMs ?? RECURRENCE_WINDOW_MS;
  const sinceTs = Date.now() - windowMs;

  const allEntries = readDecisionLog(root, { since: new Date(sinceTs).toISOString() });

  /** @type {Map<string, Array>} */
  const groups = new Map();
  for (const entry of allEntries) {
    if (!entry.rule_id) continue;
    const key = `${entry.rule_id}::${normalizePrefix(entry.command_prefix)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  const recurrent = [];
  for (const [key, entries] of groups) {
    if (entries.length >= threshold) {
      const [rule_id, command_prefix_normalized] = key.split("::");
      recurrent.push({
        rule_id,
        command_prefix_normalized,
        count: entries.length,
        first_ts: entries[0].ts,
        last_ts: entries[entries.length - 1].ts,
        sample_commands: entries.slice(0, 3).map((e) => e.command_prefix),
      });
    }
  }
  return recurrent;
}

function generateFindingId(prefix) {
  const ts = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 15);
  const suffix = `${slugify(prefix)}-${randomBytes(4).toString("hex")}`;
  return `meta-${ts}Z-${suffix}`;
}

/**
 * Check for recurrent groups and auto-file findings (deduped against existing).
 * Returns { checked_groups, findings_emitted, recurrent }.
 *
 * @param {string} root
 * @param {object} options
 * @returns {{ checked_groups: number, findings_emitted: number, recurrent: Array }}
 */
export function checkAndEmit(root, options = {}) {
  const recurrent = findRecurrentGroups(root, options);

  const existing = readRegistry(root).filter(
    (e) =>
      e.entry_kind === "finding"
      && e.subtype === "recurring-false-positive"
      && (e.status === "active" || e.status === "reported")
      && e.recurrence_key,
  );
  const existingKeys = new Set(existing.map((e) => e.recurrence_key));
  const fresh = recurrent.filter(
    (g) => !existingKeys.has(`${g.rule_id}::${g.command_prefix_normalized}`),
  );

  const dryRun = process.env.GATE_RECURSION_DRY_RUN === "1";
  if (!dryRun) {
    for (const group of fresh) {
      const durationMin = Math.round(
        (new Date(group.last_ts).getTime() - new Date(group.first_ts).getTime()) / 60000,
      );
      const finding = {
        id: generateFindingId(group.command_prefix_normalized),
        entry_kind: "finding",
        category: "gate-logic-bug",
        severity: "warning",
        affected_system: "gate-logic",
        subtype: "recurring-false-positive",
        recurrence_key: `${group.rule_id}::${group.command_prefix_normalized}`,
        description:
          `Pattern recurred ${group.count} times in ${durationMin}min: ${group.rule_id} + "${group.command_prefix_normalized}". ` +
          `First: ${group.first_ts}. Last: ${group.last_ts}. Samples: ${group.sample_commands.join(" | ")}`,
        evidence_code_ref: "tools/learning-loop-mcp/core/recurrence-tracker.js",
        mechanism_check: true,
        status: "reported",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
      appendFileSync(join(root, "meta-state.jsonl"), JSON.stringify(finding) + "\n", "utf8");
    }
  }

  return {
    checked_groups: recurrent.length,
    findings_emitted: dryRun ? 0 : fresh.length,
    recurrent,
  };
}
