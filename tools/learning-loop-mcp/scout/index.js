/**
 * scout/index.js
 *
 * Barrel export for the scout's pure functions and orchestrator.
 */
export { classifyBucket } from "./bucket-classifier.js";
export { detectDangling } from "./dangling-detector.js";
export { analyzeGaps } from "./gap-analyzer.js";
export { estimateBudget, stripComments } from "./budget-estimator.js";
export { runScout } from "./run-scout.js";
