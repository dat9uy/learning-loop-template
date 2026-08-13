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
import {
  evaluateProtectedShellWritePolicy,
  PATH_WRITE_PATTERNS,
  DECISION_LOG_WRITE_PATTERNS,
  DECISION_LOG_WRITE_REASON,
} from "./protected-shell-writes.js";
import { readRuntimeObservations } from "./file-readers.js";
import { checkObservationStaleness } from "./inbound-state.js";
import { isObservationStaleByAge } from "./observation-staleness.js";

// Legacy path-write pattern exports, forwarded from protected-shell-writes.js so
// existing callers keep their import path unchanged. protected-shell-writes.js is
// the sole owner of protected-path classification; these are one-way forwarding
// adapters.
//
// Caller-by-caller rollback/deletion (spec #160 point 5): the ONLY current
// consumer of these forwarded symbols is core/evaluate-bash-gate.test.js (which
// asserts against PATH_WRITE_PATTERNS / DECISION_LOG_WRITE_PATTERNS /
// DECISION_LOG_WRITE_REASON). When the gate-composition cutover (#162) routes
// that test — and any new caller — to protected-shell-writes.js, DELETE this
// forwarding export block here and re-point the test's import at
// protected-shell-writes.js. Rollback point: any test diverging on these
// constants restores the prior inline path-write branch. New callers must import
// from protected-shell-writes.js directly.
export { PATH_WRITE_PATTERNS, DECISION_LOG_WRITE_PATTERNS, DECISION_LOG_WRITE_REASON };

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

  // --- Path-write detection: delegated to Protected Shell Writes policy ---
  // Centralized in protected-shell-writes.js: protected-path classification,
  // Runtime Topology-derived patterns, marker exception, trusted decision-log
  // writers, compound-command masking defense, and exact reason selection. The
  // policy consumes the (quote-normalized, interpreted) command and returns the
  // existing block decision shape or null; the FINAL precedence fold (constraint
  // vs path vs promoted-rule) stays THIS evaluator's job below. The
  // compound-command checks are independent (NOT if/else-if) inside the policy:
  // a chain of writes matching multiple classes must still produce the
  // records/decision-log block even when the runtime-state half is exempted by an
  // active marker.
  pathResult = evaluateProtectedShellWritePolicy({ command, root: resolvedRoot });

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
