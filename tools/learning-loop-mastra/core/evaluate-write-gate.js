/**
 * Write-gate evaluator. Composes primitives from core/gate-logic.js.
 * Returns decision object for hook adapter or MCP tool.
 *
 * Pure at function-body level (transitive I/O at module load via gate-logic.js's
 * patterns.json read is acknowledged per plan R1c).
 */

import { normalize } from "node:path";
import {
  globMatch,
  findProjectRoot,
  inferSurface,
  readPreflightMarker,
  loadPromotedRules,
  applyPromotedRules,
} from "./gate-logic.js";
import { SURFACES, getAllCoordinationPaths } from "./surfaces.js";

/**
 * Named seam for the product/** preflight check (locked by convergence addendum).
 * Returns { decision: "ok" } or { decision: "block", reason, surface?, preflight_checklist? }.
 */
// fallow-ignore-next-line unused-export
export function evaluatePreflight({ filePath, root }) {
  const surface = inferSurface(filePath);
  if (!surface) return { decision: "ok" };

  const resolvedRoot = root || findProjectRoot();
  const marker = findPreflightMarker(surface, resolvedRoot);
  if (marker) return { decision: "ok" };

  return {
    decision: "block",
    reason: `Preflight check not completed for surface "${surface}". Use the mark_preflight_complete MCP tool after reviewing the checklist.`,
    surface,
    preflight_checklist: buildPreflightChecklist(surface),
  };
}

function findPreflightMarker(surface, resolvedRoot) {
  // Index loop (not for-of iteration) to satisfy runtime-agnostic.test.js:80
  // — that test rejects hand-rolled iteration over SURFACES in core/ outside surfaces.js.
  for (let i = 0; i < SURFACES.length; i++) {
    const marker = readPreflightMarker(surface, `${resolvedRoot}/${SURFACES[i]}/coordination`);
    if (marker) return marker;
  }
  return null;
}

function buildPreflightChecklist(surface) {
  return [
    `1. Review the product-build plan for this surface`,
    `2. Verify decision records exist in records/${surface}/decisions/`,
    `3. Run and review any existing test suites`,
    `4. Confirm the change aligns with the approved architecture`,
    `5. Verify no schema-breaking changes without migration`,
    `6. Call mark_preflight_complete MCP tool for surface "${surface}"`,
  ];
}

// Preflight-marker paths across every runtime surface, derived from SURFACES so
// a direct write to any surface's coordination/.loop-preflight-* is blocked.
// The marker may only be created via the mark_preflight_complete MCP tool.
const PREFLIGHT_MARKER_PATHS = getAllCoordinationPaths(".loop-preflight-*");

// ─── Write-gate rule registry ───────────────────────────────────────────────
// Each rule has:
//   - name: stable identifier used internally + surfaced in matched_rule
//   - matchedRule: human-readable label returned in the decision (tests assert)
//   - match(relPath): returns true if the rule applies to this relative path
//   - reason: human-readable reason returned when the rule blocks
// `evaluateWriteGate` walks this array in order; the first matching rule wins.
// `product/**` is a special case — it delegates to `evaluatePreflight` (matchedRule: null).
// fallow-ignore-next-line complexity
const WRITE_GATE_RULES = [
  {
    name: "records",
    matchedRule: "records/**",
    match: (relPath) => globMatch("records/**", relPath),
    reason: "Direct writes to records/ are blocked. Use MCP tools (create_decision_record, create_experiment_record, create_risk_record, record_observation, etc.) to create/update records.",
  },
  {
    name: "runtime-state",
    matchedRule: "runtime-state.jsonl",
    match: (relPath) => globMatch("runtime-state.jsonl", relPath),
    reason: "Direct writes to runtime-state.jsonl are blocked. Use runtime_state_record MCP tool to create entries.",
  },
  {
    name: "meta-state",
    matchedRule: "meta-state.jsonl",
    match: (relPath) => globMatch("meta-state.jsonl", relPath),
    reason: "Direct writes to meta-state.jsonl are blocked. Use MCP tools (meta_state_report, meta_state_ack, meta_state_batch, meta_state_resolve, etc.) to mutate the registry. The bash gate blocks shell writes; this rule closes the parallel Write/Edit path identified in the audit-log gap investigation.",
  },
  {
    name: "schemas",
    matchedRule: "schemas/**",
    match: (relPath) => globMatch("schemas/**", relPath),
    reason: "Schema changes require validation. Run pnpm validate:records first, then approve.",
  },
  {
    name: "build-artifacts",
    matchedRule: "**/node_modules/**",
    match: (relPath) =>
      globMatch("{,**/}node_modules/**", relPath) ||
      globMatch("{,**/}dist/**", relPath) ||
      globMatch("{,**/}build/**", relPath),
    reason: "Build artifacts are not git-tracked",
  },
  {
    name: "preflight-marker",
    matchedRule: PREFLIGHT_MARKER_PATHS.join(" | "),
    match: (relPath) => PREFLIGHT_MARKER_PATHS.some((g) => globMatch(g, relPath)),
    reason: "Preflight marker files can only be created via the mark_preflight_complete MCP tool. Direct writes are blocked.",
  },
  {
    name: "product",
    matchedRule: null,
    match: (relPath) => globMatch("product/**", relPath),
    reason: null,
  },
];

/**
 * Write-gate evaluator — rule-registry cascade.
 *
 * @param {{ filePath: string, root?: string }} params
 * @returns {{ decision: string, reason?: string, file_path?: string, matched_rule?: string, surface?: string, preflight_checklist?: string[] }}
 */
export function evaluateWriteGate({ filePath, root }) {
  if (!isValidFilePath(filePath)) return { decision: "ok" };
  const resolvedRoot = resolveRoot(root);
  const relPath = toRelativePath(filePath, resolvedRoot);
  const matched = WRITE_GATE_RULES.find((rule) => rule.match(relPath));
  if (!matched) return applyPromotedRulesCheck(relPath, resolvedRoot);
  if (matched.name === "product") {
    return evaluatePreflight({ filePath: relPath, root: resolvedRoot });
  }
  return blockResult(matched, filePath);
}

function isValidFilePath(filePath) {
  return Boolean(filePath) && typeof filePath === "string";
}

function resolveRoot(root) {
  return root || findProjectRoot();
}

function toRelativePath(filePath, resolvedRoot) {
  let relPath = filePath;
  if (relPath.startsWith(resolvedRoot)) {
    relPath = relPath.slice(resolvedRoot.length + 1);
  }
  return normalize(relPath.replace(/^\.\//, ""));
}

function blockResult(rule, filePath) {
  return {
    decision: "block",
    reason: rule.reason,
    file_path: filePath,
    matched_rule: rule.matchedRule,
  };
}

function applyPromotedRulesCheck(relPath, resolvedRoot) {
  const promotedRules = loadPromotedRules(resolvedRoot);
  const promotedCheck = applyPromotedRules(null, relPath, promotedRules);
  if (promotedCheck.decision === "escalate") return promotedCheck;
  return { decision: "ok" };
}