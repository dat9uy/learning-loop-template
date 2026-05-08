export const lifecycleStates = new Set([
  "imported-prior",
  "evidence-reviewed",
  "static-verified",
  "install-verified",
  "runtime-verified",
  "product-approved",
  "rejected",
]);

export const allowedTransitions = new Map([
  ["imported-prior", ["evidence-reviewed", "static-verified", "rejected"]],
  ["evidence-reviewed", ["static-verified", "runtime-verified", "rejected"]],
  ["static-verified", ["install-verified", "rejected"]],
  ["install-verified", ["runtime-verified", "rejected"]],
  ["runtime-verified", ["product-approved", "rejected"]],
  ["product-approved", ["rejected"]],
  ["rejected", []],
]);

const experimentVerifiedStates = new Set(["static-verified", "install-verified", "runtime-verified"]);
const humanApprovedStates = new Set(["install-verified", "runtime-verified"]);
const localEvidenceStates = new Set(["imported-prior", "evidence-reviewed"]);
const reviewedStatuses = new Set(["reviewed", "approved"]);

function lifecycleError(record, message) {
  return `${record.__file}: claim lifecycle ${message}`;
}

function recordIdFromRef(ref) {
  return typeof ref === "string" && ref.startsWith("record:") ? ref.slice("record:".length) : null;
}

function recordRefs(record) {
  return [...(record.source_refs || []), ...(record.supersedes || [])];
}

function recordReferencesClaim(record, claim) {
  return recordRefs(record).includes(`record:${claim.id}`);
}

function decisionHasLifecycleEffect(record, claim, state) {
  return record.lifecycle_effect?.to_state === state
    && (record.lifecycle_effect?.claim_refs || []).includes(`record:${claim.id}`);
}

function decisionHasDecisionEffect(record, claim, action) {
  const effect = record.decision_effect;
  if (!effect) return false;
  const matchesAction = effect.action === action;
  const affectsClaim = (effect.affected_refs || []).includes(`record:${claim.id}`);
  return matchesAction && affectsClaim;
}

function verificationMatchesClaim(experiment, claim, targetState) {
  const verification = experiment.verification;
  return Boolean(
    verification
      && verification.to_state === targetState
      && (verification.claim_refs || []).includes(`record:${claim.id}`),
  );
}

function hasReviewedApproval(claim) {
  return reviewedStatuses.has(claim.status)
    && reviewedStatuses.has(claim.approval?.status)
    && Boolean(claim.approval?.reviewer)
    && Boolean(claim.approval?.reviewed_at);
}

function resolveProofRecords(claim, byId, errors) {
  const proofRecords = [];
  for (const ref of claim.lifecycle?.proof_refs || []) {
    const id = recordIdFromRef(ref);
    if (!id) {
      errors.push(lifecycleError(claim, `unsupported proof reference ${ref}`));
      continue;
    }
    const proofRecord = byId.get(id);
    if (proofRecord) proofRecords.push(proofRecord);
    else errors.push(lifecycleError(claim, `missing proof record ${ref}`));
  }
  return proofRecords;
}

function validateExperimentVerification(experiment, byId, errors) {
  const verification = experiment.verification;
  if (!verification) return;

  const claimRefs = Array.isArray(verification.claim_refs) ? verification.claim_refs : [];
  if (!claimRefs.length) errors.push(lifecycleError(experiment, "verification.claim_refs must name at least one claim"));

  for (const ref of claimRefs) {
    const id = recordIdFromRef(ref);
    if (!id) {
      errors.push(lifecycleError(experiment, `unsupported verification claim reference ${ref}`));
      continue;
    }
    const claim = byId.get(id);
    if (!claim || claim.type !== "claim") errors.push(lifecycleError(experiment, `missing claim reference ${ref}`));
  }

  if (!lifecycleStates.has(verification.from_state) || !lifecycleStates.has(verification.to_state)) return;
  if (verification.to_state === "product-approved") {
    errors.push(lifecycleError(experiment, "experiments cannot promote product-approved claims"));
  }
  if (!allowedTransitions.get(verification.from_state)?.includes(verification.to_state)) {
    errors.push(lifecycleError(experiment, `forbidden lifecycle transition ${verification.from_state}->${verification.to_state}`));
  }

  if (humanApprovedStates.has(verification.to_state)) validateHumanGatedExperiment(experiment, errors);
  if (verification.to_state === "runtime-verified" && verification.output_level !== "metadata-only") {
    errors.push(lifecycleError(experiment, "runtime-verified verification requires metadata-only output"));
  }
  if (verification.to_state === "install-verified" && !["none", "metadata-only"].includes(verification.output_level)) {
    errors.push(lifecycleError(experiment, "install-verified verification requires none or metadata-only output"));
  }
}

