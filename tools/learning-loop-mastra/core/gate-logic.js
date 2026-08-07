const MARKER_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Pure gate decision logic — no I/O, fully testable.
 * Single source of truth for constraint patterns and gate decisions.
 *
 * Strip functions (`splitSegments`, `stripMessageFlags`, `stripNodeEvalBody`)
 * form a layered pipeline: a command is split into segments, then each
 * segment is stripped of message-flag bodies and (for `node -e` wrappers) the
 * eval body. The regex matching constraint patterns sees only the command verb.
 * The `node -e` strip is asymmetric by user-stated design (see
 * `stripNodeEvalBody` JSDoc and finding
 * `meta-260615T1915Z-node-e-strip-bypass-risk`).
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { SURFACES } from "./surfaces.js";
import { classifyPolicyTokens, resolveVerbIndex } from "./shell-parse.js";
import { readRegistry, metaStateRuleEntrySchema, readFileIndex } from "./meta-state.js";
import { computeFileHash, TERMINAL_HASH_REGEX } from "./check-grounding.js";
import { readGateOverride } from "./gate-override.js";
import { resolveSafePath, PathContainmentError } from "./path-containment.js";
import { isOpen } from "./stale-view.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATTERNS_RAW = JSON.parse(readFileSync(join(__dirname, "patterns.json"), "utf8"));

const CONSTRAINT_PATTERNS = Object.fromEntries(
  Object.entries(PATTERNS_RAW).map(([key, pattern]) => [key, new RegExp(pattern)])
);

// Gate-verbs: structured list of executor verbs (direct + indirection) that
// become observation-gated constraints. Loaded from patterns.json — NOT a
// hardcoded list. Each entry is either a bare string ("bash") for verb-only
// match, or an object {verb, flags} for verb+flag match (e.g. node -e), or
// {verb, indirection: true} for verbs that only count when followed by an
// executor (env bash, xargs bash).
// Verb matching uses basename normalization so PATH-qualified /bin/bash
// matches the bash entry.
const GATE_VERBS = (() => {
  const raw = PATTERNS_RAW["gate-verbs"];
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) =>
    typeof entry === "string"
      ? { verb: entry, flags: null, indirection: false }
      : {
          verb: entry.verb,
          flags: Array.isArray(entry.flags) ? entry.flags : null,
          indirection: entry.indirection === true,
        },
  );
})();

// Indirection verbs (env, xargs) ONLY count as gate-verbs when followed by
// an executor. Derived from the same patterns.json config as GATE_VERBS so
// the match path and the observation path (file-readers.js, also config-
// derived) can never drift: removing a verb from config removes it from
// both. `find` is a verb+flag entry (-exec/-execdir/-ok), not indirection.
const INDIRECTION_VERBS = new Set(
  GATE_VERBS.filter((e) => e.indirection).map((e) => e.verb),
);

// `records-evidence` was the only observation-based unlock for `records/evidence/**`.
// It was migrated to meta-state (the meta-surface reframe) and the unlock removed.
// Direct writes to `records/**` are now blocked unconditionally by write-gate.js.
const WRITE_PATH_PATTERNS = {
  'records-index': ['records/index/**', 'records/*/index/**'],
  'records-capabilities': ['records/capabilities/**', 'records/*/capabilities/**'],
};

function expandBraces(pattern) {
  const match = pattern.match(/^(.*?)\{([^}]+)\}(.*)$/);
  if (!match) return [pattern];
  const [, pre, options, post] = match;
  return options.split(',').flatMap((opt) => expandBraces(pre + opt.trim() + post));
}

export function globMatch(pattern, filePath) {
  const patterns = expandBraces(pattern);
  return patterns.some((p) => {
    const regexStr = p
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '⟨GLOBSTAR⟩')
      .replace(/\*/g, '[^/]*')
      .replace(/⟨GLOBSTAR⟩/g, '.*');
    const regex = new RegExp(`^${regexStr}$`);
    return regex.test(filePath);
  });
}

function pathMatchesObservation(observation, filePath) {
  if (observation.constraint_type !== 'write-path') return false;
  if (observation.status !== 'active') return false;
  const patterns = WRITE_PATH_PATTERNS[observation.constraint];
  if (!patterns) return false;
  return patterns.some((p) => globMatch(p, filePath));
}

const SEGMENT_SEPARATORS = /[;&|]+/;

const MESSAGE_FLAGS = new Set(PATTERNS_RAW.message_flags || []);

/**
 * Split a command on `;`, `&`, `|` separators — quote-aware.
 *
 * A naive `command.split(/[;&|]+/)` would fragment a quoted message body
 * like `git commit -m "a;b" -m "c|d"` on the `;` and `|` inside the
 * quoted strings, causing downstream `stripMessageFlags` to miss the
 * message body and the regex to match tokens that should be inside the
 * body. This is the splitSegments-quote-unaware bug
 * (see finding meta-260606T0301Z-...).
 *
 * The state machine tracks:
 *  - single-quote state (POSIX shell: no escapes inside `'...'`)
 *  - double-quote state (POSIX shell: backslash escapes some chars inside `"..."`)
 *  - backslash escape (consumes the next char literally)
 *
 * Separators are only split on when NOT inside a quote and NOT escaped.
 * Each resulting segment is trimmed; empty segments are dropped (same
 * as the prior behavior).
 */
/**
 * Quote-aware character walker. Drives a POSIX-style state machine over a
 * command string and dispatches per-character events to `hooks`. Used to
 * share the same tokenizer across `splitSegments`, `splitKeepingDelims`,
 * and `blankAllQuoted`'s internal step machine, eliminating the 60-line
 * duplication that fallow flagged.
 *
 * Hooks (both required; use no-ops if a hook is irrelevant for the caller):
 *   onChar(ch, i)        — fires for every character except command delimiters
 *                           `;`, `&`, `|` outside quotes. Includes the quote
 *                           chars (`'`, `"`) and the escape char (`\\`) so
 *                           callers that buffer raw output stay lossless.
 *   onDelimiter(ch, i)   — fires for `;`, `&`, `|` outside quotes. Never fires
 *                           inside a quoted region.
 *
 * State semantics (POSIX-like):
 *   - Outside quotes: `\\` opens an escape (next char is literal), `'` enters
 *     single quotes, `"` enters double quotes.
 *   - Inside single quotes: literal until next `'`. Backslash is literal too.
 *   - Inside double quotes: `\\` opens an escape (next char is literal), `"`
 *     exits.
 *
 * Implementation note: each state is handled by its own small function. The
 * dispatch is `O(1)` per char and the per-state functions stay under the
 * fallow cognitive-complexity threshold on their own.
 *
 * @param {string} command
 * @param {{
 *   onChar: (ch: string, i: number) => void,
 *   onDelimiter: (ch: ";" | "&" | "|", i: number) => void,
 * }} hooks
 */
function walkQuoteState(command, hooks) {
  let state = QUOTE_NORMAL;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    state = advanceQuoteState(state, ch, i, hooks);
  }
}

// State constants — kept private to the walker. Five states capture the full
// POSIX-like behavior (outside, single-quoted, double-quoted, after-backslash
// outside, after-backslash inside-double-quotes).
const QUOTE_NORMAL = 0;
const QUOTE_SQUOTE = 1;
const QUOTE_DQUOTE = 2;
const QUOTE_AFTER_BS = 3;
const QUOTE_DQUOTE_BS = 4;

function advanceQuoteState(state, ch, i, hooks) {
  switch (state) {
    case QUOTE_NORMAL:   return stepNormal(ch, i, hooks);
    case QUOTE_SQUOTE:   return stepSquote(ch, i, hooks);
    case QUOTE_DQUOTE:   return stepDquote(ch, i, hooks);
    case QUOTE_AFTER_BS: return stepAfterBs(ch, i, hooks);
    case QUOTE_DQUOTE_BS: return stepDquoteBs(ch, i, hooks);
    default: return state;
  }
}

function stepNormal(ch, i, hooks) {
  if (ch === "\\") { hooks.onChar(ch, i); return QUOTE_AFTER_BS; }
  if (ch === "'")  { hooks.onChar(ch, i); return QUOTE_SQUOTE; }
  if (ch === '"')  { hooks.onChar(ch, i); return QUOTE_DQUOTE; }
  if (ch === ";" || ch === "&" || ch === "|") {
    hooks.onDelimiter(ch, i);
    return QUOTE_NORMAL;
  }
  hooks.onChar(ch, i);
  return QUOTE_NORMAL;
}

