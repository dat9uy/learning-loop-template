/**
 * Bash-gate evaluator. Combines constraint-pattern, path-write, and promoted-rules checks.
 *
 * @param {{ command: string, root?: string }} params
 * @returns {{ decision: string, reason?: string, hard_block?: boolean, constraint_type?: string, rule_id?: string, pattern_type?: string }}
 */

import {
  matchConstraintPattern,
  matchGateVerb,
  checkObservationExists,
  makeGateDecision,
  findProjectRoot,
  normalizeQuoteConcatenation,
  loadGroundedPromotedRules,
} from "./gate-logic.js";
import { evaluateI3CommandPolicy } from "./promoted-rule-policy.js";
import { readRuntimeObservations } from "./file-readers.js";
import { checkObservationStaleness } from "./inbound-state.js";
import { isObservationStaleByAge } from "./observation-staleness.js";
import { hasSurfacePreflightMarker } from "./runtime-tracking.js";
import { SURFACES } from "./surfaces.js";

// Escape regex metacharacters in a literal path segment. Surface names start
// with ".", which is a regex metachar, so it must be escaped to match literally.
function escapeForRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Preflight-marker path-write patterns, derived from SURFACES so every runtime
// surface's coordination/.loop-preflight-* redirect is detected without
// hand-rolling per-surface regex literals. Two forms per surface: shell redirect
// (`>`/`>>`) and `tee`. Built once at module load.
function preflightMarkerPatterns() {
  return SURFACES.flatMap((surface) => {
    const seg = escapeForRegex(surface);
    return [
      new RegExp(`>{1,2}\\s*["']?\\.?\\/?${seg}\\/coordination\\/\\.loop-preflight-[^\\s"';&|]+["']?`),
      new RegExp(`\\btee\\b.*["']?\\.?\\/?${seg}\\/coordination\\/\\.loop-preflight-[^\\s"';&|]+["']?`),
    ];
  });
}

