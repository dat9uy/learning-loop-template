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
 * R6 hardening: the serialized line MUST NOT contain a
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
    session_id: entry.session_id ?? null,
    session_id_tier: entry.session_id_tier ?? null,
    // Optional evaluator-provenance fields (additive). Absent when not
    // provided, so old callers produce byte-identical lines and legacy rows
    // read back with the fields absent — the recurrence tracker treats
    // missing provenance as unclassified/telemetry-only.
    ...(entry.event_source !== undefined && { event_source: entry.event_source }),
    ...(entry.match_origin !== undefined && { match_origin: entry.match_origin }),
    ...(entry.candidate_kind !== undefined && { candidate_kind: entry.candidate_kind }),
    ...(entry.event !== undefined && { event: entry.event }),
    ...(entry.error_code !== undefined && { error_code: entry.error_code }),
  });

  if (line.includes("\n") || line.includes("\r")) {
    throw new Error("gate_log entry contains unescaped newline");
  }

  appendToAllSurfaces(root, DECISION_LOG_FILE, line);
}

/**
 * Read the cross-surface decision log and return deduplicated entries.
 *
 * Note: the recurrence tracker reads the full log (no `since` filter) and
 * relies on session-axis grouping + dedup. The `since` option is retained
 * for callers that genuinely need a time bound; callers SHOULD omit it for
 * scan-the-whole-log paths.
 *
 * @param {string} root
 * @param {object} options
 * @param {string} [options.since] - ISO timestamp; only entries with ts >= since are returned (default 0 = no filter)
 * @returns {Array}
 */
export function readDecisionLog(root, options = {}) {
  return readJsonlFromAllSurfaces(root, DECISION_LOG_FILE, {
    dedupe: true,
    since: options.since ?? 0,
    sort: "asc",
  });
}
