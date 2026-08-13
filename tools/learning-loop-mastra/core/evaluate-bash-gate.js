/**
 * Bash-gate evaluator. Combines constraint-pattern, path-write, and promoted-rules checks.
 *
 * @param {{ command: string, root?: string }} params
 * @returns {{ decision: string, reason?: string, hard_block?: boolean, constraint_type?: string, rule_id?: string, pattern_type?: string }}
 */

import { findProjectRoot, loadGroundedPromotedRules } from "./gate-logic.js";
import { evaluateI3CommandPolicy } from "./promoted-rule-policy.js";
import {
  evaluateProtectedShellWritePolicy,
  PATH_WRITE_PATTERNS,
  DECISION_LOG_WRITE_PATTERNS,
  DECISION_LOG_WRITE_REASON,
} from "./protected-shell-writes.js";
import { evaluateCommandConstraintPolicy } from "./command-constraint-policy.js";

// Legacy path-write pattern exports, forwarded from protected-shell-writes.js so
// existing callers keep their import path unchanged. protected-shell-writes.js is
// the sole owner of protected-path classification; these are one-way forwarding
// adapters.
//
// Caller-by-caller rollback/deletion (spec #160 point 5): the ONLY current
// consumer of these forwarded symbols is core/evaluate-bash-gate.test.js (which
// asserts against PATH_WRITE_PATTERNS / DECISION_LOG_WRITE_PATTERNS /
// DECISION_LOG_WRITE_REASON). When the gate-composition cutover (#162) routes
// that test — and any new caller — to protected-shell-writes.js, DELETE this
// forwarding export block here and re-point the test's import at
// protected-shell-writes.js. Rollback point: any test diverging on these
// constants restores the prior inline path-write branch. New callers must import
// from protected-shell-writes.js directly.
export { PATH_WRITE_PATTERNS, DECISION_LOG_WRITE_PATTERNS, DECISION_LOG_WRITE_REASON };

// fallow-ignore-next-line complexity -- orchestrates three delegated policy sections (command-constraint/path-write/promoted-rules) plus the final precedence fold; the orchestration seam is the canonical shape
export function evaluateBashGate({ command, root }) {
  if (!command || typeof command !== "string") {
    return { decision: "ok" };
  }

  const resolvedRoot = root || findProjectRoot();

  let constraintResult = null;
  let pathResult = null;

  // --- Constraint + gate-verb check: delegated to Command Constraint Policy ---
  // Centralized in command-constraint-policy.js: constraint-pattern matching,
  // gate-verb matching, observation lookup, age-bounded allowance expiry, ordinary
  // observation staleness, side-effect-import hard blocking, gate-verb
  // remediation, and constraint-versus-gate-verb severity. The policy returns
  // the existing decision shape or null; the FINAL precedence fold (constraint vs
  // path vs promoted-rule) stays THIS evaluator's job below.
  constraintResult = evaluateCommandConstraintPolicy({ command, root: resolvedRoot });

  // --- Path-write detection: delegated to Protected Shell Writes policy ---
  // Centralized in protected-shell-writes.js: protected-path classification,
  // Runtime Topology-derived patterns, marker exception, trusted decision-log
  // writers, compound-command masking defense, and exact reason selection. The
  // policy consumes the (quote-normalized, interpreted) command and returns the
  // existing block decision shape or null; the FINAL precedence fold (constraint
  // vs path vs promoted-rule) stays THIS evaluator's job below. The
  // compound-command checks are independent (NOT if/else-if) inside the policy:
  // a chain of writes matching multiple classes must still produce the
  // records/decision-log block even when the runtime-state half is exempted by an
  // active marker.
  pathResult = evaluateProtectedShellWritePolicy({ command, root: resolvedRoot });

  // --- Promoted rules check (meta-state as rule registry) ---
  // The promoted-rule result carries evaluator provenance (event_source /
  // match_origin / candidate_kind). A proven inert-data match returns
  // decision "ok" plus the separate `event: "unexpected-match"` telemetry
  // marker. That marker must NOT turn into a block/allow override: it falls
  // through the hard_block / constraint / path combine below and is only
  // emitted when the final decision is ok — a real constraint (docker, path
  // write) still wins over the telemetry event. Real executable matches
  // escalate (provenance rides on the returned object).
  const i3Rules = loadGroundedPromotedRules(resolvedRoot).filter((r) => r.internalization_level === "I3");
  const promotedCheck = evaluateI3CommandPolicy({ command, root: resolvedRoot, i3Rules });
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

  // Only a genuinely allowed command reaches here. If the evaluator proved an
  // inert-data unexpected-match, surface the telemetry marker (decision stays
  // ok) so the Bash hook can log it without a deny/allow envelope.
  if (promotedCheck.event === "unexpected-match" && promotedCheck.decision === "ok") {
    return promotedCheck;
  }

  return { decision: "ok" };
}
