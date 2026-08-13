// command-interpretation.js — the pure Command Interpretation interface.
//
// This is the small public seam for command meaning. The parser, blanking
// views, quote handling, inert-span proof, and recurrence representation stay
// behind it. A caller supplies an already selected Rule and receives facts
// about matching and provenance; this module never loads Rules, consults
// observations, chooses severity, or makes a gate decision.

import { classifyCommand } from "./command-classification.js";
import {
  BLANKABLE_HEREDOC_VERBS_PROMOTED,
  normalizeQuoteConcatenation,
  safeStripHeredocBodies,
} from "./blanking.js";
import { projectRecurrenceKey } from "./command-recurrence.js";

const INTERNAL = new WeakMap();

const UNKNOWN_FACTS = Object.freeze({
  matched: false,
  supported: true,
  match_origin: "unknown",
  candidate_kind: "unclassified",
  raw_match: null,
});

function unknownFacts(extra = {}) {
  return { ...UNKNOWN_FACTS, ...extra };
}

function unsupportedFacts() {
  return unknownFacts({ supported: false });
}

function commandText(command) {
  return typeof command === "string" ? command : "";
}

/**
 * Create an opaque, request-local interpretation.
 *
 * The returned object intentionally has no data properties. Callers can only
 * ask the interface to match a supplied Rule. This keeps normalized strings,
 * token views, blanking primitives, and shell-AST concepts out of the seam.
 *
 * @param {string|null|undefined} command
 * @returns {{matchRule: (rule: object) => object}}
 */
export function interpretCommand(command) {
  const interpretation = Object.freeze({
    matchRule: (rule) => matchCommandRule(interpretation, rule),
  });
  INTERNAL.set(interpretation, {
    command: commandText(command),
    gate: undefined,
    events: new Map(),
  });
  return interpretation;
}

function internalState(interpretation) {
  return INTERNAL.get(interpretation) ?? null;
}

function safeGateView(command) {
  try {
    // Preserve the gate's ordered blanking contract: prove promoted heredoc
    // inertness on the raw shell text before folding adjacent quote fragments.
    // Folding first can turn a quoted delimiter such as `E''OF` into `EOF`
    // and move it onto a different parser path.
    const heredocSafe = safeStripHeredocBodies(command, BLANKABLE_HEREDOC_VERBS_PROMOTED);
    const gateCommand = normalizeQuoteConcatenation(heredocSafe);
    return classifyCommand(gateCommand, { mode: "gate" });
  } catch {
    return { classification_error: true, normalized: command, perSegmentNormalized: [] };
  }
}

function safeEventView(command, pattern) {
  try {
    return classifyCommand(command, { mode: "event", rulePattern: pattern });
  } catch {
    return { classification_error: true, match_origin: "unknown", candidate_kind: "unclassified" };
  }
}

function rawMatch(command, pattern) {
  if (!command || typeof pattern !== "string" || !pattern) return null;
  let re;
  try {
    re = new RegExp(pattern);
  } catch {
    return null;
  }
  const match = re.exec(command);
  if (!match || match[0].length === 0) return null;
  return { start: match.index, end: match.index + match[0].length, text: match[0] };
}

function visibleMatch(view, pattern) {
  let re;
  try {
    re = new RegExp(pattern);
  } catch {
    return { error: true, match: null };
  }
  const surfaces = [
    ...(Array.isArray(view?.perSegmentNormalized) ? view.perSegmentNormalized : []),
    ...(typeof view?.normalized === "string" ? [view.normalized] : []),
  ];
  for (const surface of surfaces) {
    const match = re.exec(surface);
    if (match && match[0].length > 0) return { error: false, match };
  }
  return { error: false, match: null };
}

function eventFacts(state, pattern) {
  if (!state.events.has(pattern)) {
    const event = safeEventView(state.command, pattern);
    const raw = event.rawMatch ?? rawMatch(state.command, pattern);
    state.events.set(pattern, { event, raw });
  }
  const { event, raw } = state.events.get(pattern);
  return {
    match_origin: event.match_origin ?? "unknown",
    candidate_kind: event.candidate_kind ?? "unclassified",
    raw_match: raw,
    classification_error: event.classification_error === true,
  };
}

/**
 * Match an opaque interpretation against a supplied Rule.
 *
 * This returns policy-neutral facts only. In particular, `matched` means the
 * Rule's regex is visible in the gate-safe interpretation; it is not an allow,
 * block, escalation, or severity decision. Non-regex Rules remain for the
 * caller's path policy and are explicitly reported as unsupported here.
 *
 * @param {object} interpretation
 * @param {{pattern_type?: string, pattern?: string}} rule
 * @returns {{matched: boolean, supported: boolean, match_origin: string, candidate_kind: string, raw_match: object|null}}
 */
function matchCommandRule(interpretation, rule) {
  const state = internalState(interpretation);
  if (!state || rule?.pattern_type !== "regex" || typeof rule.pattern !== "string") {
    return unsupportedFacts();
  }

  const visible = visibleMatch(state.gate ?? (state.gate = safeGateView(state.command)), rule.pattern);
  if (visible.error) return unknownFacts({ classification_error: true });

  const facts = eventFacts(state, rule.pattern);
  return {
    matched: Boolean(visible.match),
    supported: true,
    match_origin: facts.match_origin,
    candidate_kind: facts.candidate_kind,
    raw_match: facts.raw_match,
    ...(facts.classification_error && { classification_error: true }),
  };
}

/**
 * Request the existing coarse recurrence identity without exposing its
 * normalized-prefix projection. Recurrence is deliberately separate from Rule
 * matching: it is telemetry identity, never permission input.
 *
 * @param {object} interpretation
 * @param {string} ruleId
 * @returns {string}
 */
export function requestRecurrenceKey(interpretation, ruleId) {
  const state = internalState(interpretation);
  if (!state) return "";
  return projectRecurrenceKey(state.command, ruleId);
}
