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
import { SURFACES } from "./surfaces.js";

/**
 * Named seam for the product/** preflight check (locked by convergence addendum).
 * Returns { decision: "ok" } or { decision: "block", reason, surface?, preflight_checklist? }.
 */
export function evaluatePreflight({ filePath, root }) {
  const surface = inferSurface(filePath);
  if (!surface) return { decision: "ok" };

  const resolvedRoot = root || findProjectRoot();
  let marker = null;
  // Index loop (not for-of iteration) to satisfy runtime-agnostic.test.js:80
  // — that test rejects hand-rolled iteration over SURFACES in core/ outside surfaces.js.
  for (let i = 0; i < SURFACES.length; i++) {
    const coordDir = `${resolvedRoot}/${SURFACES[i]}/coordination`;
    marker = readPreflightMarker(surface, coordDir);
    if (marker) break;
  }
  if (marker) return { decision: "ok" };

  return {
    decision: "block",
    reason: `Preflight check not completed for surface "${surface}". Use the mark_preflight_complete MCP tool after reviewing the checklist.`,
    surface,
    preflight_checklist: [
      `1. Review the product-build plan for this surface`,
      `2. Verify decision records exist in records/${surface}/decisions/`,
      `3. Run and review any existing test suites`,
      `4. Confirm the change aligns with the approved architecture`,
      `5. Verify no schema-breaking changes without migration`,
      `6. Call mark_preflight_complete MCP tool for surface "${surface}"`,
    ],
  };
}

/**
 * Write-gate evaluator — 7-rule cascade.
 *
 * @param {{ filePath: string, root?: string }} params
 * @returns {{ decision: string, reason?: string, file_path?: string, matched_rule?: string, surface?: string, preflight_checklist?: string[] }}
 */
export function evaluateWriteGate({ filePath, root }) {
  if (!filePath || typeof filePath !== "string") {
    return { decision: "ok" };
  }

  const resolvedRoot = root || findProjectRoot();

  // Convert absolute paths to relative (matches hook's toRelative behavior)
  let relPath = filePath;
  if (relPath.startsWith(resolvedRoot)) {
    relPath = relPath.slice(resolvedRoot.length + 1);
  }
  relPath = normalize(relPath.replace(/^\.\//, ""));

  // --- 1. records/** — always block (must use MCP tools) ---
  if (globMatch("records/**", relPath)) {
    return {
      decision: "block",
      reason: "Direct writes to records/ are blocked. Use MCP tools (create_decision_record, create_experiment_record, create_risk_record, record_observation, etc.) to create/update records.",
      file_path: filePath,
      matched_rule: "records/**",
    };
  }

  // --- 1.5. runtime-state.jsonl — always block (only via MCP tools) ---
  if (globMatch("runtime-state.jsonl", relPath)) {
    return {
      decision: "block",
      reason: "Direct writes to runtime-state.jsonl are blocked. Use runtime_state_record MCP tool to create entries.",
      file_path: filePath,
      matched_rule: "runtime-state.jsonl",
    };
  }

  // --- 1.6. meta-state.jsonl — always block (only via MCP tools) ---
  // Closes the audit-log gap identified in plans/reports/debugger-260626-1535-
  // phase-e-plan-7-audit-gap-mechanism-investigation.md: the bash gate (regex
  // on shell commands) blocks `> meta-state.jsonl` but Claude Code's Write/Edit
  // tools bypass the bash gate (they are not shell commands). Adding this rule
  // ensures Write/Edit/Create/ApplyPatch to meta-state.jsonl is also blocked at
  // the PreToolUse hook layer. All registry mutations MUST go through MCP
  // tools (meta_state_report, meta_state_ack, meta_state_batch, etc.) so they
  // are logged to .claude/coordination/gate-log.jsonl.
  if (globMatch("meta-state.jsonl", relPath)) {
    return {
      decision: "block",
      reason: "Direct writes to meta-state.jsonl are blocked. Use MCP tools (meta_state_report, meta_state_ack, meta_state_batch, meta_state_resolve, etc.) to mutate the registry. The bash gate blocks shell writes; this rule closes the parallel Write/Edit path identified in the audit-log gap investigation.",
      file_path: filePath,
      matched_rule: "meta-state.jsonl",
    };
  }

  // --- 2. schemas/** — always block (needs validation) ---
  if (globMatch("schemas/**", relPath)) {
    return {
      decision: "block",
      reason: "Schema changes require validation. Run pnpm validate:records first, then approve.",
      file_path: filePath,
      matched_rule: "schemas/**",
    };
  }

  // --- 3. Build artifacts — always block ---
  if (
    globMatch("{,**/}node_modules/**", relPath) ||
    globMatch("{,**/}dist/**", relPath) ||
    globMatch("{,**/}build/**", relPath)
  ) {
    return {
      decision: "block",
      reason: "Build artifacts are not git-tracked",
      file_path: filePath,
      matched_rule: "**/node_modules/**",
    };
  }

  // --- 4. Preflight markers — always block (only via MCP) ---
  if (
    globMatch(".claude/coordination/.loop-preflight-*", relPath) ||
    globMatch(".factory/coordination/.loop-preflight-*", relPath)
  ) {
    return {
      decision: "block",
      reason: "Preflight marker files can only be created via the mark_preflight_complete MCP tool. Direct writes are blocked.",
      file_path: filePath,
      matched_rule: ".claude/coordination/.loop-preflight-*",
    };
  }

  // --- 5. product/** — preflight check ---
  if (globMatch("product/**", relPath)) {
    return evaluatePreflight({ filePath: relPath, root: resolvedRoot });
  }

  // --- 6. Promoted rules check (meta-state as rule registry) ---
  const promotedRules = loadPromotedRules(resolvedRoot);
  const promotedCheck = applyPromotedRules(null, relPath, promotedRules);
  if (promotedCheck.decision === "escalate") {
    return promotedCheck;
  }

  // --- 7. Everything else (plans/, docs/, .claude/, .factory/, tools/, unknown) → allow ---
  return { decision: "ok" };
}
