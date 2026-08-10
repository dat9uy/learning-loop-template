// command-classification.js — pure, runtime-neutral command classification.
//
// Shares a single semantic substrate between the bash gate (permission view),
// the recurrence tracker (coarser grouping view), and the event layer
// (match-provenance view). The classifier imports ONLY parse primitives and
// blanker primitives — no hooks, no runtime adapters, no loop-introspect, no
// hint code. Mode decides policy:
//
//   gate        — reproduces the promoted-rule fail-closed blanking chain
//                 (quoted heredoc bodies for the promoted allowlist, inert-sink
//                 echo/printf prose, node -e bodies, data-command quotes, loop
//                 CLI argv, message flags). Executor bodies, command
//                 substitutions, redirects, process substitution, unquoted
//                 heredoc bodies and unknown syntax remain visible.
//   recurrence  — reproduces the tracker-side coarser grouping view
//                 (`blankDataPayloadsForKey` + `normalizePrefixForKey`).
//   event       — dual-view: (1) regex-detect a possible rule-text match on the
//                 RAW command (telemetry, never a permission decision);
//                 (2) prove that match lies entirely inside an inert region the
//                 gate intentionally blanked. Only proven inert spans emit
//                 `candidate_kind: "unexpected-match"`. A match that overlaps
//                 inert AND executable content, a pipe-spanning match, or any
//                 parser exception is `unknown`/`unclassified`.
//
// Fail-closed contract: `classifyCommand` never throws and never returns a view
// that could turn a matched command into `{decision:"ok"}`. On any internal
// error it returns `classification_error: true` plus an unblanked
// (executable-preserving) gate view; event mode returns `unknown`/`unclassified`.

import { classifyPolicyTokens, resolveVerbIndex } from "./shell-parse.js";
import {
  safeStripHeredocBodies,
  BLANKABLE_HEREDOC_VERBS_PROMOTED,
  findHeredocTerminator,
  splitSegments,
  stripMessageFlags,
  stripNodeEvalBody,
  stripDataCommandQuotes,
  stripCliArgvPayload,
  stripEchoProse,
  applyInertSinkBlanking,
} from "./blanking.js";
import {
  blankDataPayloadsForKey,
  normalizePrefixForKey,
} from "./recurrence-tracker.js";

// ─── Mode-constant validation ────────────────────────────────────────────────

export const CLASSIFIER_MODES = ["gate", "recurrence", "event"];

function assertValidMode(mode) {
  if (!CLASSIFIER_MODES.includes(mode)) {
    throw new TypeError(
      `classifyCommand: mode must be one of ${CLASSIFIER_MODES.join(", ")}; got ${JSON.stringify(mode)}`,
    );
  }
}

// ─── Fail-closed fallback views ──────────────────────────────────────────────

/**
 * Conservative fallback: an UNBLANKED copy of the raw command plus a
 * best-effort token view. Safe direction — never hides executor bodies,
 * heredocs, redirects, or unknown syntax, so a downstream gate decision cannot
 * be weakened by a blanked view.
 */
function gateFallback(command, mode = "gate") {
  const normalized = typeof command === "string" ? command : "";
  let view = null;
  try {
    view = classifyPolicyTokens(normalized);
  } catch {
    view = null;
  }
  return {
    mode,
    regions: [],
    normalized,
    segments: view ? view.segments : [],
    containsExec: view ? view.containsExec : false,
    match_origin: "unknown",
    candidate_kind: "unclassified",
    classification_error: true,
  };
}

// ─── gate mode ───────────────────────────────────────────────────────────────

/**
 * Reproduce the promoted-rule strip chain used by `applyPromotedRules`:
 *   safeStripHeredocBodies (PROMOTED allowlist)
 *   -> applyInertSinkBlanking (echo/printf prose to inert sinks or no pipe)
 *   -> per-segment: stripMessageFlags -> stripNodeEvalBody ->
 *      stripDataCommandQuotes -> stripCliArgvPayload
 *   -> full-command: stripEchoProse(stripDataCommandQuotes(
 *        stripCliArgvPayload(stripNodeEvalBody(stripMessageFlags(...)))))
 *
 * Reuses the existing exported primitives verbatim so the classifier's gate
 * view and the real gate decision cannot drift. `normalized` is the blanked
 * command the regex match surface sees; `segments` is the quote-aware
 * splitSegments view.
 */