function validateHumanGatedExperiment(experiment, errors) {
  const state = experiment.verification.to_state;
  if (experiment.status !== "approved") {
    errors.push(lifecycleError(experiment, `${state} verification requires approved experiment status`));
  }
  if (experiment.verification.requires_human_approval !== true || experiment.verification.approval_status !== "approved") {
    errors.push(lifecycleError(experiment, `${state} verification requires approved human approval`));
  }
}

function validateLocalEvidenceState(claim, errors) {
  const state = claim.lifecycle.state;
  const hasLocalSource = (claim.source_refs || []).some((ref) => typeof ref === "string" && ref.startsWith("local:"));
  if (!hasLocalSource) errors.push(lifecycleError(claim, `${state} requires local evidence source ref`));
  if (state === "evidence-reviewed" && !hasReviewedApproval(claim)) {
    errors.push(lifecycleError(claim, "evidence-reviewed requires reviewed claim approval"));
  }
}

function validateExperimentState(claim, proofRecords, errors) {
  const state = claim.lifecycle.state;
  const matchingExperiments = proofRecords.filter((record) => record.type === "experiment" && verificationMatchesClaim(record, claim, state));
  if (!matchingExperiments.length) {
    errors.push(lifecycleError(claim, `${state} requires matching experiment proof ref`));
    return;
  }
  if (!matchingExperiments.some((record) => reviewedStatuses.has(record.status))) {
    errors.push(lifecycleError(claim, `${state} requires reviewed or approved experiment proof`));
  }
  if (humanApprovedStates.has(state) && !matchingExperiments.some((record) => record.status === "approved" && record.verification?.requires_human_approval === true && record.verification?.approval_status === "approved")) {
    errors.push(lifecycleError(claim, `${state} requires approved human-gated experiment proof`));
  }
}

function validateProductApproval(claim, lifecycle, proofRecords, errors) {
  if (!(lifecycle.proof_refs || []).length) {
    errors.push(lifecycleError(claim, "product-approved requires approved decision proof ref"));
    return;
  }
  const approvedDecisions = proofRecords.filter((record) => record.type === "decision" && record.status === "approved");
  if (!approvedDecisions.length) errors.push(lifecycleError(claim, "product-approved requires approved decision proof ref"));
  else if (!approvedDecisions.some((record) => recordReferencesClaim(record, claim) || decisionHasLifecycleEffect(record, claim, "product-approved") || decisionHasDecisionEffect(record, claim, "approve"))) {
    errors.push(lifecycleError(claim, "product-approved decision proof must reference claim"));
  }
}

function validateRejection(claim, lifecycle, proofRecords, errors) {
  if (!(lifecycle.proof_refs || []).length) {
    errors.push(lifecycleError(claim, "rejected requires rejection proof ref"));
    return;
  }
  const hasProof = proofRecords.some((record) => (
    (record.type === "experiment" && verificationMatchesClaim(record, claim, "rejected"))
    || (record.type === "decision" && ["approved", "rejected"].includes(record.status) && (decisionHasLifecycleEffect(record, claim, "rejected") || decisionHasDecisionEffect(record, claim, "reject")))
  ));
  if (!hasProof) errors.push(lifecycleError(claim, "rejected requires experiment or decision rejection proof ref"));
}

function validateClaimLifecycle(claim, byId, errors) {
  const lifecycle = claim.lifecycle;
  if (!lifecycle || !lifecycleStates.has(lifecycle.state)) return;
  const proofRecords = resolveProofRecords(claim, byId, errors);

  if (localEvidenceStates.has(lifecycle.state)) validateLocalEvidenceState(claim, errors);
  if (lifecycle.state === "imported-prior" && (lifecycle.proof_refs || []).length) {
    errors.push(lifecycleError(claim, "imported-prior must not carry proof refs"));
  }
  if (experimentVerifiedStates.has(lifecycle.state)) {
    if (!(lifecycle.proof_refs || []).length) {
      errors.push(lifecycleError(claim, `${lifecycle.state} requires lifecycle proof refs`));
      return;
    }
    validateExperimentState(claim, proofRecords, errors);
  }
  if (lifecycle.state === "product-approved") validateProductApproval(claim, lifecycle, proofRecords, errors);
  if (lifecycle.state === "rejected") validateRejection(claim, lifecycle, proofRecords, errors);
}

export function validateClaimProofLifecycle(records) {
  const errors = [];
  const byId = new Map(records.map((record) => [record.id, record]));
  for (const record of records) if (record.type === "experiment") validateExperimentVerification(record, byId, errors);
  for (const record of records) if (record.type === "claim") validateClaimLifecycle(record, byId, errors);
  return errors;
}
