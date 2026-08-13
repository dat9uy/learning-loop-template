// command-constraint-policy.js — pure Command Constraint Policy module.
//
// Owns constraint-pattern matching, gate-verb matching, observation lookup,
// age-bounded allowance expiry, ordinary observation staleness, side-effect-import
// hard blocking, gate-verb remediation, and constraint-versus-gate-verb severity.
// It consumes the interpreted command/context and returns the existing decision
// shape, or `null` when no constraint candidate exists — it does NOT decide the
// overall precedence fold (that stays with the gate evaluator, which combines
// the constraint, protected-path, and promoted-rule results).
//
// This is a gate/action-boundary policy, not a Rule authority, and it makes no
// registry mutations. The `checkObservationExists` / `makeGateDecision` helpers
// remain here as the policy's small compatibility surface for existing Core
// callers; command matching itself is delegated to the opaque interpretation.
//
// The policy consumes the opaque Command Interpretation result plus resolved
// context. It owns observation, expiry, staleness, remediation, severity, and
// candidate shaping; the interpretation owns parser/blanking machinery and
// returns only configured match facts. Root defaulting, complete result objects,
// and exact visible reasons are preserved.

import { CONSTRAINT_PATTERNS, GATE_VERBS, INDIRECTION_VERBS } from "./pattern-config.js";
import { readRuntimeObservations } from "./file-readers.js";
import { checkObservationStaleness } from "./inbound-state.js";
import { isObservationStaleByAge } from "./observation-staleness.js";
import { interpretCommand } from "./command-interpretation.js";

const CONSTRAINT_MATCH_CONFIG = Object.freeze({
  constraintPatterns: CONSTRAINT_PATTERNS,
  gateVerbs: GATE_VERBS,
  indirectionVerbs: INDIRECTION_VERBS,
});

/**
 * Match a command against constraint patterns. Splits on ;, &, | and checks
 * each segment independently. Strips message flags, node-eval bodies, and
 * pure-data-command pattern args before matching to avoid false positives.
 * Returns the first matching constraint type, or null. Preserved verbatim from
 * the prior gate-logic owner (first-class docker/sudo/package-manager/
 * vendor-api/side-effect-import boundaries, maximally conservative).
 */
// fallow-ignore-next-line unused-export -- public policy seam retained for direct Core callers and focused classifier tests
export function matchConstraintPattern(command) {
  if (!command || typeof command !== "string") return null;
  return interpretCommand(command)
    .matchConfiguredConstraints(CONSTRAINT_MATCH_CONFIG)
    .constraintMatch;
}

/**
 * Check if an active observation exists for the given constraint type.
 * Matches by `constraint_type` field. Archived observations are ignored.
 */
// fallow-ignore-next-line unused-export -- public policy seam retained for direct Core callers and focused observation tests
export function checkObservationExists(constraintType, observations) {
  if (!observations || !Array.isArray(observations)) {
    return { found: false };
  }
  const match = observations.find(
    (obs) =>
      obs.status === "active" &&
      (obs.constraint_type === constraintType || obs.constraint === constraintType)
  );
  return match ? { found: true, observation: match } : { found: false };
}

/**
 * Gate-verb constraint match. Walks the policy view (from
 * classifyPolicyTokens) and returns the FIRST gate-verb constraint_type
 * hit as a string (e.g. "gate-verb:bash") or null. Checks BOTH each
 * segment's verb AND each pipe-target verb. Indirection verbs (env, xargs)
 * only match when followed by a gate-verb arg. Preserved verbatim from the
 * prior gate-logic owner.
 */
// fallow-ignore-next-line unused-export -- public policy seam retained for direct Core callers and focused verb-layer tests
export function matchGateVerb(command) {
  if (!command || typeof command !== "string") return null;
  return interpretCommand(command)
    .matchConfiguredConstraints(CONSTRAINT_MATCH_CONFIG)
    .gateVerbMatch;
}

/**
 * Make the final gate decision. Preserved verbatim from the prior gate-logic
 * owner, including the side-effect-import hard block (importing triggers vendor
 * auth which reactivates cleared devices; no observation/budget can override).
 */
