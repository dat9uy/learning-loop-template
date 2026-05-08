export const assuranceOrder = [
  "static",
  "install",
  "runtime",
];

export function assuranceIndex(level) {
  const idx = assuranceOrder.indexOf(level);
  return idx === -1 ? -1 : idx;
}

export function higherAssurance(a, b) {
  return assuranceIndex(a) > assuranceIndex(b) ? a : b;
}

function experimentSupportsClaim(experiment, claim, dimension) {
  const verification = experiment.verification;
  if (!verification) return false;
  if (!(verification.claim_refs || []).includes(`record:${claim.id}`)) return false;
  return (verification.proves || []).some((proof) => proof.dimension === dimension);
}

function isValidSupportingExperiment(experiment, claim, dimension) {
  if (!["reviewed", "approved"].includes(experiment.status)) return false;
  if (!experimentSupportsClaim(experiment, claim, dimension)) return false;
  const humanGated = ["install", "runtime"].includes(dimension);
  if (humanGated) {
    if (experiment.verification?.approval_status !== "approved") return false;
    if (experiment.status !== "approved") return false;
  }
  return true;
}

function hasRejectedDimension(claim) {
  return Object.values(claim.verification || {}).some((dimension) => (
    dimension && typeof dimension === "object" && dimension.status === "rejected"
  ));
}

function hasRejectingDecision(decisions, claim) {
  return decisions.some((decision) => {
    if (decision.status !== "approved") return false;
    const effect = decision.decision_effect;
    return Boolean(effect?.action === "reject" && (effect.affected_refs || []).includes(`record:${claim.id}`));
  });
}

export function deriveClaimAssurance(claim, records) {
  const experiments = records.filter((r) => r.type === "experiment");
  const decisions = records.filter((r) => r.type === "decision");

  if (hasRejectedDimension(claim) || hasRejectingDecision(decisions, claim)) {
    return { level: "blocked", reason: "claim has rejected verification dimension" };
  }

  let bestLevel = null;
  for (const dimension of assuranceOrder) {
    const config = claim.verification?.[dimension];
    if (config?.status === "verified") {
      bestLevel = bestLevel ? higherAssurance(bestLevel, dimension) : dimension;
      continue;
    }
    if (experiments.some((experiment) => isValidSupportingExperiment(experiment, claim, dimension))) {
      bestLevel = bestLevel ? higherAssurance(bestLevel, dimension) : dimension;
    }
  }

  if (!bestLevel) {
    const hasSources = (claim.source_refs || []).length > 0;
    if (hasSources) return { level: "source-only", reason: "has sources but no supporting experiment" };
    return { level: "none", reason: "no sources or supporting experiments" };
  }

  return { level: bestLevel, reason: "derived from supporting verification dimensions" };
}

export function validateDerivedAssurance(records) {
  const errors = [];
  const claims = records.filter((r) => r.type === "claim");
  for (const claim of claims) {
    const derived = deriveClaimAssurance(claim, records);
    if (derived.level === "blocked") {
      errors.push(`${claim.__file}: claim is blocked/rejected`);
    }
  }
  return errors;
}
