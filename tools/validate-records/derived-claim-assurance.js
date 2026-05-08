export const assuranceOrder = [
  "evidence-reviewed",
  "static-verified",
  "install-verified",
  "runtime-verified",
];

export function assuranceIndex(level) {
  const idx = assuranceOrder.indexOf(level);
  return idx === -1 ? -1 : idx;
}

export function higherAssurance(a, b) {
  return assuranceIndex(a) > assuranceIndex(b) ? a : b;
}

function experimentSupportsClaim(experiment, claim) {
  const verification = experiment.verification;
  if (!verification) return false;
  const claimRefs = verification.claim_refs || [];
  if (!claimRefs.includes(`record:${claim.id}`)) return false;
  return verification.to_state !== "rejected";
}

function experimentAssuranceLevel(experiment) {
  if (experiment.assurance_level) return experiment.assurance_level;
  const verification = experiment.verification;
  if (!verification) return null;
  const state = verification.to_state;
  if (["evidence-reviewed", "static-verified", "install-verified", "runtime-verified"].includes(state)) {
    return state;
  }
  return null;
}

function isValidSupportingExperiment(experiment, claim, scopeFilter = null) {
  if (!experimentSupportsClaim(experiment, claim)) return false;
  const level = experimentAssuranceLevel(experiment);
  if (!level) return false;
  if (scopeFilter && experiment.scope && experiment.scope !== scopeFilter) return false;
  const humanGated = ["install-verified", "runtime-verified"].includes(level);
  if (humanGated) {
    const approval = experiment.verification?.approval_status;
    if (approval !== "approved") return false;
    if (experiment.status !== "approved") return false;
  }
  return true;
}

function hasRejectingExperiment(experiments, claim) {
  return experiments.some((exp) => {
    if (!["approved", "reviewed"].includes(exp.status)) return false;
    const verification = exp.verification;
    if (!verification) return false;
    const claimRefs = verification.claim_refs || [];
    return claimRefs.includes(`record:${claim.id}`) && verification.to_state === "rejected";
  });
}

function hasRejectingDecision(decisions, claim) {
  return decisions.some((decision) => {
    if (decision.status !== "approved") return false;
    const lifecycle = decision.lifecycle_effect;
    if (lifecycle && lifecycle.to_state === "rejected" && (lifecycle.claim_refs || []).includes(`record:${claim.id}`)) {
      return true;
    }
    const effect = decision.decision_effect;
    if (effect && effect.action === "reject" && (effect.affected_refs || []).includes(`record:${claim.id}`)) {
      return true;
    }
    return false;
  });
}

export function deriveClaimAssurance(claim, records) {
  const experiments = records.filter((r) => r.type === "experiment");
  const decisions = records.filter((r) => r.type === "decision");

  if (claim.lifecycle?.state === "rejected") {
    return { level: "blocked", reason: "claim lifecycle state is rejected" };
  }

  if (hasRejectingExperiment(experiments, claim) || hasRejectingDecision(decisions, claim)) {
    return { level: "blocked", reason: "rejected by experiment or decision" };
  }

  let bestLevel = null;
  for (const experiment of experiments) {
    if (isValidSupportingExperiment(experiment, claim)) {
      const level = experimentAssuranceLevel(experiment);
      if (level) bestLevel = bestLevel ? higherAssurance(bestLevel, level) : level;
    }
  }

  if (!bestLevel) {
    const hasSources = (claim.source_refs || []).length > 0;
    if (hasSources) return { level: "source-only", reason: "has sources but no supporting experiment" };
    return { level: "none", reason: "no sources or supporting experiments" };
  }

  return { level: bestLevel, reason: `derived from supporting experiments` };
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