// fallow-ignore-next-line unused-export complexity -- one-way gateway for decision shaping; existing direct Core callers still use this helper, and it is covered at the policy and Bash-gate seams
export function makeGateDecision(constraintMatch, observationStatus) {
  if (constraintMatch === "side-effect-import") {
    return {
      decision: "block",
      reason: `Importing vnstock_data triggers vendor authentication and may reactivate cleared devices. Use importlib.util.find_spec() for safe checks.`,
      constraint_type: constraintMatch,
      hard_block: true,
    };
  }

  if (!constraintMatch) {
    return { decision: "ok" };
  }

  if (!observationStatus?.found) {
    return {
      decision: "block",
      reason: `Constraint "${constraintMatch}" detected. No active observation found. Record an observation before proceeding.`,
      observation_required: true,
      constraint_type: constraintMatch,
    };
  }

  return { decision: "ok" };
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

function evaluateObservationCandidate(
  constraintMatch,
  observations,
  root,
  { now = Date.now(), ageBounded = false, remediation = false } = {},
) {
  let observationStatus = checkObservationExists(constraintMatch, observations);
  let ageExpired = false;

  if (
    ageBounded &&
    observationStatus.found &&
    isObservationStaleByAge(observationStatus.observation, now)
  ) {
    observationStatus = { found: false };
    ageExpired = true;
  }

  const result = makeGateDecision(constraintMatch, observationStatus);
  if (remediation && result.observation_required) {
    result.reason = buildGateVerbRemediation(constraintMatch, { expired: ageExpired });
  }

  if (!result.hard_block) {
    const staleness = checkObservationStaleness(observations, root);
    if (staleness.stale) {
      result.inbound_gate = true;
      if (result.decision === "ok") {
        result.decision = "escalate";
        result.reason = staleness.reason;
        result.observation_id = staleness.observation_id;
      }
    }
  }

  return result;
}

// One-way compatibility adapter for the pre-interpretation caller shape. The
// opaque interpretation is authoritative when it is available; a malformed or
// unavailable interpretation falls back to a fresh raw-command interpretation so
// an in-flight caller can keep the existing evaluator branch active. Delete this
// fallback after the #162 composition cutover proves every caller supplies the
// interpretation seam.
function resolveConfiguredConstraintFacts(command, interpretation) {
  if (interpretation && typeof interpretation.matchConfiguredConstraints === "function") {
    try {
      return interpretation.matchConfiguredConstraints(CONSTRAINT_MATCH_CONFIG);
    } catch {
      // Compatibility rollback below preserves the old caller contract.
    }
  }
  if (typeof command !== "string") return { constraintMatch: null, gateVerbMatch: null };
  return interpretCommand(command).matchConfiguredConstraints(CONSTRAINT_MATCH_CONFIG);
}

// fallow-ignore-next-line complexity -- two policy candidates plus the
// constraint-versus-gate-verb severity fold are the single policy seam
export function evaluateCommandConstraintPolicy({
  command,
  interpretation,
  root,
  now = Date.now(),
}) {
  const { constraintMatch, gateVerbMatch } = resolveConfiguredConstraintFacts(command, interpretation);
  let constraintResult = null;

  if (constraintMatch) {
    constraintResult = evaluateObservationCandidate(
      constraintMatch,
      readRuntimeObservations(root),
      root,
    );
  }

  if (gateVerbMatch) {
    const gateVerbResult = evaluateObservationCandidate(
      gateVerbMatch,
      readRuntimeObservations(root),
      root,
      { now, ageBounded: true, remediation: true },
    );

    // Gate-verb result replaces the constraint result if it's stricter
    // (hard_block) or if no constraint result exists yet.
    if (!constraintResult || gateVerbResult.hard_block) {
      constraintResult = gateVerbResult;
    } else if (
      constraintResult.decision === "ok" &&
      gateVerbResult.decision !== "ok"
    ) {
      constraintResult = gateVerbResult;
    }
  }

  return constraintResult;
}
