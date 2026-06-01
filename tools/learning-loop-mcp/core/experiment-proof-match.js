export function experimentProvesDimension(experiment, target, dimensionConfig, dimension) {
  const verification = experiment.verification;
  if (!verification) return false;
  const targetRefs = verification.assertion_refs || verification.claim_refs || [];
  if (!targetRefs.includes(`record:${target.id}`)) return false;
  return (verification.proves || []).some((proof) => {
    if (proof.dimension !== dimension) return false;
    if (dimension === "install") {
      if (!dimensionConfig) return false;
      if (proof.scope !== dimensionConfig.scope) return false;
    }
    if (dimension === "runtime") {
      if (!dimensionConfig) return false;
      if (proof.scope !== dimensionConfig.scope) return false;
      if (proof.output_level !== dimensionConfig.output) return false;
    }
    return true;
  });
}