function stepSquote(ch, i, hooks) {
  hooks.onChar(ch, i);
  return ch === "'" ? QUOTE_NORMAL : QUOTE_SQUOTE;
}

function stepDquote(ch, i, hooks) {
  hooks.onChar(ch, i);
  if (ch === "\\") return QUOTE_DQUOTE_BS;
  return ch === '"' ? QUOTE_NORMAL : QUOTE_DQUOTE;
}

function stepAfterBs(ch, i, hooks) {
  hooks.onChar(ch, i);
  return QUOTE_NORMAL;
}

function stepDquoteBs(ch, i, hooks) {
  hooks.onChar(ch, i);
  return QUOTE_DQUOTE;
}

export function splitSegments(command) {
  if (!command || typeof command !== "string") return [];
  const segments = [];
  let buf = "";
  walkQuoteState(command, {
    onChar: (ch) => { buf += ch; },
    onDelimiter: () => {
      const trimmed = buf.trim();
      if (trimmed) segments.push(trimmed);
      buf = "";
    },
  });
  const trimmed = buf.trim();
  if (trimmed) segments.push(trimmed);
  return segments;
}

/**
 * Strip message flags and their values from a command segment.
 * Quoted multi-word values (e.g., "fix pnpm add issue") are skipped as a block.
 * Unquoted values are skipped as a single token.
 * This prevents false positives from commit messages, PR titles, etc.
 */
export function stripMessageFlags(segment) {
  const tokens = segment.split(/\s+/);
  const result = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (MESSAGE_FLAGS.has(token)) {
      i++;
      if (i < tokens.length) {
        const next = tokens[i];
        if (next.startsWith('"') || next.startsWith("'")) {
          const quote = next[0];
          // Skip until we find the token ending the quoted block
          while (i < tokens.length && !tokens[i].endsWith(quote)) {
            i++;
          }
          i++; // Skip the closing token (or the single self-closed token)
        } else {
          // Unquoted value: skip exactly one token
          i++;
        }
      }
      continue;
    }
    result.push(token);
    i++;
  }
  return result.join(" ");
}

/**
 * Strip the body of a `node -e|--eval|-p|--print` wrapper.
 *
 * The body of a `node -e "..."` command is a JavaScript string literal in
 * shell. The regex matching constraint patterns (e.g., the G8 promoted rule
 * `rule-no-new-artifact-types`) should not see trigger phrases inside that
 * body, just like `stripMessageFlags` keeps `git commit -m "..."` message
 * bodies out of the regex's view.
 *
 * Asymmetric by user-stated design: this strips only `node` wrappers.
 * `python -c`, `bash -c`, `ruby -e`, `perl -e`, `sh -c` are NOT stripped
 * because their bodies are real commands (the existing 3 tests at
 * `__tests__/gate-logic-quoted-strings.test.js` lock this asymmetry).
 *
 * Bypass risk: `node -e "require('child_process').exec('pip install vnstock')"`
 * no longer matches the `package-manager` constraint (the command is inside the
 * blanked body). This is an accepted bypass, not a fix; the operator-stated
 * design chose asymmetry (only node, not python-c/bash-c). Catch-net: the
 * `gate_check_recurrence` MCP tool auto-files a finding
 * via `meta_state_report` if `node -e "..."` matches a constraint N>=3 times in
 * M<=10min.
 *
 * @param {string} segment - A single command segment (output of `splitSegments`).
 * @returns {string} The segment with the body of any `node -e|--eval|-p|--print` wrapper blanked.
 */
