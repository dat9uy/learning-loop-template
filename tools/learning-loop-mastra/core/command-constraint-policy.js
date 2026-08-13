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
// registry mutations. The `matchConstraintPattern` / `matchGateVerb` /
// `checkObservationExists` / `makeGateDecision` helpers are forwarded by
// gate-logic.js as one-way compatibility adapters for existing callers until the
// #162 gate-composition cutover fully routes the Bash-gate path here.
//
// Note on the Command Interpretation seam: this policy mirrors the sibling
// policies (protected-shell-writes, promoted-rule-policy) by consuming the
// interpreted command (`{ command, root }`) rather than threading an
// interpretation object. Constraint patterns and gate-verbs are NOT Rule
// objects, so they are matched via the blanking/classifier primitives directly,
// not via `matchRule`. Root defaulting, complete result objects, and exact
// visible reasons are preserved.

import { classifyPolicyTokens } from "./shell-parse.js";
import { CONSTRAINT_PATTERNS, GATE_VERBS, INDIRECTION_VERBS } from "./pattern-config.js";
import { readRuntimeObservations } from "./file-readers.js";
import { checkObservationStaleness } from "./inbound-state.js";
import { isObservationStaleByAge } from "./observation-staleness.js";
import {
  splitSegments,
  stripMessageFlags,
  stripNodeEvalBody,
  stripDataCommandQuotes,
  safeStripHeredocBodies,
  normalizeQuoteConcatenation,
  BLANKABLE_HEREDOC_VERBS_CONSTRAINT,
  BLANKABLE_HEREDOC_VERBS_GATEVERB,
} from "./blanking.js";

// Local verb basename normalization (PATH-qualified /bin/bash -> bash).
function basename(p) {
  if (typeof p !== "string") return p;
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

/**
 * Match a command against constraint patterns. Splits on ;, &, | and checks
 * each segment independently. Strips message flags, node-eval bodies, and
 * pure-data-command pattern args before matching to avoid false positives.
 * Returns the first matching constraint type, or null. Preserved verbatim from
 * the prior gate-logic owner (first-class docker/sudo/package-manager/
 * vendor-api/side-effect-import boundaries, maximally conservative).
 */
// fallow-ignore-next-line unused-export -- one-way gateway for constraint-pattern matching; existing callers import it via the gate-logic re-export until the #162 cutover, and it is covered at both the policy and Bash-gate seams
export function matchConstraintPattern(command) {
  if (!command || typeof command !== "string") return null;

  const heredocSafe = safeStripHeredocBodies(command, BLANKABLE_HEREDOC_VERBS_CONSTRAINT);
  const quoteSafe = normalizeQuoteConcatenation(heredocSafe);

  for (const segment of splitSegments(quoteSafe)) {
    const stripped = stripMessageFlags(segment);
    const nodeStripped = stripNodeEvalBody(stripped);
    const dataStripped = stripDataCommandQuotes(nodeStripped);
    for (const [type, pattern] of Object.entries(CONSTRAINT_PATTERNS)) {
      if (pattern.test(dataStripped)) return type;
    }
  }
  return null;
}

/**
 * Check if an active observation exists for the given constraint type.
 * Matches by `constraint_type` field. Archived observations are ignored.
 */
// fallow-ignore-next-line unused-export -- one-way gateway for observation lookup; existing callers import it via the gate-logic re-export until the #162 cutover, and it is covered at both the policy and Bash-gate seams
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
// fallow-ignore-next-line unused-export complexity -- one-way gateway for the verb-layer gate-verb matcher; preserved verbatim from the prior owner, has no detached production consumer yet (imported via the gate-logic re-export) until the #162 cutover, and stays the canonical tokenizer view
export function matchGateVerb(command) {
  if (!command || typeof command !== "string") return null;
  const heredocSafe = safeStripHeredocBodies(command, BLANKABLE_HEREDOC_VERBS_GATEVERB);
  const view = classifyPolicyTokens(heredocSafe);

  for (const seg of view.segments) {
    const isIndirection = INDIRECTION_VERBS.has(seg.verb);

    if (!isIndirection) {
      const match = matchVerbAgainstGateList(seg.verb, seg.args);
      if (match) return `gate-verb:${match}`;
    }

    if (isIndirection) {
      for (const arg of seg.args) {
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(arg)) continue;
        if (arg.startsWith("-")) continue;
        const argMatch = matchVerbAgainstGateList(basename(arg), []);
        if (argMatch) {
          return `gate-verb:${seg.verb}`;
        }
      }
    }
  }
  return null;
}

