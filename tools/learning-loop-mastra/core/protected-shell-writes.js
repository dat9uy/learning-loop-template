// protected-shell-writes.js — pure Protected Shell Writes policy module.
//
// Owns protected-path classification, current Runtime Topology-derived patterns
// (preflight markers + decision log), marker exceptions (the runtime-state-edit
// preflight marker), trusted decision-log writers (the bash-gate evaluator hook is
// the only legitimate producer), compound-command masking defense (an exempted
// runtime-state write must not mask a chained records/meta-state/runtime-tracking
// or decision-log write), and exact reason selection. It consumes an interpreted
// command/context and returns the existing decision shape or `null` when no
// protected-path candidate exists — it does NOT own the final precedence fold
// (that stays with the gate evaluator, which combines hardened constraints,
// protected-path, and promoted-rule results).
//
// This is a gate/action-boundary policy, not a Rule authority, and it makes no
// registry mutations. Runtime Topology remains the source of surface names; the
// patterns here are derived from SURFACES so they cannot drift when a runtime is
// added or removed.

import { normalizeQuoteConcatenation } from "./blanking.js";
import { PARTICIPANT_SURFACES, SURFACES } from "./surfaces.js";
import { hasSurfacePreflightMarker } from "./runtime-tracking.js";

// Active patterns come from Runtime Topology through PARTICIPANT_SURFACES.
// SURFACES contributes only the transitional storage compatibility view so
// existing protected paths remain fail-closed until the cleanup ticket removes
// the retired runtime surfaces.
export const PROTECTED_SURFACES = Object.freeze([
  ...new Set([...PARTICIPANT_SURFACES, ...SURFACES]),
]);

// Escape regex metacharacters in a literal path segment. Surface names start
// with ".", which is a regex metachar, so it must be escaped to match literally.
function escapeForRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Preflight-marker path-write patterns, derived from the participant catalog
// plus the transitional storage view so every known runtime
// surface's coordination/.loop-preflight-* redirect is detected without
// hand-rolling per-surface regex literals. Two forms per surface: shell redirect
// (`>`/`>>`) and `tee`. Built once at module load.
function preflightMarkerPatterns() {
  return PROTECTED_SURFACES.flatMap((surface) => {
    const seg = escapeForRegex(surface);
    return [
      new RegExp(`>{1,2}\\s*["']?\\.?\\/?${seg}\\/coordination\\/\\.loop-preflight-[^\\s"';&|]+["']?`),
      new RegExp(`\\btee\\b.*["']?\\.?\\/?${seg}\\/coordination\\/\\.loop-preflight-[^\\s"';&|]+["']?`),
    ];
  });
}

// Decision-log path-write patterns, derived from the participant catalog plus
// the transitional storage view so every known runtime
// surface's coordination/.gate-decision.log redirect (`>`/`>>`), `tee` append,
// AND non-redirect file-writing verbs (cp/mv/dd/install/rsync) are detected.
// This is the trusted-producer boundary for the decision log: the ONLY
// legitimate writer is the bash-gate evaluator hook's `appendDecisionLog` node
// call (a spawned process, not a bash command), so an agent bash command must
// never be able to append or overwrite a forged JSONL row carrying
// `event_source:"bash-gate-evaluator"` + `candidate_kind:"unexpected-match"`.
function decisionLogPathPatterns() {
  return PROTECTED_SURFACES.flatMap((surface) => {
    const seg = escapeForRegex(surface);
    // The decision log is the trusted-producer boundary: the ONLY legitimate
    // writer is the bash-gate evaluator hook's `appendDecisionLog` node call,
    // so ANY agent shell write to a surface's coordination/.gate-decision.log
    // must be blocked, regardless of path spelling. The prefix before the
    // surface segment is deliberately loose (`[^\\s"';&|]*`) so `./.claude/…`,
    // `/.claude/…`, `.//.claude//…`, and an absolute `/repo/.claude/…` all
    // match; the anchor is the surface + coordination + filename, not the path
    // head. `seg` is already escaped for regex. Accepted limitation: a filename
    // that merely BEGINS with `.gate-decision.log` (e.g.
    // `.gate-decision.log.backup`) also matches — fail-closed over-match, no
    // bypass.
    //
    // cp/mv/install/rsync take the destination as a trailing argument (no
    // redirect operator), and `dd of=` writes without `>`/`tee`, so the
    // redirect/tee patterns alone leave a forging seam. The verb patterns
    // over-match on purpose (a log path appearing as a cp SOURCE also blocks)
    // — fail-closed, matching the redirect/tee over-match philosophy above. The
    // decision log is not operator-maintained, so blocking shell verbs that touch
    // it at all is the safe direction.
    const logTail = `${seg}\\/+coordination\\/+\\.gate-decision\\.log["']?`;
    return [
      new RegExp(`>{1,2}\\s*["']?[^\\s"';&|]*${logTail}`),
      new RegExp(`\\btee\\b[^;&|]*["']?[^\\s"';&|]*${logTail}`),
      new RegExp(`\\b(?:cp|mv|install|rsync)\\b[^;&|]*["']?[^\\s"';&|]*${logTail}`),
      new RegExp(`\\bdd\\b[^;&|]*\\bof=["']?[^\\s"';&|]*${logTail}`),
    ];
  });
}