function buildGateView(command) {
  const heredocSafe = safeStripHeredocBodies(command, BLANKABLE_HEREDOC_VERBS_PROMOTED);
  const echoSafe = applyInertSinkBlanking(heredocSafe);
  const segments = splitSegments(echoSafe);
  const perSegment = segments.map((segment) =>
    stripCliArgvPayload(stripDataCommandQuotes(stripNodeEvalBody(stripMessageFlags(segment)))),
  );
  const full = stripEchoProse(
    stripDataCommandQuotes(
      stripCliArgvPayload(stripNodeEvalBody(stripMessageFlags(heredocSafe))),
    ),
  );
  return {
    mode: "gate",
    regions: [],
    normalized: full,
    perSegmentNormalized: perSegment,
    segments,
    match_origin: "unknown",
    candidate_kind: "unclassified",
  };
}

// ─── recurrence mode ─────────────────────────────────────────────────────────

/**
 * Reproduce the tracker-side coarser grouping view verbatim
 * (`blankDataPayloadsForKey` -> `normalizePrefixForKey`). A grouping artifact
 * only; carries no provenance claim.
 */
function buildRecurrenceView(command) {
  const blanked = blankDataPayloadsForKey(command);
  const normalized = normalizePrefixForKey(command);
  return {
    mode: "recurrence",
    regions: [],
    normalized,
    blanked,
    match_origin: "unknown",
    candidate_kind: "unclassified",
  };
}

// ─── quote-aware scanning ────────────────────────────────────────────────────

const QN = 0; // normal
const QS = 1; // single-quote
const QD = 2; // double-quote
const QB = 3; // after backslash outside quotes

/**
 * Scan a (sub)string and return properly-terminated quoted spans as
 * `{start, end, kind, substitution}` (end-exclusive). Single-quoted regions
 * never expand (POSIX). Double-quoted regions expand command substitution;
 * `substitution` is true when the region contains `$(...)` or backticks.
 *
 * Fail-closed on malformed input: an unterminated quote yields NO span (we
 * never guess inert origin for syntax the parser cannot prove).
 */
// Scan a `$(...)` substitution opening at `i` (the `$`), tracking paren depth,
// and return the index just past the closing `)`.
function scanDollarParen(source, i, n) {
  let depth = 0;
  let j = i + 1;
  while (j < n) {
    if (source[j] === "(") depth++;
    else if (source[j] === ")") { depth--; if (depth === 0) break; }
    j++;
  }
  return j + 1;
}

// Push a completed quoted span onto `spans` and reset the segment bookkeeping.
function pushQuotedSpan(spans, segStart, segKind, hasSubst, end) {
  if (segStart !== -1) spans.push({ start: segStart, end, kind: segKind, substitution: hasSubst });
  return { segStart: -1, segKind: null, hasSubst: false };
}

function collectQuotedInertSpans(source) {
  const spans = [];
  let state = QN;
  let segStart = -1;
  let segKind = null;
  let hasSubst = false;
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    if (state === QN) {
      if (ch === "\\") { state = QB; i++; continue; }
      if (ch === "'") { state = QS; segStart = i; segKind = "single"; hasSubst = false; i++; continue; }
      if (ch === '"') { state = QD; segStart = i; segKind = "double"; hasSubst = false; i++; continue; }
      i++;
      continue;
    }
    if (state === QB) { state = QN; i++; continue; }
    if (state === QS) {
      if (ch === "'") {
        ({ segStart, segKind, hasSubst } = pushQuotedSpan(spans, segStart, segKind, hasSubst, i + 1));
        state = QN;
      }
      i++;
      continue;
    }
    // QD
    if (ch === "\\") { i += 2; continue; }
    if (ch === "$" && source[i + 1] === "(") {
      hasSubst = true;
      i = scanDollarParen(source, i, n);
      continue;
    }
    if (ch === "`") {
      hasSubst = true;
      const end = source.indexOf("`", i + 1);
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (ch === '"') {
      ({ segStart, segKind, hasSubst } = pushQuotedSpan(spans, segStart, segKind, hasSubst, i + 1));
      state = QN;
    }
    i++;
  }
  return spans;
}

// ─── inert-span collection (event mode) ──────────────────────────────────────

/**
 * Malformed syntax we cannot prove: an unterminated single- or double-quoted
 * region (opening quote with no matching closer). The parser cannot prove what
 * that region is, so any match overlapping it must be `unknown` — never
 * guessed inert or executable.
 */
