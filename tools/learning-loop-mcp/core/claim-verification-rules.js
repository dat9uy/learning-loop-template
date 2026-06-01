import { experimentProvesDimension } from "./experiment-proof-match.js";

export const verificationDimensions = new Set(["static", "install", "runtime", "product"]);
export const experimentDimensions = new Set(["static", "install", "runtime"]);
export const proofStatuses = new Set(["claimed", "verified", "rejected"]);
export const productStatuses = new Set(["claimed", "approved", "rejected"]);
export const scopedDimensions = new Set(["install", "runtime"]);
export const humanApprovedDimensions = new Set(["install", "runtime"]);

const reviewedStatuses = new Set(["reviewed", "approved"]);

function verificationError(record, message) {
  return `${record.__file}: claim verification ${message}`;
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

function decisionApprovesProduct(record, claim, action) {
  const effect = record.decision_effect;
  return Boolean(
    record.type === "decision"
      && record.status === "approved"
      && (
        recordReferencesClaim(record, claim)
        || (
          effect?.action === action
          && effect.scope === "product"
          && (effect.affected_refs || []).includes(`record:${claim.id}`)
        )
      ),
  );
}

function resolveRefs(record, refs, byId, errors, label) {
  const resolved = [];
  for (const ref of refs || []) {
    const id = recordIdFromRef(ref);
    if (!id) {
      errors.push(verificationError(record, `unsupported ${label} reference ${ref}`));
      continue;
    }
    const proofRecord = byId.get(id);
    if (proofRecord) resolved.push(proofRecord);
    else errors.push(verificationError(record, `missing ${label} record ${ref}`));
  }
  return resolved;
}

function validateHumanApproval(experiment, dimension, errors) {
  if (!humanApprovedDimensions.has(dimension)) return;
  if (experiment.status !== "approved") {
    errors.push(verificationError(experiment, `${dimension} verification requires approved experiment status`));
  }
  if (experiment.verification?.requires_human_approval !== true || experiment.verification?.approval_status !== "approved") {
    errors.push(verificationError(experiment, `${dimension} verification requires approved human approval`));
  }
}

function validateExperimentProves(experiment, byId, errors) {
  const verification = experiment.verification;
  if (!verification) return;

  const targetRefs = Array.isArray(verification.assertion_refs)
    ? verification.assertion_refs
    : (Array.isArray(verification.claim_refs) ? verification.claim_refs : []);
  if (!targetRefs.length) errors.push(verificationError(experiment, "verification.assertion_refs must name at least one assertion or claim"));
  if (!Array.isArray(verification.proves) || !verification.proves.length) {
    errors.push(verificationError(experiment, "verification.proves must name at least one dimension"));
    return;
  }

  for (const ref of targetRefs) {
    const id = recordIdFromRef(ref);
    if (!id) {
      errors.push(verificationError(experiment, `unsupported verification target reference ${ref}`));
      continue;
    }
    const target = byId.get(id);
    if (!target || (target.type !== "claim" && target.type !== "extracted-assertion")) {
      errors.push(verificationError(experiment, `missing assertion or claim reference ${ref}`));
    }
  }

  for (const proof of verification.proves) {
    if (!experimentDimensions.has(proof.dimension)) continue;
    if (proof.dimension === "static" && proof.scope !== undefined) {
      errors.push(verificationError(experiment, "static proof must not set scope"));
    }
    if (proof.dimension === "install" && !["sandbox", "production"].includes(proof.scope)) {
      errors.push(verificationError(experiment, "install proof requires sandbox or production scope"));
    }
    if (proof.dimension === "runtime") {
      if (!["sandbox", "production"].includes(proof.scope)) {
        errors.push(verificationError(experiment, "runtime proof requires sandbox or production scope"));
      }
      if (!["metadata-only", "runtime-captured"].includes(proof.output_level)) {
        errors.push(verificationError(experiment, "runtime proof requires metadata-only or runtime-captured output"));
      }
    }
    validateHumanApproval(experiment, proof.dimension, errors);
  }
}

const dimensionEntries = (target) => Object.entries(target.verification || {}).filter(([key]) => verificationDimensions.has(key));

function validateProofRefsForStatus(target, dimension, config, proofRecords, errors) {
  const refs = config.proof_refs || [];
  if (config.status === "claimed" && refs.length) {
    errors.push(verificationError(target, `${dimension} claimed status must not carry proof refs`));
  }
  if (["verified", "rejected"].includes(config.status) && !refs.length) {
    errors.push(verificationError(target, `${dimension} ${config.status} status requires proof refs`));
    return;
  }
  if (!["verified", "rejected"].includes(config.status)) return;

  const matchingExperiments = proofRecords.filter((record) => (
    record.type === "experiment"
      && reviewedStatuses.has(record.status)
      && experimentProvesDimension(record, target, config, dimension)
  ));
  if (!matchingExperiments.length) {
    errors.push(verificationError(target, `${dimension} ${config.status} status requires matching experiment proof ref`));
  }
}

function validateProductDimension(target, config, byId, errors) {
  const refs = config.decision_refs || [];
  if (config.status === "claimed" && refs.length) {
    errors.push(verificationError(target, "product claimed status must not carry decision refs"));
  }
  if (["approved", "rejected"].includes(config.status) && !refs.length) {
    errors.push(verificationError(target, `product ${config.status} status requires decision refs`));
    return;
  }
  if (!["approved", "rejected"].includes(config.status)) return;

  const decisions = resolveRefs(target, refs, byId, errors, "decision");
  const action = config.status === "approved" ? "approve" : "reject";
  if (!decisions.some((record) => decisionApprovesProduct(record, target, action))) {
    errors.push(verificationError(target, `product ${config.status} decision proof must reference claim`));
  }
  if (decisions.some((record) => record.type === "experiment")) {
    errors.push(verificationError(target, "product dimension must use decisions, not experiment proofs"));
  }
}

function validateTargetDimensions(target, byId, errors) {
  const entries = dimensionEntries(target);
  if (!entries.length) {
    errors.push(verificationError(target, "must include at least one verification dimension"));
    return;
  }

  for (const [dimension, config] of entries) {
    if (dimension === "product") {
      if (!productStatuses.has(config.status)) {
        errors.push(verificationError(target, `product status must be one of claimed, approved, rejected`));
        continue;
      }
      validateProductDimension(target, config, byId, errors);
      continue;
    }
    if (!proofStatuses.has(config.status)) {
      errors.push(verificationError(target, `${dimension} status must be one of claimed, verified, rejected`));
      continue;
    }
    const proofRecords = resolveRefs(target, config.proof_refs || [], byId, errors, "proof");
    validateProofRefsForStatus(target, dimension, config, proofRecords, errors);
  }
}

export function validateClaimVerification(records) {
  const errors = [];
  const byId = new Map(records.map((record) => [record.id, record]));
  for (const record of records) if (record.type === "experiment") validateExperimentProves(record, byId, errors);
  for (const record of records) if (record.type === "claim" || (record.type === "extracted-assertion" && record.verification)) validateTargetDimensions(record, byId, errors);
  return errors;
}