// fallow-ignore-next-line complexity -- flag-matching covers detached/attached/single-char-cluster forms; the 3 documented matches are load-bearing gate-verb semantics preserved verbatim
function matchVerbAgainstGateList(verb, args) {
  if (!verb) return null;
  const key = basename(verb);
  for (const entry of GATE_VERBS) {
    if (entry.verb !== key) continue;
    if (entry.indirection) continue;
    if (entry.flags === null) return key;
    const hasFlag = entry.flags.some((f) =>
      args.some(
        // fallow-ignore-next-line complexity -- the flag-comparison predicate; the 3 documented match forms are load-bearing gate-verb semantics preserved verbatim
        (a) =>
          a === f ||
          a.startsWith(f + "=") ||
          (f.length === 2 &&
            f[0] === "-" &&
            a.length > 2 &&
            a[0] === "-" &&
            a[1] !== "-" &&
            a.slice(1).includes(f[1])),
      ),
    );
    if (hasFlag) return key;
  }
  return null;
}

/**
 * Make the final gate decision. Preserved verbatim from the prior gate-logic
 * owner, including the side-effect-import hard block (importing triggers vendor
 * auth which reactivates cleared devices; no observation/budget can override).
 */
// fallow-ignore-next-line unused-export complexity -- one-way gateway for decision shaping; existing callers import it via the gate-logic re-export until the #162 cutover, and it is covered at the policy and Bash-gate seams
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

// fallow-ignore-next-line complexity -- four independent detection sections (constraint/gate-verb) plus combine/precedence; the policy seam is the canonical shape
export function evaluateCommandConstraintPolicy({ command, root, now = Date.now() }) {
  if (!command || typeof command !== "string") return null;

  let constraintResult = null;

  // Quote-concatenation normalization: fold adjacent-quote splits so the
  // raw-text constraint regexes (docker/sudo/package-manager/vendor-api)
  // see the joined form. The verb layer already folds quotes, so it keeps
  // the RAW command below.
  const quoteSafe = normalizeQuoteConcatenation(command);

  // --- Constraint pattern check ---
  const constraintMatch = matchConstraintPattern(quoteSafe);
  if (constraintMatch) {
    const observations = readRuntimeObservations(root);
    const observationStatus = checkObservationExists(constraintMatch, observations);

    constraintResult = makeGateDecision(constraintMatch, observationStatus);

    // Staleness check for non-hard-block decisions
    if (!constraintResult.hard_block) {
      const staleness = checkObservationStaleness(observations, root);
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
  // (hard_block dominates). Gate-verb observations are age-bounded (30 min):
  // unlike marker-mode staleness, a gate-verb:<verb> observation expires on age
  // alone. The vnstock constraint path keeps marker-mode semantics.
  const gateVerbMatch = matchGateVerb(command);
  if (gateVerbMatch) {
    const observations = readRuntimeObservations(root);
    let observationStatus = checkObservationExists(gateVerbMatch, observations);
    let ageExpired = false;
    if (
      observationStatus.found &&
      isObservationStaleByAge(observationStatus.observation, now)
    ) {
      observationStatus = { found: false };
      ageExpired = true;
    }
    const gateVerbResult = makeGateDecision(gateVerbMatch, observationStatus);
    if (gateVerbResult.observation_required) {
      gateVerbResult.reason = buildGateVerbRemediation(gateVerbMatch, { expired: ageExpired });
    }
    if (!gateVerbResult.hard_block) {
      const staleness = checkObservationStaleness(observations, root);
      if (staleness.stale) {
        gateVerbResult.inbound_gate = true;
        if (gateVerbResult.decision === "ok") {
          gateVerbResult.decision = "escalate";
          gateVerbResult.reason = staleness.reason;
          gateVerbResult.observation_id = staleness.observation_id;
        }
      }
    }
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