export function stripNodeEvalBody(segment) {
  if (typeof segment !== "string" || !segment) return segment;
  // Match: (node|nodejs) ( -e | --eval | -p | --print ) "..." or '...'
  // Replace the quoted body with an empty placeholder. E.g.:
  //   node -e "foo bar"   ->   node -e ""
  //   node --eval 'baz'   ->   node --eval ''
  //   node -e "a" -e "b"  ->   node -e "" -e ""  (g flag handles multiple)
  // Known limitation: escaped quotes inside the eval body are not recognised,
  // e.g. `node -e "console.log(\"docker run\")"` stops at the first `"`.
  // This is rare in agent flows; if it recurs, extend the regex or replace it
  // with the quote-aware state machine from `splitSegments`.
  return segment.replace(
    /\b(node|nodejs)\s+(-e|--eval|-p|--print)\s+(["'])(?:(?!\3).)*\3/g,
    (match, _node, _flag, quote) => match.replace(/(["'])(?:(?!\1).)*\1/, `${quote}${quote}`)
  );
}

/**
 * Pure-data commands: grep/egrep/fgrep, rg, jq. Their quoted pattern args are
 * DATA, not commands — they cannot execute subcommands from a pattern string
 * — so banned tokens appearing only inside a search pattern (e.g.
 * `grep -E "pnpm test|grep" file`, `jq '.x | test("t")'`) are not real
 * violations. Blank those quoted args so rule regexes don't false-positive on
 * them. Same false-positive class `stripMessageFlags`/`stripNodeEvalBody` close
 * for `git -m` / `node -e`; this closes it for the pure-data command family.
 *
 * Asymmetric by design (cf. stripNodeEvalBody + the locked tests in
 * gate-logic-quoted-strings.test.js): we do NOT strip for echo/sed/awk/bash-c/
 * sh-c/python-c/ssh-t — their quoted bodies are either executed (bypass risk:
 * `awk 'system("…")'`, `bash -c "…"` runs) or a locked accepted limitation
 * (echo/heredoc). A data verb is recognized only when it STARTS a segment or
 * follows a command prefix (sudo/time/nice/nohup/command), so `echo grep "…"`
 * (grep is an echo argument) is NOT treated as a data command and keeps the
 * echo-limitation behavior. Env-assignment prefixes (`FOO=bar grep`) are not
 * recognized — rare; extend segmentVerb if observed.
 */
const DATA_COMMANDS = new Set(["grep", "egrep", "fgrep", "rg", "jq"]);
const COMMAND_PREFIXES = new Set(["sudo", "time", "nice", "nohup", "command"]);

// First executable token of a segment. Delegates to the shared flag-aware
// resolver in shell-parse.js so this strip chain resolves verbs exactly the
// way the per-segment policy view does: env-assignments, command-prefixes
// (sudo/time/nice/nohup/command), prefix flags, and the detached values of
// value-taking prefix flags (`nice -n 5`) are skipped, and the verb is
// basename-normalized. Without the flag skip, `nice -n 5 echo "x" | tail`
// resolved its verb as `5`, leaving echo prose un-blanked and
// false-escalating the full-command pass.
function segmentVerb(segment) {
  const tokens = segment.trim().split(/\s+/);
  const idx = resolveVerbIndex(tokens);
  return idx === -1 ? null : basename(tokens[idx]);
}

// State machine for `blankAllQuoted` — quote-aware content blanking. Differs
// from `walkQuoteState` because the blanking transformation has different
// escape semantics: `\\` is preserved in the output (so the resulting string
// stays shell-parseable), but the char it escapes is dropped (since it's the
// "invisible" payload). See `blankAllQuoted` for the policy.
//
// Five states capture the full behavior. Returning the next-state from
// `blankAllQuotedStep` lets the main loop stay flat (one for-loop, one helper
// call), keeping cognitive complexity under the fallow threshold.
const BLANK_NORMAL = 0;
const BLANK_SQUOTE = 1;
const BLANK_DQUOTE = 2;
const BLANK_AFTER_BS = 3;       // outside-quotes backslash; next char is dropped
const BLANK_DQUOTE_BS = 4;      // inside-double-quotes backslash; next char is dropped

function blankStep(state, ch) {
  switch (state) {
    case BLANK_NORMAL:
      if (ch === "\\") return { next: BLANK_AFTER_BS, emit: "\\" };
      if (ch === "'") return { next: BLANK_SQUOTE, emit: "" };
      if (ch === '"') return { next: BLANK_DQUOTE, emit: "" };
      return { next: state, emit: ch };
    case BLANK_SQUOTE:
      if (ch === "'") return { next: BLANK_NORMAL, emit: "''" };
      return { next: state, emit: "" };
    case BLANK_DQUOTE:
      if (ch === "\\") return { next: BLANK_DQUOTE_BS, emit: "" };
      if (ch === '"') return { next: BLANK_NORMAL, emit: '""' };
      return { next: state, emit: "" };
    case BLANK_AFTER_BS:
      return { next: BLANK_NORMAL, emit: "" };
    case BLANK_DQUOTE_BS:
      return { next: BLANK_DQUOTE, emit: "" };
    default:
      return { next: state, emit: ch };
  }
}

// Blank every quoted region (single or double, quote-aware — a quote inside
// the other quote kind is a literal body char, not a terminator). Used on a
// segment whose verb is a pure-data command, where every quoted region is
// data (pattern + any quoted filenames), so dropping their content is safe
// and creates no bypass (data commands cannot exec).
function blankAllQuoted(segment) {
  let out = "";
  let state = BLANK_NORMAL;
  for (let i = 0; i < segment.length; i++) {
    const step = blankStep(state, segment[i]);
    state = step.next;
    out += step.emit;
  }
  return out;
}

// Quote-aware split on ; & | PRESERVING delimiters as elements (so the
// full-command pass can rejoin losslessly and spanning patterns like
// `(vitest run|pnpm test).*\| *(tail|head|grep)` still match). Uses the same
// `walkQuoteState` tokenizer as `splitSegments`; the only difference is the
// delimiter handler — `splitSegments` flushes a trimmed segment, while this
// function pushes both the raw span and the delimiter as separate elements so
// the downstream regex pass can rejoin losslessly.
function splitKeepingDelims(command) {
  const out = [];
  let buf = "";
  walkQuoteState(command, {
    onChar: (ch) => { buf += ch; },
    onDelimiter: (ch) => { out.push(buf, ch); buf = ""; },
  });
  out.push(buf);
  return out;
}

// Blank quoted args of every segment whose verb matches `verbMatch`. Shared
// core for stripDataCommandQuotes (pure-data verbs), stripEchoProse (non-
// executing output verbs), and stripCliArgvPayload (loop CLI inline-JSON
// argv): all blank non-executing quoted prose so rule regexes do not
// false-positive on banned tokens that cannot run. `verbMatch` is either a
// Set of verb names (matched against segmentVerb) or a predicate
// `(segment) => boolean`; `blanker` defaults to `blankAllQuoted`.
function blankQuotedArgsFor(command, verbMatch, blanker = blankAllQuoted) {
  if (typeof command !== "string" || !command) return command;
  const match = typeof verbMatch === "function"
    ? verbMatch
    : (segment) => verbMatch.has(segmentVerb(segment));
  const parts = splitKeepingDelims(command);
  let changed = false;
  for (let i = 0; i < parts.length; i++) {
    // Delimiter tokens are single chars ; & | — never blanked verbs.
    if (parts[i].length === 1 && (parts[i] === ";" || parts[i] === "&" || parts[i] === "|")) continue;
    if (match(parts[i])) {
      parts[i] = blanker(parts[i]);
      changed = true;
    }
  }
  return changed ? parts.join("") : command;
}

// fallow-ignore-next-line unused-export -- public API consumed by gate-logic-data-command-quotes.test.js; also used internally by matchConstraintPattern
export function stripDataCommandQuotes(command) {
  return blankQuotedArgsFor(command, DATA_COMMANDS);
}

// Non-executing output verbs: echo/printf. Their quoted args are printed prose,
// not commands — banned tokens inside them cannot execute — so blanking creates
// no bypass (same false-positive class stripDataCommandQuotes closes for
// grep/jq). This blanket form is used by the full-command pass, where echo prose
// on one side of a REAL pipe cannot pair with a read-only grep/tail/head on the
// other to false-escalate. The per-segment pass uses the stricter
// stripEchoProseSafe below (blanking withheld on a redirect or a real pipe),
// and matchConstraintPattern strips no echo prose at all. Executed-body verbs
// (bash -c, sh -c, python -c, awk, sed) are NOT here — their quoted bodies run.
const ECHO_PROSE_COMMANDS = new Set(["echo", "printf"]);
function stripEchoProse(command) {
  return blankQuotedArgsFor(command, ECHO_PROSE_COMMANDS);
}

// True when the segment at `parts[i]` sends its output to a file. A redirect
// persists the printed prose somewhere a sibling segment can later execute
// (`echo "banned" > f && bash f`), so a redirecting echo segment must keep its
// prose visible.
//
// The in-segment scan reuses blankAllQuoted rather than adding a tokenizer: it
// drops quoted bodies (so `echo "a > b"` — data — reads clean) and drops
// backslash-escaped chars (so a literal `\>` is not a redirect), while emitting
// unquoted chars verbatim.
//
// `&>` and `&>>` (redirect stdout+stderr) need the extra check: walkQuoteState
// treats `&` as a delimiter, so the `>` opens the NEXT part and the in-segment
// scan cannot see it. Missing that splits the redirect across the tokenizer
// boundary and blanks prose that is in fact being persisted.
function segmentHasRedirect(parts, i) {
  if (/[<>]/.test(blankAllQuoted(parts[i]))) return true;
  return parts[i + 1] === "&" && /^\s*>/.test(parts[i + 2] ?? "");
}

// True when the segment at `parts[i]` pipes its stdout into the next segment.
// `parts` comes from splitKeepingDelims: [segment, delim, segment, delim, …],
// so parts[i+1] is the delimiter that follows the segment.
//
// Only a real `|` routes stdout onward. `;`, `&`, `&&` and end-of-command do
// not — `echo "X" && bash` runs bash with its OWN stdin. `||` is emitted as two
// adjacent `|` delimiter tokens with an EMPTY segment between them; that empty
// segment is what distinguishes logical-OR from a pipe CHAIN (`a | b | c`,
// where the middle segment is non-empty and the first pipe is real). Getting
// that distinction wrong in the permissive direction would blank prose feeding
// a real pipeline and reopen the exec-sink bypass, so the empty-segment check
// is required, not cosmetic.
function followedByRealPipe(parts, i) {
  if (parts[i + 1] !== "|") return false;
  const isLogicalOr = parts[i + 3] === "|" && parts[i + 2].trim() === "";
  return !isLogicalOr;
}

// `printf -v VAR ...` does NOT print — it assigns the formatted result to a
// shell variable, which a later segment can then execute:
//   printf -v x "banned cmd" && sh -c "$x"
// That makes it an assignment, not prose, so its args are never blanked. The
// flag is read AFTER blankAllQuoted so a quoted literal (`printf "%s" "-v"` —
// genuinely prose) does not trip it. Matches both `-v x` and attached `-vx`.
function printfAssignsToVariable(segment) {
  return /(^|\s)-v/.test(blankAllQuoted(segment));
}

// Per-segment echo/printf prose blanking, withheld wherever the printed output
// could reach something that executes it. Blanks a segment's quoted args iff
// the segment has no redirect AND is not followed by a real `|` pipe.
//
// This is deliberately narrower than the blanket stripEchoProse above, which
// the full-command pass keeps using. Promoted-rule-only tokens (vitest,
// artifact) have NO matchConstraintPattern backstop — applyPromotedRules is
// their only gate — so this relaxation has to be non-bypassable on its own
// rather than leaning on a downstream check. Preserving on ANY real pipe,
// regardless of target, is what buys that: classifying pipe targets as
// inert-vs-executing is unsound (tee/dd/cat persist, and the exec-sink tail is
// unbounded). Quote-kind awareness comes from blankInertQuoted: single quotes
// are always inert, double quotes only when free of `$(`/backtick.
function stripEchoProseSafe(command) {
  if (typeof command !== "string" || !command) return command;
  const parts = splitKeepingDelims(command);
  // `exec` rewrites the shell's own file descriptors for every LATER segment
  // (`exec > f ; echo "banned" ; bash f` persists the prose without the echo
  // segment carrying any redirect of its own), which invalidates the
  // per-segment reasoning below. Reading fd state is unbounded, so any exec
  // segment simply disables blanking for the whole command.
  if (parts.some((p) => segmentVerb(p) === "exec")) return command;
  let changed = false;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].length === 1 && (parts[i] === ";" || parts[i] === "&" || parts[i] === "|")) continue;
    const verb = segmentVerb(parts[i]);
    if (!ECHO_PROSE_COMMANDS.has(verb)) continue;
    if (verb === "printf" && printfAssignsToVariable(parts[i])) continue;
    if (segmentHasRedirect(parts, i) || followedByRealPipe(parts, i)) continue;
    parts[i] = blankInertQuoted(parts[i]);
    changed = true;
  }
  return changed ? parts.join("") : command;
}

// Loop CLI inline-JSON argv: the canonical loop tool surface is
//   `node .../bin/loop.mjs <tool> '<json>'`
// where the quoted JSON argument is user-supplied DATA (it is JSON.parse'd +
// zod-dispatched by bin/loop.mjs — never exec'd; see the static bypass guard
// in gate-logic-cli-argv-payload.test.js). A banned test-pipe pattern inside
// that JSON is not a real violation. stripCliArgvPayload blanks that quoted
// argv so rule regexes see only the command verb. Same false-positive class
// stripDataCommandQuotes closes for grep/jq and stripNodeEvalBody for `node -e`.
//
// Quote-kind-aware (the critical bypass guard): single-quoted regions are
// always inert (POSIX: no expansion) → blanked. Double-quoted regions are
// blanked ONLY when free of command substitution (`$(...)` and backticks) —
// a double-quoted `"$(pnpm test | tail)"` is shell-expanded before node runs,
// so it IS a real execution and must stay visible to the regex.
//
// Recognition is anchored: the script-path token must end with `bin/loop.mjs`
// and sit positionally right after the node-family verb (skipping env-assigns
// and one command prefix, mirroring segmentVerb). NOT `/loop\.mjs\b/` anywhere
// (that would blank `node evil.mjs ... loop.mjs` or `--name "loop.mjs"`).
// Accepted limitation: `node --inspect .../bin/loop.mjs` (a node flag between
// verb and script) is not recognized — conservative (no bypass; may
// false-positive). The canonical loop CLI form has no such flag.

// Node-family verb: `node`, `nodejs`, or an absolute/basename path ending in
// either (e.g. `/usr/bin/node`, `./nodejs`).
const NODE_VERB_RE = /(^|\/)(node|nodejs)$/;

// True for a segment that is a canonical `node .../bin/loop.mjs <tool> ...`
// invocation. Positional: the token immediately after the node-family verb
// must end with `bin/loop.mjs`.
function isLoopCliSegment(segment) {
  const tokens = segment.trim().split(/\s+/);
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
  if (i < tokens.length && COMMAND_PREFIXES.has(tokens[i])) i++;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
  const verb = tokens[i];
  if (!verb || !NODE_VERB_RE.test(verb)) return false;
  const scriptToken = tokens[i + 1];
  return Boolean(scriptToken) && /bin\/loop\.mjs$/.test(scriptToken);
}

// Index of the closing `"` for a double-quoted region opening at `start` (the
// `"` index), honoring `\"` escapes. Returns the `"` index, or the last index
// for an unterminated region.
function findDquoteEnd(segment, start) {
  let i = start + 1;
  while (i < segment.length) {
    if (segment[i] === "\\") { i += 2; continue; }
    if (segment[i] === '"') return i;
    i++;
  }
  return segment.length - 1;
}

// Quote-kind-aware blanker. Single-quoted → always blanked (inert).
// Double-quoted → blanked only when free of `$(` and backtick (a double-quoted
// command substitution is real execution → preserved verbatim). Outside quotes
// → emitted as-is; backslash escapes are preserved to keep the result
// shell-parseable.
function blankInertQuoted(segment) {
  let out = "";
  let i = 0;
  while (i < segment.length) {
    const ch = segment[i];
    if (ch === "'") {
      const end = segment.indexOf("'", i + 1);
      out += "''";
      i = end === -1 ? segment.length : end + 1;
    } else if (ch === '"') {
      const end = findDquoteEnd(segment, i);
      const region = segment.slice(i, end + 1);
      out += /\$\(/.test(region) || /`/.test(region) ? region : '""';
      i = end + 1;
    } else if (ch === "\\") {
      out += segment.slice(i, i + 2);
      i += 2;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

// fallow-ignore-next-line unused-export -- public API consumed by gate-logic-cli-argv-payload.test.js
export function stripCliArgvPayload(command) {
  return blankQuotedArgsFor(command, isLoopCliSegment, blankInertQuoted);
}

/**
 * Match a command against constraint patterns.
 * Splits on ;, &, | and checks each segment independently.
 * Strips message flags, node-eval bodies, and pure-data-command pattern args
 * before matching to avoid false positives. Returns the first matching
 * constraint type, or null.
 *
 * Deliberately strips NO echo/printf prose, unlike both promoted-rule passes.
 * These are the first-class boundaries (docker, sudo, package-manager,
 * vendor-api, side-effect-import) and stay maximally conservative: `echo
 * "docker run" | bash` is caught here regardless of pipe target. Note the
 * converse — promoted rules such as rule-no-raw-stdout-vitest have no entry in
 * CONSTRAINT_PATTERNS, so this function is not a backstop for them. That is why
 * stripEchoProseSafe has to be non-bypassable on its own.
 */
export function matchConstraintPattern(command) {
  if (!command || typeof command !== "string") return null;

  for (const segment of splitSegments(command)) {
    const stripped = stripMessageFlags(segment);
    const nodeStripped = stripNodeEvalBody(stripped);
    const dataStripped = stripDataCommandQuotes(nodeStripped);
    for (const [type, pattern] of Object.entries(CONSTRAINT_PATTERNS)) {
      if (pattern.test(dataStripped)) return type;
    }
  }
  return null;
}

/**
 * Check if an active observation exists for the given constraint type.
 * Matches by `constraint_type` field. Archived observations are ignored.
 */
export function checkObservationExists(constraintType, observations) {
  if (!observations || !Array.isArray(observations)) {
    return { found: false };
  }
  const match = observations.find(
    (obs) =>
      obs.status === "active" &&
      (obs.constraint_type === constraintType || obs.constraint === constraintType)
  );
  return match ? { found: true, observation: match } : { found: false };
}

/**
 * Gate-verb constraint match. Walks the policy view (from
 * classifyPolicyTokens) and returns the FIRST gate-verb constraint_type
 * hit as a string (e.g. "gate-verb:bash") or null. Checks BOTH each
 * segment's verb AND each pipe-target verb, so `printf evil | bash` is
 * caught even though `bash` is the second verb.
 *
 * Indirection verbs (env, xargs) only match when followed by a gate-verb
 * arg; `env FOO=bar` alone is not indirection.
 *
 * Verb matching uses basename normalization so PATH-qualified `/bin/bash`
 * matches the `bash` entry. Command-prefixes (sudo/time/nice/nohup/command)
 * are skipped by classifyPolicyTokens, so `sudo bash` resolves verb=bash.
 */
export function matchGateVerb(command) {
  if (!command || typeof command !== "string") return null;
  const view = classifyPolicyTokens(command);

  for (const seg of view.segments) {
    // Indirection verbs (env, xargs) only match via the indirection
    // predicate below — they must NOT match as direct gate-verbs. A bare
    // `env FOO=bar` is just env-assignment plumbing, not indirection.
    const isIndirection = INDIRECTION_VERBS.has(seg.verb);

    if (!isIndirection) {
      const match = matchVerbAgainstGateList(seg.verb, seg.args);
      if (match) return `gate-verb:${match}`;
    }

    // Indirection predicate: env/xargs ONLY match when a following arg is
    // itself a gate-verb. Scan ALL args — env-assignments (`FOO=bar`,
    // lowercase included) and flag tokens (`-i`, `--`, `-0`, `-I{}`) may be
    // interposed before the wrapped command, so checking only args[0]
    // misses `env FOO=bar bash -c …` and `xargs -0 bash`.
    if (isIndirection) {
      for (const arg of seg.args) {
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(arg)) continue; // env-assignment
        if (arg.startsWith("-")) continue; // flag (incl. `--`)
        const argMatch = matchVerbAgainstGateList(basename(arg), []);
        if (argMatch) {
          return `gate-verb:${seg.verb}`;
        }
      }
    }
  }
  return null;
}

// Returns the matched verb key (e.g. "zsh", "node") if the verb matches a
// gate-verb entry; null otherwise. `args` is the segment's arg list (after
// the verb) — used for verb+flag entries (e.g. node -e, python -c).
// Indirection entries never match here directly; they only match via the
// indirection predicate in matchGateVerb.
// Flag matching covers three real forms: detached (`node -e`), attached
// value (`node --eval=…`), and single-char clusters (`perl -ne`, `node -pe`).
function matchVerbAgainstGateList(verb, args) {
  if (!verb) return null;
  const key = basename(verb);
  for (const entry of GATE_VERBS) {
    if (entry.verb !== key) continue;
    if (entry.indirection) continue; // matched via indirection predicate only
    if (entry.flags === null) return key; // verb-only entry
    const hasFlag = entry.flags.some((f) =>
      args.some(
        (a) =>
          a === f ||
          a.startsWith(f + "=") ||
          // single-char short flag inside a cluster (`-e` in `-ne`, `-pe`)
          (f.length === 2 &&
            f[0] === "-" &&
            a.length > 2 &&
            a[0] === "-" &&
            a[1] !== "-" &&
            a.slice(1).includes(f[1])),
      ),
    );
    if (hasFlag) return key;
  }
  return null;
}

/**
 * Inert-sink blanking — replaces `stripEchoProseSafe` on the parse
 * substrate. When a real pipe's target verb is a configured inert sink
 * (tail/head/grep/cat/wc/sort/uniq), the inert-side segment's quoted data
 * args can be blanked before regex matching — printed prose is DATA, not
 * code, and cannot execute on `tail`.
 *
 * Three no-bypass withholds (red-team #3):
 *   1. Redirect withhold: a segment with hasRedirect is NOT blanked (the
 *      output is persisted to a file a trusted verb can later run).
 *   2. Exec withhold: any exec segment disables blanking globally (exec
 *      re-routes the shell's fds; the next echo's stdout is persisted).
 *   3. Executor-pipe withhold: a real pipe whose target is a gate-verb is
 *      NOT an inert sink — the verb layer gates the gate-verb
 *      anyway, but this defense keeps the promoted-rule pass honest.
 *
 * Implementation: walk the command char-by-char with quote state, build
 * a parallel token array (mirroring classifyPolicyTokens output), and
 * blank (replace with whitespace) any quoted-data arg belonging to an
 * inert-side segment that survives the withholds.
 */
// Module-internal: consumed by applyPromotedRules only; not part of the
// module's exported surface.
function applyInertSinkBlanking(command) {
  if (!command || typeof command !== "string") return command || "";
  const view = classifyPolicyTokens(command);

  // Exec withhold: any exec segment disables blanking globally.
  if (view.containsExec) return command;

  // Determine which segments may be blanked. The policy view carries the
  // pipe-chain detection, so the three withholds from the legacy strip
  // helper (redirect, exec, real-pipe-preservation) are replaced by
  // conditions on the policy view. The new inert-sink allowlist EXTENDS
  // blanking: when the pipe chain ends at an inert sink, the prose is
  // provably inert (the data cannot run on the sink). Otherwise, the
  // legacy "no real pipe" relaxation applies.
  const blankableSegmentIdx = new Set();
  for (let i = 0; i < view.segments.length; i++) {
    const seg = view.segments[i];
    if (seg.verb !== "echo" && seg.verb !== "printf") continue;
    if (seg.verb === "printf" && hasPrintfVAssignment(seg.args)) continue;
    if (seg.hasRedirect) continue;

    // If this segment is NOT followed by a real pipe → blank (legacy
    // "no real pipe" relaxation; logical ops `;`, `&&`, `||`, `&` are
    // not pipes).
    if (seg._joiningOp !== "|") {
      blankableSegmentIdx.add(i);
      continue;
    }

    // Real pipe: blank only if EVERY downstream segment in the chain is an
    // inert sink and no segment in the chain has a redirect. Checking only
    // the chain end is not enough: `echo x | cat > f` persists the prose
    // via the sink's redirect, and `echo x | tee f | tail` persists it
    // mid-chain via a non-inert verb — both are the persisted-prose class.
    let j = i;
    while (j < view.segments.length - 1 && view.segments[j]._joiningOp === "|") {
      j++;
    }
    let chainInert = true;
    for (let k = i; k <= j; k++) {
      const s = view.segments[k];
      if (s.hasRedirect || (k > i && !isInertSinkSegment(s))) {
        chainInert = false;
        break;
      }
    }
    if (chainInert) {
      blankableSegmentIdx.add(i);
    }
  }
  if (blankableSegmentIdx.size === 0) return command;

  // Rebuild the command, blanking quoted-content belonging to blankable
  // segments. Walk the command char-by-char with quote state and segment
  // counter — increment segment counter on logical-op / pipe boundaries.
  // The rebuild preserves `$(...)` and backtick substitutions: when a
  // token contains command substitution inside quotes, the content is
  // EXECUTED (not prose) and must stay visible to the regex.
  let result = "";
  let i = 0;
  let segIdx = 0;
  let bufBlankable = blankableSegmentIdx.has(segIdx);
  let inSingle = false;
  let inDouble = false;
  let escape = false;
  let tokenBuf = ""; // current word content (whitespace-separated)
  let tokenQuoted = false;
  let tokenHasCommandSubst = false; // `$(...)` or backticks inside this token
  let dollarSeen = false; // `$` outside a single-quote, candidate for `$(`

  function flushToken() {
    if (tokenBuf.length > 0) {
      // Blank only when the token is simple quoted data — no command
      // substitution and not the result of a substitution. Tokens with
      // `$(...)` or backticks are EXECUTED (not prose) and stay visible.
      if (bufBlankable && tokenQuoted && !tokenHasCommandSubst) {
        // Replace quoted args with whitespace (preserves overall string
        // shape so per-segment length and token positions stay stable).
        result += " ".repeat(tokenBuf.length);
      } else {
        result += tokenBuf;
      }
      tokenBuf = "";
      tokenQuoted = false;
      tokenHasCommandSubst = false;
    }
  }

  function flushOp(op) {
    flushToken();
    result += op;
  }

  while (i < command.length) {
    const ch = command[i];

    if (escape) {
      tokenBuf += ch;
      escape = false;
      i++;
      continue;
    }

    if (!inSingle && !inDouble) {
      if (ch === "\\") {
        escape = true;
        tokenBuf += ch;
        i++;
        continue;
      }
      if (ch === "'") {
        inSingle = true;
        tokenQuoted = true;
        tokenBuf += ch; // keep quote chars so the rebuild preserves quoting
        i++;
        continue;
      }
      if (ch === '"') {
        inDouble = true;
        tokenQuoted = true;
        tokenBuf += ch;
        i++;
        continue;
      }
      // Backtick substitution outside double quotes: backticks are command
      // substitution even when unquoted (POSIX).
      if (ch === "`") {
        tokenHasCommandSubst = true;
        tokenBuf += ch;
        i++;
        continue;
      }
      if (ch === "$") {
        dollarSeen = true;
        tokenBuf += ch;
        i++;
        continue;
      }
      if (dollarSeen && ch === "(") {
        tokenHasCommandSubst = true;
        tokenBuf += ch;
        dollarSeen = false;
        i++;
        continue;
      }
      if (/\s/.test(ch)) {
        flushToken();
        result += ch;
        dollarSeen = false;
        i++;
        continue;
      }
      // Op recognition — longest match first, only outside quotes.
      const three = command.slice(i, i + 3);
      if (three === "<<<" || three === ">>>" || three === "&>>") {
        flushOp(three);
        i += 3;
        continue;
      }
      const two = command.slice(i, i + 2);
      if (
        two === "&&" ||
        two === "||" ||
        two === ">>" ||
        two === "<<" ||
        two === "&>" ||
        two === ">&" ||
        two === "|&" ||
        two === "<&"
      ) {
        flushOp(two);
        // `&&` / `||` split segments in classifyPolicyTokens (LOGICAL_OPS),
        // so the walker's segment counter must advance in lockstep —
        // otherwise later segments inherit the blankability of an earlier
        // echo segment and their quoted args get wrongly blanked.
        if (two === "&&" || two === "||") {
          segIdx++;
          bufBlankable = blankableSegmentIdx.has(segIdx);
        }
        i += 2;
        continue;
      }
      if ("|&;<>()".includes(ch)) {
        // Logical ops + pipes split segments.
        if (ch === "|" || ch === ";" || ch === "&" || ch === "(" || ch === ")") {
          flushOp(ch);
          if (ch === "|" || ch === ";" || ch === "&") {
            // Segment boundary (logical or pipe).
            segIdx++;
            bufBlankable = blankableSegmentIdx.has(segIdx);
          }
        } else {
          flushOp(ch);
        }
        i++;
        continue;
      }
      tokenBuf += ch;
      i++;
      continue;
    }

    if (inSingle) {
      if (ch === "'") {
        inSingle = false;
        tokenBuf += ch;
        i++;
        continue;
      }
      tokenBuf += ch;
      i++;
      continue;
    }

    // inDouble: backslash-escapes work, `"` closes, `$(...)` and
    // backticks are command substitution (executed, not prose).
    if (ch === "\\") {
      escape = true;
      tokenBuf += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inDouble = false;
      tokenBuf += ch;
      i++;
      continue;
    }
    if (ch === "`") {
      tokenHasCommandSubst = true;
      tokenBuf += ch;
      i++;
      continue;
    }
    if (ch === "$") {
      dollarSeen = true;
      tokenBuf += ch;
      i++;
      continue;
    }
    if (dollarSeen && ch === "(") {
      tokenHasCommandSubst = true;
      tokenBuf += ch;
      dollarSeen = false;
      i++;
      continue;
    }
    // Non-special inside double quotes: literal (whitespace inside quotes
    // does NOT split tokens — preserved into the trailing flush).
    tokenBuf += ch;
    dollarSeen = false;
    i++;
    continue;
  }

  flushToken();
  return result;
}

// Inert-sinks: verbs that cannot execute (tail/head/grep/cat/etc.). When a
// real pipe's target verb is an inert sink, the inert-side segment's
// quoted data cannot run there, so promoted-rule blanking can safely
// suppress it. Loaded from patterns.json — operator-owned config; new
// entries are a recorded change-log decision.
//
// awk/sed deliberately held back (red-team #1 dual-role): they are both
// stdin readers AND execution-capable; the executed-body vs stdin-reader
// distinction is not cleanly parseable. If friction later recurs, a
// separate recorded decision adds them with an exec-vs-read predicate.
const INERT_SINKS = new Set(PATTERNS_RAW["inert-sinks"] || []);

// Inert-sink test for a pipe-chain end segment. Beyond the configured
// verb allowlist, `node <script>.{js,mjs,cjs}` (no eval flags) counts as
// inert: the script file is the executed unit and the piped prose is stdin
// data to it — the original bash-gate hook shape (`printf ... | node
// core/bash-gate.js`). Eval flags (-e/--eval/-p/--print) are gate-verb
// matches via the verb layer and must never count as inert.
function isInertSinkSegment(seg) {
  const verb = basename(seg.verb);
  if (INERT_SINKS.has(verb)) return true;
  if (verb !== "node") return false;
  const EVAL_FLAGS = new Set(["-e", "--eval", "-p", "--print"]);
  if (seg.args.some((a) => EVAL_FLAGS.has(a))) return false;
  return seg.args.some((a) => /\.(mjs|cjs|js)$/.test(a));
}

// Local basename for verb normalization (PATH-qualified /bin/bash -> bash).
// Kept private; the broader module may add a similar helper in future.
function basename(p) {
  if (typeof p !== "string") return p;
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

// printf -v detection: the flag is `-v` (or attached `-vX`) — the verb
// writes the formatted result into a variable instead of stdout. Args
// are an assignment payload, not prose. The flag is the FIRST arg token
// (after tokenization), preceded by whitespace; literal `-v` inside a
// quoted arg is NOT a -v assignment — it's a string the verb is asked
// to print, exactly the case the old `printfAssignsToVariable` regex
// (which checks for `-v` preceded by start-of-segment or whitespace)
// distinguished.
function hasPrintfVAssignment(args) {
  if (args.length === 0) return false;
  const first = args[0];
  return first === "-v" || first.startsWith("-v");
}

/**
 * Evaluate budget state. Returns { exhausted, windowActive, remaining }.
 * Fail-open: null/missing budget → not exhausted.
 */
export function evaluateBudget(budgetData) {
  if (!budgetData || typeof budgetData !== "object") {
    return { exhausted: false, windowActive: false, constraint_type: null, external_system: null, resource: null };
  }
  const remaining = (budgetData.budget ?? 0) - (budgetData.current ?? 0);
  return {
    exhausted: (budgetData.current ?? 0) >= (budgetData.budget ?? 0),
    windowActive: budgetData.validation_window?.active === true,
    remaining,
    constraint_type: budgetData.constraint_type || null,
    external_system: budgetData.external_system || null,
    resource: budgetData.resource || null,
  };
}

/**
 * Make the final gate decision.
 * Returns { decision: "ok" | "block" | "escalate", ... }
 */
export function makeGateDecision(constraintMatch, observationStatus) {
  // Side-effect imports always block — importing triggers vendor auth which
  // reactivates cleared devices. No observation or budget state can override.
  if (constraintMatch === "side-effect-import") {
    return {
      decision: "block",
      reason: `Importing vnstock_data triggers vendor authentication and may reactivate cleared devices. Use importlib.util.find_spec() for safe checks.`,
      constraint_type: constraintMatch,
      hard_block: true,
    };
  }

  // No constraint matched → ok
  if (!constraintMatch) {
    return { decision: "ok" };
  }

  // Constraint matched but no active observation → block
  if (!observationStatus?.found) {
    return {
      decision: "block",
      reason: `Constraint "${constraintMatch}" detected. No active observation found. Record an observation before proceeding.`,
      observation_required: true,
      constraint_type: constraintMatch,
    };
  }

  return { decision: "ok" };
}

/**
 * Evaluate a file path against write-path observations.
 * Returns { decision: "ok" | "block" | "escalate", ... }.
 */
export function findProjectRoot() {
  if (process.env.GATE_ROOT) return process.env.GATE_ROOT;
  let dir = join(__dirname, '..', '..', '..');
  while (!existsSync(join(dir, 'records'))) {
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir;
}

function extractFrontmatter(content) {
  if (!content || typeof content !== 'string') return null;
  const trimmed = content.trim();
  if (!trimmed.startsWith('---')) return null;
  const end = trimmed.indexOf('---', 3);
  if (end === -1) return null;
  const yamlBlock = trimmed.slice(3, end).trim();
  if (!yamlBlock) return null;
  try {
    const parsed = parseYaml(yamlBlock, { uniqueKeys: false });
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch {
    return null;
  }
}

function hasProductBuildTag(frontmatter) {
  if (!frontmatter || !frontmatter.tags) return false;
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [frontmatter.tags];
  return tags.includes('product-build');
}

function extractSurfaces(frontmatter) {
  if (!frontmatter || !frontmatter.surfaces) return [];
  return Array.isArray(frontmatter.surfaces) ? frontmatter.surfaces : [frontmatter.surfaces];
}

export function readPreflightMarker(surface, coordDir) {
  const markerPath = join(coordDir, `.loop-preflight-${surface}`);
  try {
    const raw = readFileSync(markerPath, 'utf8');
    const marker = JSON.parse(raw);
    if (!marker.completed_at) return null;
    const ts = new Date(marker.completed_at);
    if (isNaN(ts.getTime())) return null;
    if (Date.now() - ts.getTime() > MARKER_TTL_MS) return null;
    return marker;
  } catch {
    return null;
  }
}

export function writePreflightMarker(surface, coordDir) {
  const markerPath = join(coordDir, `.loop-preflight-${surface}`);
  const content = JSON.stringify({
    surface,
    completed_at: new Date().toISOString(),
  }, null, 2);
  mkdirSync(dirname(markerPath), { recursive: true });
  const tmpPath = markerPath + '.tmp';
  writeFileSync(tmpPath, content, 'utf8');
  renameSync(tmpPath, markerPath);
}

export function inferSurface(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  const parts = filePath.split('/');
  if (parts[0] === 'product' && parts.length >= 2) {
    return 'product';
  }
  if (parts[0] === 'records' && parts.length >= 2) {
    return parts[1];
  }
  if (parts[0] === 'docs' && parts[1] === 'journals') {
    return null;
  }
  return null;
}

// ─── Promoted Rules (meta-state as rule registry) ───

/** Whitelist for glob patterns to prevent path traversal. */
const GLOB_SCOPE_WHITELIST = [
  "product/",
  "docs/",
  "plans/",
  "tools/",
  "meta-state.jsonl",
  ...SURFACES.map((s) => `${s}/`),
];

/**
 * Simple regex safety check to prevent ReDoS.
 * Rejects patterns where a group with an inner quantifier is itself
 * quantified (star height > 1). This is the canonical ReDoS pattern
 * (e.g., `(a+)+`, `(a*)*`, `(a+)?`).
 *
 * The check distinguishes three cases:
 *  1. A quantifier on a group that previously contained a quantifier
 *     (e.g., `(a+)+`) — REJECT.
 *  2. A quantifier at the top level (depth 0) on a non-group token
 *     (e.g., `\s+` in `(verb)\s+(noun)`) — ALLOW. Multiple top-level
 *     quantifiers in different alternatives are not nested.
 *  3. A quantifier inside a group that previously had a quantifier
 *     (e.g., `(a+)+` with the `+` inside the group) — REJECT.
 *
 * This is a lightweight replacement for the safe-regex package.
 */
// fallow-ignore-next-line complexity
export function isSafeRegexPattern(pattern) {
  if (!pattern || typeof pattern !== "string") return false;
  if (pattern.length > 500) return false;

  let depth = 0;
  let groupHadQuantifier = new Array(50).fill(false);
  let inCharClass = false;
  let escaped = false;

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (inCharClass) {
      if (ch === "]") inCharClass = false;
      continue;
    }
    if (ch === "[") {
      inCharClass = true;
      continue;
    }
    if (ch === "(" && !inCharClass) {
      depth++;
      if (depth < groupHadQuantifier.length) {
        groupHadQuantifier[depth] = false;
      }
      continue;
    }
    if (ch === ")" && !inCharClass) {
      // Propagate: the group that just closed contained a quantifier,
      // so the parent (real group, depth > 0) now conceptually contains
      // a quantified subpattern. Propagation to depth 0 is a no-op
      // (top-level quantifiers are not "nested" — they're in different
      // alternatives or separated by non-group tokens).
      if (depth < groupHadQuantifier.length && groupHadQuantifier[depth]) {
        if (depth - 1 > 0 && depth - 1 < groupHadQuantifier.length) {
          groupHadQuantifier[depth - 1] = true;
        }
      }
      depth--;
      continue;
    }

    const isQuantifier = ch === "*" || ch === "+" || ch === "?";
    const isRangeQuantifier = ch === "{" && /^{\d+(,\d*)?}/.test(pattern.slice(i));

    if ((isQuantifier || isRangeQuantifier) && !inCharClass) {
      // Case 1: this quantifier quantifies a group (preceded by `)`)
      // AND that group had a quantifier inside.
      if (
        i > 0 &&
        pattern[i - 1] === ")" &&
        depth + 1 < groupHadQuantifier.length &&
        groupHadQuantifier[depth + 1]
      ) {
        return false;
      }
      // Case 3: this quantifier is inside a group at depth > 0, AND
      // an enclosing group already had a quantifier. (Top-level
      // quantifiers — depth 0 — are not checked here, per case 2.)
      for (let d = 1; d <= depth && d < groupHadQuantifier.length; d++) {
        if (groupHadQuantifier[d]) {
          return false;
        }
      }
      // Track the quantifier at the current depth (only for real groups).
      if (depth > 0 && depth < groupHadQuantifier.length) {
        groupHadQuantifier[depth] = true;
      }
    }
  }

  return true;
}

export function isGlobScopeWhitelisted(pattern) {
  if (!pattern || typeof pattern !== "string") return false;
  return GLOB_SCOPE_WHITELIST.some((prefix) => pattern.startsWith(prefix));
}

export function projectHasLearningLoopMcp(root) {
  try {
    const cfgPath = join(root, ".mcp.json");
    if (!existsSync(cfgPath)) return false;
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    return !!(
      cfg.mcpServers &&
      (cfg.mcpServers["learning-loop"] ||
        cfg.mcpServers["learning-loop-mcp"] ||
        cfg.mcpServers["learning-loop-mastra"])
    );
  } catch {
    return false;
  }
}

/** Cache for promoted rules: { root -> { rules, mtime, size } } */
const promotedRulesCache = new Map();

/**
 * Load active gate-enforced promoted rules from meta-state.jsonl.
 * Uses (mtime, size) tuple for cache invalidation (RT Finding 6).
 */
export function loadPromotedRules(root) {
  const path = join(root, "meta-state.jsonl");
  if (!existsSync(path)) return [];

  const stats = statSync(path);
  const mtime = stats.mtime.getTime();
  const size = stats.size;

  const cached = promotedRulesCache.get(root);
  if (cached && cached.mtime === mtime && cached.size === size) {
    return cached.rules;
  }

  let entries = [];
  try {
    const raw = readFileSync(path, "utf8");
    const lines = raw.split("\n").filter((line) => line.trim() !== "");
    entries = lines.map((line) => JSON.parse(line));
  } catch {
    return [];
  }

  // Only first-class entry_kind="rule" entries are accepted.
  // Legacy finding entries with promoted_to_rule were removed; all promoted
  // rules are now standalone rule entries.
  //
  // dedupe to max-version per id BEFORE
  // filtering by status. Without this dedupe, a rule that has been
  // deactivated (status: inactive on the new max-version line) would ALSO
  // show its prior active v0 line in the filter result, falsely reporting
  // the rule as active. The projection in core/read-registry-cache.js is
  // the canonical dedupe path; loadPromotedRules reads the raw file and
  // must mirror the projection locally (same algorithm, no full-rewrite).
  const seen = new Map();
  for (const entry of entries) {
    if (entry.entry_kind !== "rule") continue;
    const prior = seen.get(entry.id);
    if (!prior) { seen.set(entry.id, entry); continue; }
    const priorV = prior.version ?? 0;
    const nextV = entry.version ?? 0;
    if (nextV > priorV) { seen.set(entry.id, entry); continue; }
    if (nextV === priorV) {
      const priorT = prior.created_at ?? "";
      const nextT = entry.created_at ?? "";
      if (nextT > priorT) seen.set(entry.id, entry);
    }
  }
  let rules = Array.from(seen.values()).filter((e) => e.status === "active");

  // Schema validation: a malformed rule entry (typo, missing field,
  // invalid pattern_type) would crash applyPromotedRules. Validate
  // each entry and warn-and-skip on invalid. This closes the gap that
  // direct file appends (bypassing writeEntry's safeParse) would otherwise
  // create (review finding F-3).
  rules = rules.filter((r) => {
    const validation = metaStateRuleEntrySchema.safeParse(r);
    if (!validation.success) {
      console.warn(
        `Rule ${r.id ?? "<unknown>"}: schema validation failed, skipping. ` +
          `Errors: ${validation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
      return false;
    }
    return true;
  });

  rules = rules.filter((r) => {
    const predicate = r.scope_predicate;
    if (!predicate || predicate === "none") return true;
    if (predicate === "project_has_learning_loop_mcp") {
      return projectHasLearningLoopMcp(root);
    }
    console.warn(`Rule ${r.id}: unknown scope_predicate "${predicate}"`);
    return true;
  });

  promotedRulesCache.set(root, { rules, mtime, size });
  return rules;
}

/**
 * Apply promoted rules against a command (regex) or file path (glob).
 * Returns escalate with rule provenance on match, ok otherwise.
 */
/**
 * Check if a determinism-checklist rule is satisfied.
 * Reads the registry and asserts absence of any active/reported finding
 * with the matching subtype and session_id.
 * Returns { satisfied: true } or { satisfied: false, blocking_id, rule_id, applies_to_resolution }.
 */

/**
 * Strip the documented suffix forms from an evidence_code_ref:
 *   - `:line` (single line, e.g. `tools/foo.js:12`)
 *   - `:start-end` (line range, e.g. `tools/foo.js:12-34`)
 *   - `#anchor` (function/symbol identifier)
 * Returns the bare file path. Anchor is stripped first so a compound
 * `path:start-end#anchor` (e.g. `tools/foo.js:12-34#methodName`) collapses
 * to the bare file, matching the documented syntax. Both regexes only
 * match the documented syntax, so paths with no suffix (e.g., "tools/foo.js")
 * are returned unchanged. See finding
 * meta-260607T1625Z-gate-line-suffix-not-stripped-from-evidence-code-ref
 * for the gate-bug this helper closes.
 */
export function stripEvidenceAnchor(codeRef) {
  if (typeof codeRef !== "string") return codeRef;
  // Strip #anchor suffix first (identifier chars: word, dot, dollar, dash, underscore, space)
  // so a compound `path:start-end#anchor` reduces to `path:start-end` before the next step.
  let stripped = codeRef.replace(/#[\w$.\s-]+$/, "");
  // Strip :line or :start-end range suffix (digits only — keeps Windows drive letters safe)
  stripped = stripped.replace(/:\d+(?:-\d+)?$/, "");
  // Strip dotted JSON key-path suffix (e.g., `package.json:simple-git-hooks.pre-commit`).
  // Requires at least one dot to distinguish a key-path from a single token; version-like
  // suffixes (`:1.0.0`) also match (digits are word chars) but collapsing them to the bare
  // file path is benign — version literals carry no grounding meaning.
  stripped = stripped.replace(/:[\w-]+(?:\.[\w-]+)+$/, "");
  return stripped;
}

// fallow-ignore-next-line complexity
export function checkResolutionEvidence(rule, root) {
  const rule_id = rule.id;

  // Branch 1: global orphan-evidence rule
  if (rule_id === "rule-no-orphaned-evidence") {
    const entries = readRegistry(root);
    const activeGrounded = entries.filter(
      (e) => e.entry_kind === "finding" && isOpen(e) && e.mechanism_check === true
    );
    const orphans = [];
    for (const entry of activeGrounded) {
      const codeRef = entry.evidence_code_ref;
      if (!codeRef) {
        orphans.push({ id: entry.id, reason: "no_evidence_code_ref" });
        continue;
      }
      // Strip both `:line` (canonical per meta-state.js#metaStateFindingEntrySchema
      // and loop-introspect.js discoverability hint) and `#anchor` suffixes before
      // resolving the file path. Without the `:line` strip, the gate treated
      // `path/to/file.js:37` as a literal file path and flagged it as
      // code_ref_missing even when the file existed. See finding
      // meta-260607T1625Z-gate-line-suffix-not-stripped-from-evidence-code-ref.
      // LIM-4: realpath containment — rejects traversal/symlink/hardlink escape.
      // See core/path-containment.js. A missing file inside root (ENOENT,
      // resolvedPath === null) or a read-race FileNotFoundError is preserved as
      // code_ref_missing; security rejections (escape, hardlink, realpath_failed)
      // propagate. Invoked at moment of use per NF3.
      let currentHash;
      try {
        const absPath = resolveSafePath(root, stripEvidenceAnchor(codeRef));
        currentHash = computeFileHash(absPath);
      } catch (err) {
        const isMissing = err instanceof PathContainmentError
          ? (err.reason === "outside_root" && err.resolvedPath === null)
          : err.name === "FileNotFoundError";
        if (isMissing) {
          orphans.push({ id: entry.id, reason: "code_ref_missing" });
          continue;
        }
        throw err;
      }
      // Baseline resolution (red-team F2): the file-index
      // sidecar is the authoritative baseline, with the per-record field as the
      // vestigial fallback. Without repointing this gate, every edited source
      // file fails CI post-migration because the live hash no longer matches the
      // frozen per-record value. Both baselines are compared to the live hash;
      // a mismatch against the authoritative baseline is fingerprint_mismatch.
      const canonical = stripEvidenceAnchor(codeRef);
      const fileIndex = readFileIndex(root);
      const indexBaseline = fileIndex.has(canonical) ? fileIndex.get(canonical) : null;
      // Validate the per-record fallback against TERMINAL_HASH_REGEX (mirrors
      // checkGrounding's per-record branch): a corrupt stored value must never
      // be compared as a baseline — it's dropped to null so a malformed value
      // can't surface as a false fingerprint_mismatch.
      const perRecord = typeof entry.code_fingerprint === "string" && TERMINAL_HASH_REGEX.test(entry.code_fingerprint)
        ? entry.code_fingerprint : null;
      const expected = indexBaseline ?? perRecord;
      if (expected && expected !== currentHash) {
        orphans.push({ id: entry.id, reason: "fingerprint_mismatch", expected, actual: currentHash });
      }
    }
    if (orphans.length > 0) {
      return { satisfied: false, rule_id: "rule-no-orphaned-evidence", blocking_id: orphans[0]?.id, applies_to_resolution: rule.applies_to_resolution, orphans };
    }
    return { satisfied: true, rule_id: "rule-no-orphaned-evidence" };
  }

  // Branch 2: existing per-finding determinism-checklist rules
  const { pattern, applies_to_resolution } = rule;
  const entries = readRegistry(root);
  const blocking = entries.find((e) =>
    e.entry_kind === "finding"
    && e.subtype === "mcp-client-loading"
    && e.session_id === pattern
    && isOpen(e),
  );
  if (blocking) {
    return {
      satisfied: false,
      blocking_id: blocking.id,
      rule_id,
      applies_to_resolution,
    };
  }
  return { satisfied: true, rule_id };
}

// fallow-ignore-next-line complexity
export function applyPromotedRules(command, filePath, rules, root = findProjectRoot()) {
  const override = readGateOverride(root);
  const overrideSet = override ? new Set(override.rule_ids) : new Set();

  for (const rule of rules) {
    // Defense-in-depth: skip rules that should not have been loaded.
    // loadPromotedRules already filters to entry_kind="rule" + status="active",
    // but we double-check status here for safety.
    if (rule.status !== "active") continue;

    if (rule.pattern_type === "agent-checklist") {
      // Design-time rule; no command/path matching. The audit lives in the
      // check_runtime_agnostic MCP tool and the runtime-agnostic regression test.
      // The rule loads; the gate ignores it.
      continue;
    }

    if (rule.enforcement !== "gate") continue;
    if (overrideSet.has(rule.id)) {
      console.warn(`Rule ${rule.id}: skipped via gate override (${override.operator_note ?? "no note"})`);
      continue;
    }

    const { pattern_type, pattern, id: rule_id } = rule;
    let matched = false;

    try {
      if (pattern_type === "determinism-checklist") {
        // This pattern type is not a command-path match. The check happens in
        // meta_state_resolve (the per-tool gate). Skip here silently — the
        // bash gate always has `command` set, so a defensive warning would
        // fire on every single Execute invocation (regression caught by
        // gate-determinism-checklist.test.js#does NOT warn when...).
        continue;
      } else if (pattern_type === "regex" && command) {
        if (!isSafeRegexPattern(pattern)) {
          console.warn(`Rule ${rule_id}: regex pattern rejected by safety check`);
          continue;
        }
        const re = new RegExp(pattern);
        // Per-segment: a forbidden token in any leg of a compound command
        // (splitSegments splits on ; & |, honoring quotes). This remains the
        // primary match surface so substring rules behave exactly as before.
        // stripEchoProseSafe runs once over the whole command first, because
        // deciding whether an echo segment's prose is inert needs the sibling
        // delimiter that splitSegments discards. It blanks echo/printf quoted
        // args only where the printed output cannot reach anything executable
        // (no redirect, no real `|`); a redirect or a real pipe preserves the
        // prose, so the bypass shapes still match here.
        const echoSafe = applyInertSinkBlanking(command);
        for (const segment of splitSegments(echoSafe)) {
          const stripped = stripMessageFlags(segment);
          const nodeStripped = stripNodeEvalBody(stripped);
          const dataStripped = stripDataCommandQuotes(nodeStripped);
          const cliStripped = stripCliArgvPayload(dataStripped);
          if (re.test(cliStripped)) {
            matched = true;
            break;
          }
        }
        // Full-command: patterns that span a delimiter splitSegments removes
        // (e.g. a literal pipe: `vitest run ... | tail`) are unreachable
        // per-segment, because no segment retains the delimiter. Test the
        // full command as a second pass. This is a strict superset: a pattern
        // that matches the full command either matches a segment already
        // (substring/alternation rules — the matched text lives in some
        // segment) or spans a removed delimiter (newly reachable). The data-
        // command strip is applied here too so a banned token living only in a
        // grep/jq pattern on one side of a real pipe cannot pair with the pipe
        // to false-positive. stripEchoProse extends the same reasoning to
        // echo/printf: a banned token living only in an echo label on one side
        // of a real read-only pipe (grep/tail/head) cannot pair with it to
        // false-escalate. stripCliArgvPayload extends it to the loop CLI
        // inline-JSON argv (canonical `node .../bin/loop.mjs <tool> <quoted>`):
        // a banned token living only in that JSON data cannot run, so it cannot
        // pair with a real pipe to false-escalate. The blanking is quote-kind-
        // aware — a double-quoted `$(...)` argv is real execution and stays
        // visible (see stripCliArgvPayload). Executed-body verbs (bash -c, sh -c,
        // python -c, awk, sed) are deliberately NOT stripped here — their quoted
        // bodies run, so a banned token in `bash -c "vitest run" | tail` is a
        // real violation. stripDataCommandQuotes/stripEchoProse/stripCliArgvPayload
        // preserve ; & | (quote-aware split) so spanning patterns still match
        // real violations.
        if (!matched) {
          const fullStripped = stripEchoProse(stripDataCommandQuotes(stripCliArgvPayload(stripNodeEvalBody(stripMessageFlags(command)))));
          if (re.test(fullStripped)) {
            matched = true;
          }
        }
      } else if (pattern_type === "glob" && filePath) {
        if (!isGlobScopeWhitelisted(pattern)) {
          console.warn(`Rule ${rule_id}: glob pattern "${pattern}" rejected by scope whitelist`);
          continue;
        }
        matched = globMatch(pattern, filePath);
      }
    } catch (err) {
      console.warn(`Rule ${rule_id}: invalid pattern: ${err.message}`);
      continue;
    }

    if (matched) {
      return {
        decision: "escalate",
        reason: `Promoted rule "${rule_id}" matched: ${pattern}`,
        rule_id,
        meta_state_id: rule.id,
        pattern_type,
      };
    }
  }
  return { decision: "ok" };
}

// ─── Staleness helpers ───
// the inbound + bash gates share a unified
// observation-staleness primitive now (`core/observation-staleness.js` +
// `OBSERVATION_STALENESS_WINDOW_MS` in `core/constants.js`). The previous
// gate-local `findStaleObservations` + `STALENESS_THRESHOLD_MS` are gone.
