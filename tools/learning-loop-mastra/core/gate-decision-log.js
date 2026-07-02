import { join } from "node:path";
import { appendToAllSurfaces, readJsonlFromAllSurfaces } from "./surfaces.js";

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
 * Uses appendToAllSurfaces for true append semantics across all runtimes.
 * Cross-surface writes are sequential and best-effort: one surface failure
 * does not abort the others. Fail-open: errors are swallowed and logged to
 * stderr so the failure is visible without breaking the gate's contract.
 *
 * R6 hardening (Plan 5-Lite Phase 3): the serialized line MUST NOT contain a
 * raw `\n` or `\r` — a malicious entry could otherwise inject a forged line
 * into the JSONL log. `oneLinePrefix` strips residual newlines from
 * `command_prefix`; the assertion below is a belt-and-suspenders guard that
 * throws BEFORE the line reaches `appendToAllSurfaces` if any raw newline
 * survives serialization (e.g., via a field added in the future).
 *
 * @param {string} root
 * @param {object} entry
 * @throws {Error} if the serialized line contains a raw `\n` or `\r`.
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

  if (line.includes("\n") || line.includes("\r")) {
    throw new Error("gate_log entry contains unescaped newline");
  }

  appendToAllSurfaces(root, DECISION_LOG_FILE, line);
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
  return readJsonlFromAllSurfaces(root, DECISION_LOG_FILE, {
    dedupe: true,
    since: options.since ?? 0,
    sort: "asc",
  });
}
