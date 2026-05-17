/**
 * Pure gate decision logic — no I/O, fully testable.
 * Single source of truth for constraint patterns and gate decisions.
 */

export const CONSTRAINT_PATTERNS = {
  docker: /\bdocker\b(?!-)/,
  sudo: /\bsudo\b/,
  "package-manager": /\b(pip|npm|yarn|pnpm)\s+(install|add)\b/,
  "vendor-api": /\bcurl\b.*api/,
};

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
    (obs) => obs.constraint_type === constraintType && obs.status === "active"
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

  // Observation exists — check budget
  if (budgetStatus?.exhausted || budgetStatus?.windowActive) {
    return {
      decision: "escalate",
      reason: budgetStatus.exhausted
        ? `Budget exhausted for constraint "${constraintMatch}".`
        : `Validation window active for constraint "${constraintMatch}".`,
      constraint_type: constraintMatch,
      observation_id: observationStatus.observation?.id,
    };
  }

  return { decision: "ok" };
}
