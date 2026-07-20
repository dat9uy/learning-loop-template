/**
 * Shared bound-artifacts constant — the single source of truth for the
 * simple-glob rules the write-gate matches.
 *
 * Phase 3 of plans/260707-0114-loop-skill-layer-prerequisite/plan.md.
 *
 * Scope:
 *   - This module is data-only (glob strings + labels + reasons). It does NOT
 *     import any other core/ module (no gate-logic, no surfaces) — that would
 *     risk a circular dependency and reverse the dependency direction.
 *   - The FCIS (no framework imports) is enforced by
 *     legacy-mcp/bound-artifacts.test.js.
 *   - Special-case rules (preflight-marker, product/**) are NOT in this
 *     constant; they delegate to `evaluatePreflight` and stay in
 *     `evaluate-write-gate.js`.
 *   - Phase 5 will extend the constant with `<surface>/skills/**` via
 *     a derived-glob shape (skills is a preflight-delegating rule, not a
 *     simple glob); when that lands this module grows accordingly.
 *
 * Rule order is load-bearing: `evaluateWriteGate` walks the rules in array
 * order and returns on the first match (first-match-wins). The order is
 * pinned by `legacy-mcp/bound-artifacts.test.js` — do not reorder.
 */

import { globMatch } from "./gate-logic.js";

/**
 * The simple-glob bound-artifact ruleset, in pinned order.
 *
 * Each entry shape:
 *   - name         {string}              stable identifier (used internally)
 *   - matchedRule  {string|null}         human-readable label returned in
 *                                         decision.matched_rule (tests assert)
 *   - glob         {string|string[]}     glob string OR array of globs to OR
 *   - match        {(relPath) => boolean} matcher (uses globMatch; the gate
 *                                         composes this into WRITE_GATE_RULES)
 *   - reason       {string}              human-readable reason returned when
 *                                         the rule blocks
 */
const records = {
  name: "records",
  matchedRule: "records/**",
  glob: "records/**",
  match: (relPath) => globMatch("records/**", relPath),
  reason:
    "Direct writes to records/ are blocked. Use MCP tools (create_decision_record, create_experiment_record, create_risk_record, record_observation, etc.) to create/update records.",
};

const runtimeState = {
  name: "runtime-state",
  matchedRule: "runtime-state.jsonl",
  glob: "runtime-state.jsonl",
  match: (relPath) => globMatch("runtime-state.jsonl", relPath),
  reason: "Direct writes to runtime-state.jsonl are blocked. Use runtime_state_record MCP tool to create entries.",
};

const metaState = {
  name: "meta-state",
  matchedRule: "meta-state.jsonl",
  glob: "meta-state.jsonl",
  match: (relPath) => globMatch("meta-state.jsonl", relPath),
  reason:
    "Direct writes to meta-state.jsonl are blocked. Use MCP tools (meta_state_report, meta_state_ack, meta_state_batch, meta_state_resolve, etc.) to mutate the registry. The bash gate blocks shell writes; this rule closes the parallel Write/Edit path identified in the audit-log gap investigation.",
};

const fileIndex = {
  name: "file-index",
  matchedRule: "file-index.jsonl",
  glob: "file-index.jsonl",
  match: (relPath) => globMatch("file-index.jsonl", relPath),
  reason:
    "Direct writes to file-index.jsonl are blocked. Use the meta_state_refresh_file_index MCP tool (or upsertFileIndexEntry internally) to mutate the path-keyed fingerprint sidecar. Direct writes bypass hash validation and the single-writer queue — poisoning the index would mask drift with no audit trail.",
};

const buildArtifacts = {
  name: "build-artifacts",
  matchedRule: "**/node_modules/**",
  glob: ["{,**/}node_modules/**", "{,**/}dist/**", "{,**/}build/**"],
  match: (relPath) =>
    globMatch("{,**/}node_modules/**", relPath) ||
    globMatch("{,**/}dist/**", relPath) ||
    globMatch("{,**/}build/**", relPath),
  reason: "Build artifacts are not git-tracked",
};

/**
 * The bound-artifacts ruleset. FROZEN to prevent accidental mutation;
 * order is pinned by `legacy-mcp/bound-artifacts.test.js`.
 *
 * 5 simple-glob rules (records, runtime-state, meta-state, file-index,
 * build-artifacts). The `schemas/**` rule was migrated to a
 * preflight-delegating rule in evaluate-write-gate.js (mirrors the
 * `skills` pattern) in Phase 2 of plans/260720-1112. The dead-end simple-glob
 * block + stale `pnpm validate:records` reason were both retired.
 */
export const BOUND_ARTIFACTS = Object.freeze([
  records,
  runtimeState,
  metaState,
  fileIndex,
  buildArtifacts,
]);
