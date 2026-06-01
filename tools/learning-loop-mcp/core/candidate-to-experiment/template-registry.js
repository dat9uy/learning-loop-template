/**
 * Template registry — dimension-specific experiment templates for Bridge-2.
 * Each template maps a candidate assertion to experiment fields.
 */

/**
 * Default template for the "install" dimension.
 */
function installTemplate(candidate) {
  const assertion = candidate.assertion || "(no assertion text)";
  const scope = candidate.scope || "sandbox";
  const topic = candidate.topic_tag || "(no topic)";

  return {
    goal: `Verify that ${assertion} can be installed in a ${scope} environment.`,
    hypothesis: `The installation completes successfully (exit 0) and the installed package is importable without host state leakage.`,
    method: [
      `Prepare substrate: fresh container matching ${scope} requirements.`,
      `Run installer for capability ${candidate.capability || "(unknown)"}.`,
      "Capture installer exit code, venv state, and version metadata.",
      "Verify import smoke test passes.",
      "Audit temp files and cleanup.",
    ],
    success_metrics: [
      "installer-exits-0",
      "package-imports-successfully",
      "substrate-venv-left-unmodified",
      "temp-root-cleaned",
      "metadata-captured",
    ],
    scope: "install",
    output_level: "metadata-only",
  };
}

/**
 * Default template for the "runtime" dimension.
 */
function runtimeTemplate(candidate) {
  const assertion = candidate.assertion || "(no assertion text)";
  const scope = candidate.scope || "sandbox";
  const topic = candidate.topic_tag || "(no topic)";

  return {
    goal: `Verify that ${assertion} returns expected shape under ${scope} conditions.`,
    hypothesis: `The runtime API call executes without error and returns data matching the expected schema.`,
    method: [
      "Prepare runtime environment with authenticated credentials.",
      `Execute the API call described by the assertion: ${topic}.`,
      "Capture response metadata (schema shape, row counts, column names).",
      "Validate output matches expected shape.",
      "Record any exceptions or deviations.",
    ],
    success_metrics: [
      "api-call-executes-without-error",
      "response-matches-expected-schema",
      "metadata-captured",
      "no-exceptions",
    ],
    scope: "runtime",
    output_level: "runtime-captured",
  };
}

/**
 * Default template for the "static" dimension.
 */
function staticTemplate(candidate) {
  const assertion = candidate.assertion || "(no assertion text)";
  const topic = candidate.topic_tag || "(no topic)";

  return {
    goal: `Verify that ${assertion} is documented and consistent with reference materials.`,
    hypothesis: `The vendor documentation, reference snapshots, and the assertion are mutually consistent.`,
    method: [
      "Read vendor documentation for the relevant capability.",
      "Cross-check against reference snapshot if available.",
      "Note any divergence between docs and assertion.",
      "Record classification: supports, refines, or disproves.",
    ],
    success_metrics: [
      "doc-claims-match-assertion",
      "divergence-list-complete",
      "classification-recorded",
    ],
    scope: "schema-improvement",
    output_level: "docs-only",
  };
}

/**
 * Default template for the "product" dimension.
 */
function productTemplate(candidate) {
  const assertion = candidate.assertion || "(no assertion text)";
  const scope = candidate.scope || "sandbox";

  return {
    goal: `Verify that ${assertion} is safe for product consumption.`,
    hypothesis: `The assertion aligns with product scope and existing decision coverage.`,
    method: [
      "Review assertion against product scope and decisions.",
      "Check capability record for alignment.",
      "Validate with existing product code if applicable.",
      "Document product impact or required changes.",
    ],
    success_metrics: [
      "product-scope-approved",
      "decision-coverage-verified",
      "capability-record-aligned",
    ],
    scope: "product",
    output_level: "metadata-only",
  };
}

const TEMPLATES = {
  install: installTemplate,
  runtime: runtimeTemplate,
  static: staticTemplate,
  product: productTemplate,
};

/**
 * Get the template function for a given dimension.
 * @param {string} dimension — one of install, runtime, static, product
 * @returns {Function | null} — template function or null if unknown
 */
export function getTemplate(dimension) {
  return TEMPLATES[dimension] || null;
}

/**
 * List all available dimension templates.
 * @returns {string[]} — dimension names
 */
export function listDimensions() {
  return Object.keys(TEMPLATES);
}

/**
 * Apply a template to a candidate assertion.
 * @param {object} candidate — the candidate assertion object
 * @param {string} dimension — candidate.dimension (override)
 * @returns {object} — mapped experiment fields (goal, hypothesis, method, success_metrics, scope, output_level)
 */
export function applyTemplate(candidate, dimension = null) {
  const dim = dimension || candidate.dimension;
  const template = getTemplate(dim);
  if (!template) {
    return null;
  }
  return template(candidate);
}
