/**
 * Coordination Gate Core — Single source of truth for all gate logic.
 *
 * Pure functions for constraint pattern matching, observation reading,
 * budget evaluation, gate decisions, file path evaluation, and record writing.
 *
 * Used by:
 * - MCP server (tools/coordination-gate/mcp/)
 * - Universal hooks (tools/coordination-gate/hooks/)
 * - Claude Code hooks (.claude/coordination/hooks/)
 * - Droid CLI hooks (.factory/coordination/hooks/)
 */

export { resolveRoot } from "../../lib/resolve-root.js";

export {
  CONSTRAINT_PATTERNS,
  matchConstraintPattern,
  checkObservationExists,
  evaluateBudget,
  makeGateDecision,
  evaluateWritePath,
  pathMatchesObservation,
  globMatch,
  findProjectRoot,
  extractFrontmatter,
  hasProductBuildTag,
  extractSurfaces,
  checkDecisionRecords,
  inferSurface,
  hasDecisionRecords,
  readPreflightMarker,
  writePreflightMarker,
} from "./gate-logic.js";

export { readObservations, readBudgets } from "./file-readers.js";

export {
  sanitizeSlug,
  generateFilename,
  generateObservationId,
  buildObservationYaml,
  writeObservation,
  updateObservation,
} from "./observation-writer.js";

export { readLastOperatorMessage, checkObservationStaleness } from "./inbound-state.js";

export { rotateGateLog, appendGateLog } from "../../lib/gate-logging.js";

export {
  sanitizeSlug as sanitizeRecordSlug,
  generateTimestamp,
  generateISOTimestamp,
  generateRecordId,
  generateFilename as generateRecordFilename,
  resolveRecordDir,
  atomicWriteYaml,
  findRecordById,
  updateRecordFile,
  validateRecordShape,
} from "./record-writer.js";

export {
  buildDecisionYaml,
  createDecision,
  updateDecision,
  findDecisionById,
} from "./decision-writer.js";

export {
  buildExperimentYaml,
  createExperiment,
  updateExperiment,
  findExperimentById,
} from "./experiment-writer.js";

export {
  buildRiskYaml,
  createRisk,
  updateRisk,
  findRiskById,
} from "./risk-writer.js";