// Advance the quote-state machine one char. Returns the next state. Shared by
// collectMalformedRegions and segmentBoundary so the QN/QS/QD/QB walker stays
// in one place (mirrors blanking.js's walkQuoteState pattern).
function stepQuoteState(state, ch) {
  switch (state) {
    case QN:
      if (ch === "\\") return QB;
      if (ch === "'") return QS;
      if (ch === '"') return QD;
      return QN;
    case QB:
      return QN;
    case QS:
      return ch === "'" ? QN : QS;
    case QD:
      if (ch === "\\") return QD; // backslash escapes the next char inside dquote
      return ch === '"' ? QN : QD;
    default:
      return QN;
  }
}

function collectMalformedRegions(command) {
  const regions = [];
  let state = QN;
  let openStart = -1;
  let i = 0;
  const n = command.length;
  while (i < n) {
    const ch = command[i];
    if (state === QN && (ch === "'" || ch === '"')) { openStart = i; state = stepQuoteState(state, ch); i++; continue; }
    if (state === QB) { state = QN; i++; continue; }
    if (state === QS && ch === "'") { state = QN; openStart = -1; i++; continue; }
    if (state === QD) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === '"') { state = QN; openStart = -1; i++; continue; }
      i++;
      continue;
    }
    if (state === QN && ch === "\\") { state = QB; i++; continue; }
    i++;
  }
  if ((state === QS || state === QD) && openStart !== -1) {
    regions.push({ start: openStart, end: n, kind: state === QS ? "single" : "double" });
  }
  return regions;
}

// Pure-data commands whose quoted args are DATA (cannot exec): mirrors the
// gate's DATA_COMMANDS set.
const DATA_COMMAND_VERBS = new Set(["grep", "egrep", "fgrep", "rg", "jq"]);

/**
 * Quoted-delimiter heredoc bodies attached to a promoted-rule blankable verb
 * (DATA_COMMANDS ∪ {cat, tee} ∪ node-family) are data. Mirrors the span
 * geometry of `stripHeredocBodies`: quoting any part of the delimiter word
 * suppresses expansion; the terminator line is the delimiter with quoting
 * chars stripped; an unterminated body is blanked to end.
 *
 * Herestrings (`<<<`) and unquoted heredocs are never inert. Executor-verb
 * heredocs (bash/sh/python `<<'EOF'`) are never inert.
 */
