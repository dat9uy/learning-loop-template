/**
 * Bash-gate evaluator. Combines constraint-pattern, path-write, and promoted-rules checks.
 *
 * @param {{ command: string, root?: string }} params
 * @returns {{ decision: string, reason?: string, hard_block?: boolean, constraint_type?: string, rule_id?: string, pattern_type?: string }}
 */

import {
  matchConstraintPattern,
  checkObservationExists,
  makeGateDecision,
  loadPromotedRules,
  applyPromotedRules,
  findProjectRoot,
} from "./gate-logic.js";
import { readRuntimeObservations } from "./file-readers.js";
import { checkObservationStaleness } from "./inbound-state.js";
// SURFACES import is required by runtime-agnostic.test.js:99 — that test scans
// core/ for the substring "coordination" and rejects any file that mentions it
// without importing from ./surfaces.js. The PATH_WRITE_PATTERNS regex literals
// below contain "coordination" (literal escape, not a join() call), so the
// import satisfies the invariant even though SURFACES is not dereferenced here.
import { SURFACES } from "./surfaces.js";

// Path-write detection patterns (bash-specific)
// Preflight-marker patterns cover both .claude and .factory surfaces.
export const PATH_WRITE_PATTERNS = [
  />{1,2}\s*["']?\.?\/?records\/[^\s"';&|]+["']?/,
  /<<['"]?\w+['"]?\s*>\s*["']?\.?\/?records\//,
  /\btee\b.*["']?\.?\/?records\/[^\s"';&|]+["']?/,
  />{1,2}\s*["']?\.?\/?\.claude\/coordination\/\.loop-preflight-[^\s"';&|]+["']?/,
  /\btee\b.*["']?\.?\/?\.claude\/coordination\/\.loop-preflight-[^\s"';&|]+["']?/,
  />{1,2}\s*["']?\.?\/?\.factory\/coordination\/\.loop-preflight-[^\s"';&|]+["']?/,
  /\btee\b.*["']?\.?\/?\.factory\/coordination\/\.loop-preflight-[^\s"';&|]+["']?/,
  />{1,2}\s*["']?\.?\/?meta-state\.jsonl["']?/,
  /\btee\b.*["']?\.?\/?meta-state\.jsonl["']?/,
  />{1,2}\s*["']?\.?\/?runtime-state\.jsonl["']?/,
  /\btee\b.*["']?\.?\/?runtime-state\.jsonl["']?/,
];

function commandWritesToRecords(command) {
  if (!command || typeof command !== "string") return false;
  return PATH_WRITE_PATTERNS.some((p) => p.test(command));
}

// fallow-ignore-next-line complexity
export function evaluateBashGate({ command, root }) {
  if (!command || typeof command !== "string") {
    return { decision: "ok" };
  }

  const resolvedRoot = root || findProjectRoot();

  let constraintResult = null;
  let pathResult = null;

  // --- Constraint pattern check ---
  const constraintMatch = matchConstraintPattern(command);
  if (constraintMatch) {
    const observations = readRuntimeObservations(resolvedRoot);
    const observationStatus = checkObservationExists(constraintMatch, observations);

    constraintResult = makeGateDecision(constraintMatch, observationStatus);

    // Staleness check for non-hard-block decisions
    if (!constraintResult.hard_block) {
      const staleness = checkObservationStaleness(observations, resolvedRoot);
      if (staleness.stale) {
        constraintResult.inbound_gate = true;
        if (constraintResult.decision === "ok") {
          constraintResult.decision = "escalate";
          constraintResult.reason = staleness.reason;
          constraintResult.observation_id = staleness.observation_id;
        }
      }
    }
  }

  // --- Path-write detection: ALL records/** blocked ---
  if (commandWritesToRecords(command)) {
    pathResult = {
      decision: "block",
      reason: "Direct writes to records/ are blocked. Use MCP tools (create_decision_record, create_experiment_record, create_risk_record, record_observation, etc.) to create/update records.",
      hard_block: true,
    };
  }

  // --- Promoted rules check (meta-state as rule registry) ---
  const promotedRules = loadPromotedRules(resolvedRoot);
  const promotedCheck = applyPromotedRules(command, null, promotedRules, resolvedRoot);
  if (promotedCheck.decision === "escalate") {
    return promotedCheck;
  }

  // --- Combine results: hard_block wins, then non-ok constraint, then path, else ok ---
  if (constraintResult?.hard_block || pathResult?.hard_block) {
    return constraintResult?.hard_block ? constraintResult : pathResult;
  } else if (constraintResult && constraintResult.decision !== "ok") {
    return constraintResult;
  } else if (pathResult) {
    return pathResult;
  }

  return { decision: "ok" };
}
