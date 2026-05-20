/**
 * Pure gate decision logic — no I/O, fully testable.
 * Single source of truth for constraint patterns and gate decisions.
 */

import { readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATTERNS_RAW = JSON.parse(readFileSync(join(__dirname, "patterns.json"), "utf8"));

export const CONSTRAINT_PATTERNS = Object.fromEntries(
  Object.entries(PATTERNS_RAW).map(([key, pattern]) => [key, new RegExp(pattern)])
);

const WRITE_PATH_PATTERNS = {
  'records-evidence': 'records/evidence/**',
};

function globMatch(pattern, filePath) {
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '⟨GLOBSTAR⟩')
    .replace(/\*/g, '[^/]*')
    .replace(/⟨GLOBSTAR⟩/g, '.*');
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(filePath);
}

export function pathMatchesObservation(observation, filePath) {
  if (observation.constraint_type !== 'write-path') return false;
  if (observation.status !== 'active') return false;
  if (globMatch('records/observations/**', filePath)) return false;
  const pattern = WRITE_PATH_PATTERNS[observation.constraint];
  if (!pattern) return false;
  return globMatch(pattern, filePath);
}

const SEGMENT_SEPARATORS = /[;&|]+/;

/**
 * Match a command against constraint patterns.
 * Splits on ;, &, | and checks each segment independently.
 * Returns the first matching constraint type, or null.
 */
export function matchConstraintPattern(command) {
  if (!command || typeof command !== "string") return null;

  const segments = command.split(SEGMENT_SEPARATORS);
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    for (const [type, pattern] of Object.entries(CONSTRAINT_PATTERNS)) {
      if (pattern.test(trimmed)) return type;
    }
  }
  return null;
}

/**
 * Check if an active observation exists for the given constraint type.
 * Matches by `constraint_type` field. Archived observations are ignored.
 */
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
 * Evaluate budget state. Returns { exhausted, windowActive, remaining }.
 * Fail-open: null/missing budget → not exhausted.
 */
export function evaluateBudget(budgetData) {
  if (!budgetData || typeof budgetData !== "object") {
    return { exhausted: false, windowActive: false };
  }
  const remaining = (budgetData.budget ?? 0) - (budgetData.current ?? 0);
  return {
    exhausted: (budgetData.current ?? 0) >= (budgetData.budget ?? 0),
    windowActive: budgetData.validation_window?.active === true,
    remaining,
  };
}

/**
 * Make the final gate decision.
 * Returns { decision: "ok" | "block" | "escalate", ... }
 */
export function makeGateDecision(constraintMatch, observationStatus, budgetStatus) {
  // Side-effect imports always block — importing triggers vendor auth which
  // reactivates cleared devices. No observation or budget state can override.
  if (constraintMatch === "side-effect-import") {
    return {
      decision: "block",
      reason: `Importing vnstock_data triggers vendor authentication and may reactivate cleared devices. Use importlib.util.find_spec() for safe checks.`,
      constraint_type: constraintMatch,
      hard_block: true,
    };
  }

  // Budget exhaustion is a global constraint — escalate regardless of observation
  if (budgetStatus?.exhausted || budgetStatus?.windowActive) {
    if (constraintMatch) {
      return {
        decision: "escalate",
        reason: budgetStatus.exhausted
          ? `Budget exhausted for constraint "${constraintMatch}".`
          : `Validation window active for constraint "${constraintMatch}".`,
        constraint_type: constraintMatch,
        observation_id: observationStatus?.observation?.id,
      };
    }
  }

  // No constraint matched → ok
  if (!constraintMatch) {
    return { decision: "ok" };
  }

  // Constraint matched but no active observation → block
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

/**
 * Evaluate a file path against write-path observations.
 * Returns { decision: "ok" | "block" | "escalate", ... }.
 */
export function evaluateWritePath(filePath, observations, checkStalenessFn) {
  if (!filePath || typeof filePath !== "string") {
    return { decision: "ok" };
  }
  const normalized = normalize(filePath.replace(/^\.\//, ""));

  if (globMatch("records/observations/**", normalized)) {
    return {
      decision: "block",
      reason: "records/observations/** is blocked unconditionally",
      hard_block: true,
    };
  }

  if (globMatch("records/evidence/**", normalized)) {
    const matchingObs = observations.find((obs) => pathMatchesObservation(obs, normalized));
    if (!matchingObs) {
      return {
        decision: "block",
        observation_required: true,
        constraint_type: "write-path",
      };
    }
    const staleness = checkStalenessFn ? checkStalenessFn([matchingObs]) : { stale: false };
    if (staleness.stale) {
      return {
        decision: "escalate",
        reason: staleness.reason,
        observation_id: staleness.observation_id,
        inbound_gate: true,
      };
    }
    return { decision: "ok" };
  }

  // Other paths (records/claims/**, docs/**, etc.) → ok
  return { decision: "ok" };
}
