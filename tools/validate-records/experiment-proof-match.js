export function experimentProvesDimension(experiment, claim, dimensionConfig, dimension) {
  const verification = experiment.verification;
  if (!verification || !(verification.claim_refs || []).includes(`record:${claim.id}`)) return false;
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