// Built once at module load so the gate helper and PATH_WRITE_PATTERNS share
// the same per-surface patterns.
export const DECISION_LOG_WRITE_PATTERNS = decisionLogPathPatterns();

// Runtime-state path-write patterns (shell redirect + tee to
// runtime-state.jsonl and the session-local substrate). Split out of the
// shared records block so the bash gate can exempt these matches when an
// active `.loop-preflight-runtime-state-edit` marker is present. The local
// substrate is protected by the SAME marker class as the committed file:
// both are the "runtime-state row maintenance" surface, and the marker is
// operator-intentional (30-min TTL).
const RUNTIME_STATE_WRITE_PATTERNS = [
  />{1,2}\s*["']?\.?\/?runtime-state\.jsonl["']?/,
  /\btee\b.*["']?\.?\/?runtime-state\.jsonl["']?/,
  />{1,2}\s*["']?\.?\/?\.loop\/runtime-state-local\.jsonl["']?/,
  /\btee\b.*["']?\.?\/?\.loop\/runtime-state-local\.jsonl["']?/,
];

// Path-write detection patterns (bash-specific).
// Preflight-marker patterns are derived from SURFACES (all runtime surfaces).
// runtime-state patterns are named so the policy can exempt them when the
// `.loop-preflight-runtime-state-edit` marker is active.
export const PATH_WRITE_PATTERNS = [
  />{1,2}\s*["']?\.?\/?records\/[^\s"';&|]+["']?/,
  /<<['"]?\w+['"]?\s*>\s*["']?\.?\/?records\//,
  /\btee\b.*["']?\.?\/?records\/[^\s"';&|]+["']?/,
  ...preflightMarkerPatterns(),
  ...decisionLogPathPatterns(),
  />{1,2}\s*["']?\.?\/?meta-state\.jsonl["']?/,
  /\btee\b.*["']?\.?\/?meta-state\.jsonl["']?/,
  ...RUNTIME_STATE_WRITE_PATTERNS,
  />{1,2}\s*["']?\.?\/?\.loop\/runtime-tracking\.json["']?/,
  /\btee\b.*["']?\.?\/?\.loop\/runtime-tracking\.json["']?/,
];

// Self-remediating? No — the decision log is NOT operator-maintained. It is
// produced exclusively by the bash-gate evaluator hook (`appendDecisionLog`
// node call, spawned as a process that bypasses the bash gate). Appending a
// forged row via shell would let a command fabricate an
// `event_source:"bash-gate-evaluator"` + `candidate_kind:"unexpected-match"`
// row that the recurrence tracker trusts — so direct shell writes are blocked
// with a dedicated reason (mirroring the runtime-state path-write pattern).
export const DECISION_LOG_WRITE_REASON =
  "Direct shell writes to .gate-decision.log are blocked. The decision log is produced by the bash-gate evaluator hook; appending forged rows is prohibited.";

// Every gated path-write EXCEPT runtime-state.jsonl. Evaluated independently
// of the runtime-state branch below so that a runtime-state match covered by
// an active preflight marker cannot mask a records/**, meta-state.jsonl,
// preflight-marker, or runtime-tracking write chained into the same command
// (`echo ok > runtime-state.jsonl && echo evil > records/x.md`).
const NON_RUNTIME_STATE_PATH_WRITE_PATTERNS = PATH_WRITE_PATTERNS.filter(
  (p) => !RUNTIME_STATE_WRITE_PATTERNS.includes(p),
);

// Self-remediating block reason for observation-gated constraints lives with the
// bash evaluator (gate-verb remediation references CLI calls, not shell-write
// policy). The protected-write reasons are the dedicated ones below.

const RUNTIME_STATE_WRITE_REASON =
  "Direct shell writes to runtime-state.jsonl / .loop/runtime-state-local.jsonl are gated. Use gate_mark_preflight(surface:'runtime-state-edit') to unlock row maintenance for 30 minutes, then log the change with meta_state_log_change. New rows still go through runtime_state_record (append-only).";

const RECORDS_WRITE_REASON =
  "Direct writes to records/ are blocked. Use MCP tools (create_decision_record, create_experiment_record, create_risk_record, record_observation, etc.) to create/update records.";

// The edit-marker exemption. New rows still go through runtime_state_record
// (append-only); this marker unlocks ONLY direct row maintenance so routine
// appends do not keep the direct-write gate warm.
const RUNTIME_STATE_EDIT_MARKER = ".loop-preflight-runtime-state-edit";

// True when a runtime-state path-write pattern matches the command (redirect
// or tee to runtime-state.jsonl). Used by the policy to gate the preflight
// exemption on a runtime-state-specific match — so an active marker does NOT
// bleed into records/**, meta-state.jsonl, or runtime-tracking.json.
function commandWritesToRuntimeState(command) {
  if (!command || typeof command !== "string") return false;
  return RUNTIME_STATE_WRITE_PATTERNS.some((p) => p.test(command));
}

// True when a decision-log path-write pattern matches the command (redirect,
// append, or tee to any surface's .gate-decision.log). This is the
// trusted-producer boundary; a match gets a dedicated block reason rather than
// falling through to the generic records/ reason.
function commandWritesToDecisionLog(command) {
  if (!command || typeof command !== "string") return false;
  return DECISION_LOG_WRITE_PATTERNS.some((p) => p.test(command));
}

// True when any non-runtime-state gated path pattern matches (records/**,
// meta-state.jsonl, preflight markers, runtime-tracking.json). Evaluated
// independently of the runtime-state branch so an exempted runtime-state write
// cannot mask a chained gated write (compound-command masking defense).
function commandWritesToGatedPath(command) {
  if (!command || typeof command !== "string") return false;
  return NON_RUNTIME_STATE_PATH_WRITE_PATTERNS.some((p) => p.test(command));
}

/**
 * Protected Shell Writes policy — subject-level command interface.
 *
 * Consumes an interpreted command/context and returns the existing block decision
 * shape for a protected shell write, or `null` when no protected-path candidate
 * applies. The evaluator owns the FINAL precedence fold: this policy returns a
 * candidate or no-candidate, never the combine-with-constraint/rule decision.
 *
 * Compound-command masking defense: the runtime-state check is evaluated first
 * and, when the edit marker unlocks it, does NOT short-circuit — so the
 * decision-log and records-class checks still run (the independent checks below
 * are the masking defense). Precedence within the protected-write family:
 * runtime-state reason > decision-log reason > records-class reason.
 *
 * @param {{ command: string|null|undefined, root: string }} params
 * @returns {{ decision: "block", reason: string, hard_block: true } | null}
 */
// fallow-ignore-next-line complexity -- three independent detection branches plus the marker exception form the masking-defense precedence; each is a preserved decision
export function evaluateProtectedShellWritePolicy({ command, root }) {
  if (!command || typeof command !== "string") return null;
  const quoteSafe = normalizeQuoteConcatenation(command);

  // A protected runtime-state write is exempted ONLY when the dedicated edit
  // marker is active. Critical: the exemption must NOT short-circuit the rest of
  // this function — the decision-log and records-class checks below still need
  // to run, otherwise an exempted runtime-state write chained to a records/**
  // write would pass (compound-command masking defense).
  if (commandWritesToRuntimeState(quoteSafe) && !hasSurfacePreflightMarker(root, RUNTIME_STATE_EDIT_MARKER)) {
    return {
      decision: "block",
      reason: RUNTIME_STATE_WRITE_REASON,
      hard_block: true,
    };
  }

  // Decision-log writes get a DEDICATED reason (not the records/ reason):
  // checked before the generic gated-path check since the log is produced ONLY
  // by the bash-gate evaluator hook, so a shell append is forging rows.
  if (commandWritesToDecisionLog(quoteSafe)) {
    return { decision: "block", reason: DECISION_LOG_WRITE_REASON, hard_block: true };
  }

  if (commandWritesToGatedPath(quoteSafe)) {
    return { decision: "block", reason: RECORDS_WRITE_REASON, hard_block: true };
  }

  return null;
}
