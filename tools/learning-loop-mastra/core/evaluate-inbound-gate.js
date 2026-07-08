/**
 * Inbound-gate evaluator. Returns decision object including `warn` (vs `ok`)
 * for state-change + stale-observation combinations.
 *
 * The gate detects a state-change signal and surfaces a *pointer* to the stale
 * active observations (surface grouping + count), not the raw id list. A
 * repeat warning with the same stale signature within `SUPPRESS_WINDOW_MS`
 * collapses to a one-line "already surfaced" pointer (finding
 * meta-260708T2338Z: stop re-firing the full dump every message).
 *
 * @param {{ prompt: string, root?: string, priorSignature?: string|null, priorTs?: string|number|null, now?: number }} params
 * @returns {{ decision: string, context_message?: string, observations_stale?: string[], stale_signature?: string }}
 */

import { findProjectRoot, findStaleObservations } from "./gate-logic.js";
import { readRuntimeObservations } from "./file-readers.js";

// Suppress window: a repeat warning for the same stale signature within this
// window collapses to the one-line "already surfaced" pointer. Exported so
// tests can pin/override. 30 min matches a "within a session" rate-limit.
export const SUPPRESS_WINDOW_MS = 30 * 60 * 1000;

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

// Dedup key for a stale observation: id, else constraint, else "unknown".
function obsKey(o) {
  return o.id || o.constraint || "unknown";
}

// Dedup stale observations by key (a single runtime-state row can expand into
// multiple constraint-observations sharing one id — collapse to one).
function dedupStale(staleObservations) {
  const seen = new Set();
  const out = [];
  for (const o of staleObservations) {
    const k = obsKey(o);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(o);
  }
  return out;
}

// Surface grouping: group deduped stale observations by affected_system so the
// pointer names the surfaces in debt, not every id. Sorted by surface for stability.
function groupStaleBySurface(deduped) {
  const counts = new Map();
  for (const o of deduped) {
    const surface = o.affected_system || "other";
    counts.set(surface, (counts.get(surface) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([surface, count]) => `${surface} (${count})`)
    .join(", ");
}

// Stable signature over the unique stale keys — used to detect "the stale set
// changed since last emission" (a changed set re-emits the full pointer).
function staleSignature(staleObservations) {
  return [...new Set(staleObservations.map(obsKey))].sort().join(",");
}

function buildContextMessage(staleObservations, { alreadySurfaced } = {}) {
  const deduped = dedupStale(staleObservations);
  const surfaces = groupStaleBySurface(deduped);
  const count = deduped.length;
  const noun = count === 1 ? "observation" : "observations";
  const headline = alreadySurfaced
    ? `INBOUND STATE GATE: ${count} stale active ${noun} already surfaced this session (surfaces: ${surfaces}); review via \`meta_state_list\` / \`runtime_state_read\`. Inline list suppressed (already surfaced this session).`
    : `INBOUND STATE GATE: Operator message contains a state-change signal. ${count} stale active ${noun} detected (surfaces: ${surfaces}); review via \`meta_state_list\` / \`runtime_state_read\`.`;
  return [
    headline,
    "",
    "→ READ `meta-state.jsonl` FIRST (last 20 lines). Recent `change-log` and `finding` entries often explain the operator's intent and the gate's escalation context. The stale observations are a subset; the full context is in the registry.",
    "",
    "Before proceeding, update affected observations via record_observation MCP tool.",
    "Do NOT assume external state matches observation records — verify first.",
  ].join("\n");
}

/**
 * Inbound-gate evaluator — state-change signal + staleness check.
 * Always returns decision "ok" or "warn" (never blocks).
 *
 * `priorSignature`/`priorTs` come from the suppress token written by the hook
 * on the previous emission. When the signature matches and the emission is
 * within `SUPPRESS_WINDOW_MS`, the warning collapses to the one-line pointer.
 */
export function evaluateInboundGate({ prompt, root, priorSignature = null, priorTs = null, now } = {}) {
  if (!isWatchablePrompt(prompt)) return { decision: "ok" };
  return evaluateStateChangeWarning(prompt, root, priorSignature, priorTs, now);
}

function isWatchablePrompt(prompt) {
  return Boolean(prompt) && typeof prompt === "string" && prompt.length >= 10;
}

function evaluateStateChangeWarning(prompt, root, priorSignature, priorTs, now) {
  if (!stateChangeDetected(prompt)) return { decision: "ok" };
  const resolvedRoot = root || findProjectRoot();
  const stale = loadStaleActiveObservations(resolvedRoot);
  if (!stale) return { decision: "ok" };
  const currentSignature = staleSignature(stale);
  const alreadySurfaced = isAlreadySurfaced(priorSignature, priorTs, currentSignature, now);
  return warnDecision(stale, alreadySurfaced, currentSignature);
}

// Same stale signature as the last emission, within the suppress window →
// collapse to the one-line pointer. A null/missing prior, a mismatched
// signature, or an expired window all re-emit the full pointer.
function isAlreadySurfaced(priorSignature, priorTs, currentSignature, now) {
  if (!priorSignature || priorSignature !== currentSignature) return false;
  if (priorTs == null) return true; // signature match with no recorded ts → suppress
  const tsMs = typeof priorTs === "number" ? priorTs : Date.parse(priorTs);
  if (Number.isNaN(tsMs)) return true; // unparseable ts → suppress on signature match
  const refNow = typeof now === "number" ? now : Date.now();
  return refNow - tsMs < SUPPRESS_WINDOW_MS;
}

function loadStaleActiveObservations(resolvedRoot) {
  const all = readRuntimeObservations(resolvedRoot);
  const active = all.filter((obs) => obs.status === "active");
  if (active.length === 0) return null;
  const stale = findStaleObservations(active, Date.now());
  return stale.length === 0 ? null : stale;
}

function warnDecision(stale, alreadySurfaced, signature) {
  const uniqueIds = [...new Set(stale.map((o) => o.id || o.constraint || "unknown"))];
  return {
    decision: "warn",
    context_message: buildContextMessage(stale, { alreadySurfaced }),
    observations_stale: uniqueIds,
    stale_signature: signature,
  };
}