// Parse one quoted-delimiter heredoc operator at `i` (the `<` of `<<`) and
// return `{ span, next }` where `span` is the inert body span (or null) and
// `next` is the index to resume scanning after the heredoc. Reused by
// collectHeredocInertSpans so the operator/delimiter/terminator parsing stays
// in one small helper.
function collectHeredocBodySpan(command, i, n) {
  let opEnd = i + 2;
  let stripTabs = false;
  if (command[opEnd] === "-") { stripTabs = true; opEnd++; }
  if (command[opEnd] === "<") return { span: null, next: opEnd + 1 }; // herestring
  let j = opEnd;
  while (j < n && (command[j] === " " || command[j] === "\t")) j++;
  let k = j;
  while (k < n && !/\s/.test(command[k])) k++;
  const delim = command.slice(j, k);
  if (delim.length === 0) return { span: null, next: i + 1 };
  const quoted = /['"\\]/.test(delim);
  const termDelim = delim.replace(/['"\\]/g, "");
  const verb = segmentVerbOfPrefix(command.slice(segmentBoundary(command, i), i));
  const blankable = quoted && verb !== null && BLANKABLE_HEREDOC_VERBS_PROMOTED.has(verb);
  const lineEnd = command.indexOf("\n", k);
  const bodyStart = lineEnd === -1 ? n : lineEnd + 1;
  const termStart = findHeredocTerminator(command, bodyStart, termDelim, stripTabs);
  const spanEnd = termStart === -1 ? n : termStart;
  const next = termStart === -1 ? n : (command.indexOf("\n", termStart) + 1 || n);
  return { span: blankable ? { start: bodyStart, end: spanEnd } : null, next };
}

function collectHeredocInertSpans(command) {
  // Kill-switch consistency: when GATE_HEREDOC_BLANKER=0 the gate's
  // stripHeredocBodies returns the command unchanged (no body blanked), so no
  // heredoc region is provably inert. Return no spans so the event view never
  // reports heredoc bodies as inert under the kill-switch — matching the gate
  // and the pre-filter/buildPromotedMatchResult kill-switch guards.
  if (process.env.GATE_HEREDOC_BLANKER === "0") return [];
  const spans = [];
  let i = 0;
  const n = command.length;
  let quoteState = QN;
  while (i < n) {
    const ch = command[i];
    if (quoteState === QN && ch === "\\") { quoteState = QB; i++; continue; }
    if (quoteState === QB) { quoteState = QN; i++; continue; }
    if (quoteState === QN && ch === "'") { quoteState = QS; i++; continue; }
    if (quoteState === QS) { if (ch === "'") quoteState = QN; i++; continue; }
    if (quoteState === QN && ch === '"') { quoteState = QD; i++; continue; }
    if (quoteState === QD) {
      if (ch === "\\") i += 2;
      else { if (ch === '"') quoteState = QN; i++; }
      continue;
    }
    // quoteState === QN
    if (ch === "<" && command[i + 1] === "<") {
      const { span, next } = collectHeredocBodySpan(command, i, n);
      if (span) spans.push(span);
      i = next;
      continue;
    }
    i++;
  }
  return spans;
}

// Start of the shell segment that ends at `pos` (boundary chars: ; & | newline).
// Quote-aware: a `;`/`&`/`|`/newline inside a quoted region is a literal body
// char, NOT a segment boundary. Forward-scans from 0 with the same QN/QS/QD/QB
// state machine used by collectQuotedInertSpans, recording the last boundary
// seen in QN. This matches the gate's forward quote-aware stripHeredocBodies
// `segmentStart` (which advances on `; & | \n` only in QUOTE_NORMAL), so the
// classifier's heredoc verb attribution cannot drift from the gate's. A
// backward scan cannot be made quote-aware without forward context, so this
// replaces the prior backward scan.
function segmentBoundary(command, pos) {
  let b = 0;
  let state = QN;
  let i = 0;
  const n = Math.min(pos, command.length);
  while (i < n) {
    const ch = command[i];
    if (state === QN) {
      if (ch === "\\") { state = QB; i++; continue; }
      if (ch === "'") { state = QS; i++; continue; }
      if (ch === '"') { state = QD; i++; continue; }
      if (ch === ";" || ch === "&" || ch === "|" || ch === "\n") b = i + 1;
      i++; continue;
    }
    if (state === QB) { state = QN; i++; continue; }
    if (state === QD && ch === "\\") { i += 2; continue; }
    if (ch === "'" && state === QS) { state = QN; i++; continue; }
    if (ch === '"' && state === QD) { state = QN; i++; continue; }
    i++; continue;
  }
  return b;
}

// Resolve the leading verb of a segment prefix with the shared flag-aware
// resolver (env-assignments, command prefixes, prefix-flag values skipped).
function segmentVerbOfPrefix(prefix) {
  const tokens = prefix.trim().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return null;
  const idx = resolveVerbIndex(tokens);
  if (idx === -1) return null;
  const v = tokens[idx];
  const i = v.lastIndexOf("/");
  return i === -1 ? v : v.slice(i + 1);
}

/**
 * Quoted eval-body span of `node -e|--eval|-p|--print "..."` / `'...'`. The
 * body is JS source — data to the shell gate — mirroring stripNodeEvalBody's
 * blanked region. Escaped-quote limitation mirrors the gate's documented one.
 */
function collectNodeEvalBodySpan(command) {
  const re = /\b(?:node|nodejs)\s+(?:-e|--eval|-p|--print)\s+(["'])/g;
  const spans = [];
  let m;
  while ((m = re.exec(command)) !== null) {
    const quote = m[1];
    const bodyStart = m.index + m[0].length;
    const bodyEnd = command.indexOf(quote, bodyStart);
    if (bodyEnd !== -1) spans.push({ start: bodyStart, end: bodyEnd });
  }
  return spans;
}

/**
 * Quoted-arg spans of segments whose verb is a pure-data command
 * (grep/egrep/fgrep/rg/jq) — the class stripDataCommandQuotes blanks. Data
 * commands cannot exec, so every quoted region in such a segment is inert
 * (including `$(...)`-containing ones, matching blankAllQuoted).
 */
function collectDataCommandQuotedSpans(command) {
  const spans = [];
  let from = 0;
  for (const segText of splitSegments(command)) {
    const start = command.indexOf(segText, from);
    if (start === -1) continue;
    const verb = segmentVerbOfPrefix(segText);
    if (verb !== null && DATA_COMMAND_VERBS.has(verb)) {
      for (const s of collectQuotedInertSpans(segText)) {
        // A `$(...)` or backtick inside a double-quoted data-command arg is a
        // command substitution — the shell EXECUTES it before the data command
        // runs — so that region is NOT inert data. Exclude substitution-bearing
        // spans so a raw match inside `$(...)` classifies executable (visible),
        // never inert-data. Mirrors applyInertSinkBlanking's tokenHasCommandSubst
        // withhold (gate-logic.js): command substitutions stay visible. A
        // literal quoted pattern (no substitution) stays inert, matching the
        // gate's data-command blanking for non-executing quoted args.
        if (s.substitution) continue;
        spans.push({ start: start + s.start, end: start + s.end });
      }
    }
    from = start + segText.length;
  }
  return spans;
}

/**
 * Inert-sink echo/printf prose: the regions `applyInertSinkBlanking` actually
 * blanks (bare echo/printf with no real pipe, or a real-pipe chain ending at a
 * configured inert sink with no redirect and no exec segment). The blanker
 * replaces blanked quoted tokens with equal-length whitespace, so the inert
 * spans are the exact char diff between the raw command and its blanked form —
 * reusing the primitive itself rather than forking its policy.
 *
 * The diff is fragmented: a blanked quoted token like `"a b c"` becomes
 * `"     "`, so its interior literal spaces are identical in both strings and
 * split the diff into per-word runs. Runs separated ONLY by a gap that is
 * all-whitespace and identical in both strings belong to the same blanked
 * token and are merged into one span (the quoted token's full source span).
 */
function collectInertSinkProseSpans(command) {
  let blanked;
  try {
    blanked = applyInertSinkBlanking(command);
  } catch {
    return []; // fail-closed: no inert claim
  }
  if (blanked.length !== command.length) return []; // not length-preserving: no diff
  const runs = [];
  let runStart = -1;
  for (let i = 0; i < command.length; i++) {
    if (command[i] !== blanked[i]) {
      if (runStart === -1) runStart = i;
    } else if (runStart !== -1) {
      runs.push([runStart, i]);
      runStart = -1;
    }
  }
  if (runStart !== -1) runs.push([runStart, command.length]);
  const spans = [];
  for (const [a, b] of runs) {
    const last = spans[spans.length - 1];
    if (last && shouldMergeGap(last, a, command, blanked)) {
      last.end = b; // merge into the previous span
      continue;
    }
    spans.push({ start: a, end: b });
  }
  return spans;
}

// True when the gap between the previous span's end and a run start is
// all-whitespace AND identical in the raw command and its blanked form — i.e.
// the gap is interior literal whitespace of one blanked quoted token, so the
// two runs belong to the same span.
function shouldMergeGap(prev, a, command, blanked) {
  const gap = command.slice(prev.end, a);
  return gap === blanked.slice(prev.end, a) && /^\s*$/.test(gap);
}

/**
 * Every inert span for event-mode provenance:
 *   - quoted heredoc bodies (promoted allowlist)
 *   - node -e / --eval / -p / --print bodies
 *   - pure-data-command (grep/jq) quoted args
 *   - inert-sink echo/printf prose
 */
function collectAllInertSpans(command) {
  return [
    ...collectHeredocInertSpans(command),
    ...collectNodeEvalBodySpan(command),
    ...collectDataCommandQuotedSpans(command),
    ...collectInertSinkProseSpans(command),
  ];
}

// ─── raw match detection + span proof (event mode) ───────────────────────────

/**
 * All non-overlapping matches of `pattern` (a raw regex SOURCE string) in
 * `command`, with absolute [start, end) offsets. The pattern is used for
 * telemetry only. Returns [] when the pattern is empty/invalid.
 */
function findPatternMatches(command, pattern) {
  if (!pattern || typeof pattern !== "string") return [];
  let re;
  try {
    re = new RegExp(pattern, "g");
  } catch {
    return [];
  }
  const matches = [];
  let m;
  while ((m = re.exec(command)) !== null) {
    if (m[0].length === 0) { re.lastIndex++; continue; }
    matches.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return matches;
}

/**
 * Classify one raw match against the inert spans and malformed regions.
 *   - overlapping malformed (unterminated-quote) syntax -> unknown
 *   - no overlap            -> executable
 *   - fully inside ONE span -> inert-data
 *   - partial overlap or multi-cover -> unknown (never guess inert)
 */
function classifyMatch(match, spans, malformed, command) {
  if (match.start < 0 || match.end > command.length) return { origin: "unknown" };
  if (malformed.some((s) => s.start < match.end && s.end > match.start)) return { origin: "unknown" };
  const overlaps = spans.filter((s) => s.start < match.end && s.end > match.start);
  if (overlaps.length === 0) return { origin: "executable" };
  const contained = overlaps.filter((s) => s.start <= match.start && s.end >= match.end);
  if (contained.length === 1) return { origin: "inert-data", region: contained[0] };
  return { origin: "unknown" };
}

// ─── event regions (per-segment provenance) ──────────────────────────────────

function buildEventRegions(command, spans, malformed) {
  const regions = [];
  let from = 0;
  for (const segText of splitSegments(command)) {
    const start = command.indexOf(segText, from);
    if (start === -1) { continue; }
    const end = start + segText.length;
    const overlaps = spans.filter((s) => s.start < end && s.end > start);
    const mal = malformed.some((s) => s.start < end && s.end > start);
    let origin = "executable";
    if (mal) {
      origin = "unknown";
    } else if (overlaps.length > 0) {
      const fully = overlaps.some((s) => s.start <= start && s.end >= end);
      origin = fully ? "inert-data" : "mixed";
    }
    regions.push({ kind: "segment", start, end, text: segText, origin });
    from = end;
  }
  return regions;
}

// ─── main entry ──────────────────────────────────────────────────────────────

/**
 * Classify a command into a mode-aware semantic view.
 *
 * @param {string|null|undefined} command
 * @param {object} [options]
 * @param {"gate"|"recurrence"|"event"} [options.mode="gate"]
 * @param {string} [options.rulePattern] — promoted-rule regex SOURCE string
 *   (event mode only; must be a string, never a RegExp).
 * @returns {object} mode-aware view (see buildGateView / buildRecurrenceView /
 *   buildEventView).
 */
export function classifyCommand(command, options = {}) {
  const { mode = "gate", rulePattern } = options;

  // Never throw: an invalid mode or internal exception must degrade to the
  // fail-closed fallback view, never propagate into a gate decision path
  // (where a throw inside the evaluator's try/catch would skip the rule and
  // could turn a matched command into `{decision:"ok"}`).
  try {
    assertValidMode(mode);
  } catch {
    return gateFallback(command, mode);
  }

  if (command == null || command === "") {
    // Empty/null command: conservative empty view. `classification_error` is
    // only set for null (an absent command is genuinely indeterminate); an
    // empty string is a valid no-op command, not an error.
    if (command === "") {
      return { ...gateFallback(command, mode), classification_error: undefined };
    }
    return gateFallback(command, mode);
  }

  try {
    if (mode === "gate") return buildGateView(command);
    if (mode === "recurrence") return buildRecurrenceView(command);
    return buildEventView(command, rulePattern);
  } catch {
    if (mode === "gate") return gateFallback(command);
    return {
      mode,
      regions: [],
      normalized: command,
      match_origin: "unknown",
      candidate_kind: "unclassified",
      classification_error: true,
    };
  }
}

function buildEventView(command, rulePattern) {
  // Pass 1: raw regex detection (telemetry only — never a permission decision).
  const matches = rulePattern ? findPatternMatches(command, rulePattern) : [];
  const spans = collectAllInertSpans(command);
  const malformed = collectMalformedRegions(command);
  const gateView = buildGateView(command);

  let match_origin = "unknown";
  let candidate_kind = "unclassified";
  let rawMatch = null;
  const classified = matches.map((m) => ({ ...m, ...classifyMatch(m, spans, malformed, command) }));
  if (classified.length === 0) {
    // The gate matched (or not) without a stable raw match — no provenance.
    match_origin = "unknown";
    candidate_kind = "unclassified";
  } else if (classified.every((c) => c.origin === "inert-data")) {
    match_origin = "inert-data";
    candidate_kind = "unexpected-match";
    rawMatch = classified[0];
  } else if (classified.every((c) => c.origin === "executable")) {
    match_origin = "executable";
    candidate_kind = "ordinary-rule-fire";
    rawMatch = classified[0];
  } else {
    // Mixed (inert + executable) or any unknown: fail closed.
    match_origin = classified.some((c) => c.origin === "unknown") ? "unknown" : "mixed";
    candidate_kind = "unclassified";
    rawMatch = classified[0];
  }

  return {
    mode: "event",
    regions: buildEventRegions(command, spans, malformed),
    normalized: gateView.normalized,
    perSegmentNormalized: gateView.perSegmentNormalized,
    segments: gateView.segments,
    match_origin,
    candidate_kind,
    rawMatch,
    matches: classified,
  };
}
