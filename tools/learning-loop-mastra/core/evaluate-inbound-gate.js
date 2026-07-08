/**
 * Inbound-gate evaluator. Returns decision object including `warn` (vs `ok`)
 * for state-change + stale-observation combinations.
 *
 * @param {{ prompt: string, root?: string }} params
 * @returns {{ decision: string, context_message?: string, observations_stale?: string[] }}
 */

import { findProjectRoot, findStaleObservations } from "./gate-logic.js";
import { readRuntimeObservations } from "./file-readers.js";

// State-change signal patterns (from hooks/universal/inbound-gate.js:24-36).
// Exported so tests can pin the pattern set; also surfaced via stateChangeDetected().
export const STATE_CHANGE_PATTERNS = [
  /\b(i|we)?\s*(cleared|clear|removed|delete[ds]?|wiped|reset)\s*(the|my|all)?\s*(device|slot|container|sandbox|cache|venv|vnstock)\b/i,
  /\b(i|we)?\s*(registered|created|installed|started|launched|ran|executed|bootstrapped)\b/i,
  /\b(it'?s?|it\s+is|that'?s?|that\s+is|everything'?s?|everything\s+is|all)\s+(working|running|fixed|ready|done|complete|success|good|ok)\b/i,
  /\b(container|service|server|process|app)\s*(is|are|was)\s*(up|running|alive|ready|started|stopped|killed|dead)\b/i,
  /\b(slot|device|fingerprint)\s*(is|are|was|now)?\s*(free|available|clear|empty|open|used|occupied|taken)\b/i,
  /\b(i|we)?\s*(just\s+)?(did|finished|completed|succeeded|failed)\b/i,
  /\b(the\s+)?(env|environment|venv|sandbox|docker)\s*(is|was|has\s+been)?\s*(cleared|reset|ready|clean|dirty|broken|fixed)\b/i,
  /\bstate\s*(change|update|shift|changed|updated)\b/i,
  /\bchanged\s*(the|my|our)\b/i,
  /\b(budget|resource|limit|quota)\s*(is|was|has\s+been)?\s*(exhausted|reset|replenished|full|empty|cleared)\b/i,
  /\bthe\s+\w+\s+(is|was|has\s+been)\s+(cleared|reset|fixed|ready|running|working|broken|done)\b/i,
];

function stateChangeDetected(prompt) {
  if (!prompt || typeof prompt !== "string") return false;
  return STATE_CHANGE_PATTERNS.some((p) => p.test(prompt));
}

function buildContextMessage(staleObservations) {
  const ids = staleObservations.map((o) => o.id || o.constraint || "unknown").join(", ");
  return [
    "INBOUND STATE GATE: Operator message contains a state-change signal.",
    "",
    "→ READ `meta-state.jsonl` FIRST (last 20 lines). Recent `change-log` and `finding` entries often explain the operator's intent and the gate's escalation context. The named observations below are a subset; the full context is in the registry.",
    "",
    "Affected (stale) observations:",
    `  ${ids}`,
    "",
    "Before proceeding, update affected observations via record_observation MCP tool.",
    "Do NOT assume external state matches observation records — verify first.",
  ].join("\n");
}

/**
 * Inbound-gate evaluator — state-change signal + staleness check.
 * Always returns decision "ok" or "warn" (never blocks).
 */
export function evaluateInboundGate({ prompt, root }) {
  if (!isWatchablePrompt(prompt)) return { decision: "ok" };
  return evaluateStateChangeWarning(prompt, root);
}

function isWatchablePrompt(prompt) {
  return Boolean(prompt) && typeof prompt === "string" && prompt.length >= 10;
}

function evaluateStateChangeWarning(prompt, root) {
  if (!stateChangeDetected(prompt)) return { decision: "ok" };
  const resolvedRoot = root || findProjectRoot();
  const stale = loadStaleActiveObservations(resolvedRoot);
  if (!stale) return { decision: "ok" };
  return warnDecision(stale);
}

function loadStaleActiveObservations(resolvedRoot) {
  const all = readRuntimeObservations(resolvedRoot);
  const active = all.filter((obs) => obs.status === "active");
  if (active.length === 0) return null;
  const stale = findStaleObservations(active, Date.now());
  return stale.length === 0 ? null : stale;
}

function warnDecision(stale) {
  return {
    decision: "warn",
    context_message: buildContextMessage(stale),
    observations_stale: stale.map((o) => o.id || o.constraint || "unknown"),
  };
}