// Decision-log path-write patterns, derived from SURFACES so every runtime
// surface's coordination/.gate-decision.log redirect (`>`/`>>`), `tee` append,
// AND non-redirect file-writing verbs (cp/mv/dd/install/rsync) are detected.
// This is the trusted-producer boundary for the decision log: the ONLY
// legitimate writer is the bash-gate evaluator hook's `appendDecisionLog` node
// call (a spawned process, not a bash command), so an agent bash command must
// never be able to append or overwrite a forged JSONL row carrying
// `event_source:"bash-gate-evaluator"` + `candidate_kind:"unexpected-match"`.
// Mirror the preflight-marker pattern shape (per-surface, redirect + tee).
function decisionLogPathPatterns() {
  return SURFACES.flatMap((surface) => {
    const seg = escapeForRegex(surface);
    // The decision log is the trusted-producer boundary: the ONLY legitimate
    // writer is the bash-gate evaluator hook's `appendDecisionLog` node call,
    // so ANY agent shell write to a surface's coordination/.gate-decision.log
    // must be blocked, regardless of path spelling. The prefix before the
    // surface segment is deliberately loose (`[^\\s"';&|]*`) so `./.claude/…`,
    // `/.claude/…`, `.//.claude//…`, and an absolute `/repo/.claude/…` all
    // match; the anchor is the surface + coordination + filename, not the path
    // head (records-style `[^\\s"';&|]+` tail semantics). `seg` is already
    // escaped for regex. Accepted limitation: a filename that merely BEGINS
    // with `.gate-decision.log` (e.g. `.gate-decision.log.backup`) also
    // matches — fail-closed over-match, no bypass.
    //
    // cp/mv/install/rsync take the destination as a trailing argument (no
    // redirect operator), and `dd of=` writes without `>`/`tee`, so the
    // redirect/tee patterns alone leave a forging seam. The verb patterns
    // over-match on purpose (a log path appearing as a cp SOURCE also blocks)
    // — fail-closed, matching the redirect/tee over-match philosophy above.
    // The decision log is not operator-maintained, so blocking shell verbs
    // that touch it at all is the safe direction.
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
// active `.loop-preflight-runtime-state-edit` marker is present (mirrors the
// write-gate preflight delegation in evaluate-write-gate.js). The local
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
// runtime-state patterns are named so evaluateBashGate can exempt them when
// the `.loop-preflight-runtime-state-edit` marker is active.
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

function commandWritesToGatedPath(command) {
  if (!command || typeof command !== "string") return false;
  return NON_RUNTIME_STATE_PATH_WRITE_PATTERNS.some((p) => p.test(command));
}

// True when a runtime-state path-write pattern matches the command (redirect
// or tee to runtime-state.jsonl). Used by evaluateBashGate to gate the
// preflight exemption on a runtime-state-specific match — so an active marker
// does NOT bleed into records/**, meta-state.jsonl, or runtime-tracking.json.
function commandWritesToRuntimeState(command) {
  if (!command || typeof command !== "string") return false;
  return RUNTIME_STATE_WRITE_PATTERNS.some((p) => p.test(command));
}

// True when a decision-log path-write pattern matches the command (redirect,
// append, or tee to any surface's .gate-decision.log). This is the
// trusted-producer boundary: the decision log is written ONLY by the bash-gate
// evaluator hook's appendDecisionLog node call (spawned, bypasses the gate), so
// an agent bash command matching here gets a dedicated block reason rather than
// falling through to the generic records/ reason.
function commandWritesToDecisionLog(command) {
  if (!command || typeof command !== "string") return false;
  return DECISION_LOG_WRITE_PATTERNS.some((p) => p.test(command));
}

// Self-remediating block reason for observation-gated gate-verb constraints.
// Emits the exact 2-call incantation that records the allowance so the agent
// copies two lines instead of discovering them. Verb is substituted from the
// matched constraint; the timestamp is fresh at block time. The sentinel
// source_ref is intentionally non-resolving (see field-glossary.js).
function buildGateVerbRemediation(gateVerbMatch, { expired }) {
  const lead = expired
    ? `The recorded gate-verb observation has expired (gate-verb allowances are age-bounded). Record a fresh observation to unblock for 30 min:`
    : `No active observation found. Record one to unblock for 30 min:`;
  return (
    `Constraint "${gateVerbMatch}" detected. ${lead}\n` +
    `1) gate_mark_preflight({surface:"runtime-state"})\n` +
    `2) runtime_state_record({affected_system:"${gateVerbMatch}", kind:"budget-state", id:"${gateVerbMatch}", durability:"ephemeral", source_ref:"local:meta-state:gate-verb-allowance", timestamp:"${new Date().toISOString()}"})\n` +
    `id MUST equal affected_system. durability:"ephemeral" routes the allowance to the session-local substrate (gate-verb:* allowances are ephemeral, never committed). Allowance expires 30 min after timestamp.`
  );
}

// fallow-ignore-next-line complexity -- four independent detection sections (constraint/gate-verb/path-write/promoted-rules) plus combine/precedence; the orchestrator seam is the canonical shape
export function evaluateBashGate({ command, root }) {
  if (!command || typeof command !== "string") {
    return { decision: "ok" };
  }

  const resolvedRoot = root || findProjectRoot();

  let constraintResult = null;
  let pathResult = null;

  // Quote-concatenation normalization: fold adjacent-quote splits (`s''udo` →
  // sudo, `rec''ords/` → records/) so the raw-text regex surfaces (constraint
  // patterns, path-write patterns, promoted rules) see the joined form. The
  // verb layer (matchGateVerb → classifyPolicyTokens) is a real tokenizer and
  // already folds quotes, so it keeps the RAW command below.
  const quoteSafe = normalizeQuoteConcatenation(command);

  // --- Constraint pattern check ---
  const constraintMatch = matchConstraintPattern(quoteSafe);
  if (constraintMatch) {
    const observations = readRuntimeObservations(resolvedRoot);
    const observationStatus = checkObservationExists(constraintMatch, observations);

    constraintResult = makeGateDecision(constraintMatch, observationStatus);

    // Staleness check for non-hard-block decisions
    if (!constraintResult.hard_block) {
      const staleness = checkObservationStaleness(observations, resolvedRoot);
      if (staleness.stale) {
        constraintResult.inbound_gate = true;
        if (constraintResult.decision === "ok") {
          constraintResult.decision = "escalate";
          constraintResult.reason = staleness.reason;
          constraintResult.observation_id = staleness.observation_id;
        }
      }
    }
  }

  // --- Gate-verb constraint check (executor + indirection verbs) ---
  // Observation-gated, same decision shape as docker/sudo. Runs alongside
  // matchConstraintPattern — either match escalates; the more severe wins
  // (hard_block dominates).
  const gateVerbMatch = matchGateVerb(command);
  if (gateVerbMatch) {
    const observations = readRuntimeObservations(resolvedRoot);
    let observationStatus = checkObservationExists(gateVerbMatch, observations);
    // Gate-verb observations are age-bounded: unlike the marker-mode
    // staleness below (which only flips when a fresh operator marker
    // post-dates the observation), a `gate-verb:<verb>` observation expires
    // on age alone after OBSERVATION_STALENESS_WINDOW_MS (30 min). This is
    // what makes the recorded allowance a bounded window rather than an
    // indefinite one. Scoped to gate-verb constraints; the vnstock
    // constraint path keeps marker-mode semantics.
    let ageExpired = false;
    if (
      observationStatus.found &&
      isObservationStaleByAge(observationStatus.observation, Date.now())
    ) {
      observationStatus = { found: false };
      ageExpired = true;
    }
    const gateVerbResult = makeGateDecision(gateVerbMatch, observationStatus);
    // Self-remediating reason: the observation_required gate-verb block
    // (never recorded, or age-expired) carries the exact 2-call incantation
    // that records the allowance, with the verb substituted and a fresh
    // timestamp. The expired variant names the accurate cause.
    if (gateVerbResult.observation_required) {
      gateVerbResult.reason = buildGateVerbRemediation(gateVerbMatch, { expired: ageExpired });
    }
    // Staleness check, mirroring the constraint path — a stale observation
    // must not yield a plain `ok` for gate-verbs any more than for
    // docker/sudo constraints.
    if (!gateVerbResult.hard_block) {
      const staleness = checkObservationStaleness(observations, resolvedRoot);
      if (staleness.stale) {
        gateVerbResult.inbound_gate = true;
        if (gateVerbResult.decision === "ok") {
          gateVerbResult.decision = "escalate";
          gateVerbResult.reason = staleness.reason;
          gateVerbResult.observation_id = staleness.observation_id;
        }
      }
    }
    // Gate-verb result replaces the existing constraint result if it's
    // stricter (hard_block) or if no constraint result exists yet.
    if (!constraintResult || gateVerbResult.hard_block) {
      constraintResult = gateVerbResult;
    } else if (
      constraintResult.decision === "ok" &&
      gateVerbResult.decision !== "ok"
    ) {
      constraintResult = gateVerbResult;
    }
  }

  // --- Path-write detection: ALL records/** blocked ---
  // Runtime-state path-writes get a dedicated reason + preflight-marker
  // exemption (mirrors the write-gate preflight delegation in
  // evaluate-write-gate.js). An active `.loop-preflight-runtime-state-edit`
  // marker unlocks row maintenance (e.g. striking a corrupt row via
  // `grep -v … > runtime-state.jsonl`) for 30 minutes; new rows still go
  // through runtime_state_record (append-only, gated on the separate
  // `.loop-preflight-runtime-state` marker so routine appends do not keep
  // this direct-write gate warm).
  // The two checks below are independent (NOT if/else-if): a compound
  // command matching both must still produce the records-class block even
  // when the runtime-state half is exempted by an active marker.
  if (commandWritesToRuntimeState(quoteSafe)) {
    if (!hasSurfacePreflightMarker(resolvedRoot, ".loop-preflight-runtime-state-edit")) {
      pathResult = {
        decision: "block",
        reason:
          "Direct shell writes to runtime-state.jsonl / .loop/runtime-state-local.jsonl are gated. Use gate_mark_preflight(surface:'runtime-state-edit') to unlock row maintenance for 30 minutes, then log the change with meta_state_log_change. New rows still go through runtime_state_record (append-only).",
        hard_block: true,
      };
    }
  }
  // Decision-log writes get a DEDICATED reason (not the records/ reason): the
  // log is produced ONLY by the bash-gate evaluator hook, so a shell append is
  // forging rows, not maintaining records. Checked independently BEFORE the
  // generic gated-path check so a compound command matching both still reports
  // the decision-log seam.
  if (!pathResult && commandWritesToDecisionLog(quoteSafe)) {
    pathResult = {
      decision: "block",
      reason: DECISION_LOG_WRITE_REASON,
      hard_block: true,
    };
  }
  if (!pathResult && commandWritesToGatedPath(quoteSafe)) {
    pathResult = {
      decision: "block",
      reason: "Direct writes to records/ are blocked. Use MCP tools (create_decision_record, create_experiment_record, create_risk_record, record_observation, etc.) to create/update records.",
      hard_block: true,
    };
  }

  // --- Promoted rules check (meta-state as rule registry) ---
  // The promoted-rule result carries evaluator provenance (event_source /
  // match_origin / candidate_kind). A proven inert-data match returns
  // decision "ok" plus the separate `event: "unexpected-match"` telemetry
  // marker. That marker must NOT turn into a block/allow override: it falls
  // through the hard_block / constraint / path combine below and is only
  // emitted when the final decision is ok — a real constraint (docker, path
  // write) still wins over the telemetry event. Real executable matches
  // escalate (provenance rides on the returned object).
  const i3Rules = loadGroundedPromotedRules(resolvedRoot).filter((r) => r.internalization_level === "I3");
  const promotedCheck = evaluateI3CommandPolicy({ command, root: resolvedRoot, i3Rules });
  if (promotedCheck.decision === "escalate") {
    return promotedCheck;
  }

  // --- Combine results: hard_block wins, then non-ok constraint, then path, else ok ---
  if (constraintResult?.hard_block || pathResult?.hard_block) {
    return constraintResult?.hard_block ? constraintResult : pathResult;
  } else if (constraintResult && constraintResult.decision !== "ok") {
    return constraintResult;
  } else if (pathResult) {
    return pathResult;
  }

  // Only a genuinely allowed command reaches here. If the evaluator proved an
  // inert-data unexpected-match, surface the telemetry marker (decision stays
  // ok) so the Bash hook can log it without a deny/allow envelope.
  if (promotedCheck.event === "unexpected-match" && promotedCheck.decision === "ok") {
    return promotedCheck;
  }

  return { decision: "ok" };
}
