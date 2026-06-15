import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { SURFACES } from "./surfaces.js";

const DECISION_LOG_FILE = ".gate-decision.log";
const COMMAND_PREFIX_MAX_LEN = 80;

function oneLinePrefix(prefix) {
  if (typeof prefix !== "string") return "";
  return prefix
    .slice(0, COMMAND_PREFIX_MAX_LEN)
    .replace(/[\r\n\t]+/g, " ")
    .trim();
}

/**
 * Append one entry to the cross-surface decision log.
 * Uses appendFileSync per surface for true append semantics.
 * Cross-surface writes are sequential and best-effort: one surface failure
 * does not abort the others. Fail-open: errors are swallowed and logged to
 * stderr so the failure is visible without breaking the gate's contract.
 *
 * @param {string} root
 * @param {object} entry
 */
export function appendDecisionLog(root, entry) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    command_prefix: oneLinePrefix(entry.command_prefix),
    rule_id: entry.rule_id ?? null,
    decision: entry.decision,
    reason: entry.reason,
    matched_pattern: entry.matched_pattern ?? null,
    skipped_via_override: entry.skipped_via_override ?? false,
  });

  for (const surface of SURFACES) {
    const path = join(root, surface, "coordination", DECISION_LOG_FILE);
    try {
      mkdirSync(dirname(path), { recursive: true });
      appendFileSync(path, `${line}\n`, "utf8");
    } catch (err) {
      // Fail-open: the gate's contract is the exit code, not the audit log.
      console.error(`gate-decision-log: append to ${path} failed: ${err.message}`);
    }
  }
}

function parseLogLines(result) {
  if (!result || typeof result.content !== "string") return [];
  return result.content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function readAllLogContents(root) {
  const contents = [];
  for (const surface of SURFACES) {
    const path = join(root, surface, "coordination", DECISION_LOG_FILE);
    try {
      if (!existsSync(path)) continue;
      contents.push({ surface, content: readFileSync(path, "utf8") });
    } catch {
      // Best-effort per surface.
    }
  }
  return contents;
}

/**
 * Read the cross-surface decision log and return deduplicated entries.
 *
 * @param {string} root
 * @param {object} options
 * @param {string} options.since - ISO timestamp; only entries with ts >= since are returned
 * @returns {Array}
 */
export function readDecisionLog(root, options = {}) {
  const since = options.since ? new Date(options.since).getTime() : 0;
  const seen = new Set();
  const entries = [];

  for (const result of readAllLogContents(root)) {
    for (const entry of parseLogLines(result)) {
      if (since && new Date(entry.ts).getTime() < since) continue;
      const key = `${entry.ts}::${entry.command_prefix}::${entry.rule_id ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(entry);
    }
  }

  return entries.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
}
