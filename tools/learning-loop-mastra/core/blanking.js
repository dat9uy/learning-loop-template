// blanking.js — pure, runtime-neutral command blanking primitives.
//
// Extracted from gate-logic.js (the strip family) so the shared
// command-classification substrate can consume the exact blanking policies
// the gate uses WITHOUT importing gate-logic (which would create a circular
// dependency: gate-logic imports classifyCommand from command-classification,
// and command-classification imported the strip family from gate-logic).
//
// This module imports ONLY parse primitives (shell-parse.js) and operator
// config (patterns.json). It holds no gate state: no promoted rules, no
// constraint patterns, no observation/registry I/O. gate-logic.js re-exports
// these primitives so existing callers and tests importing from gate-logic
// keep working unchanged.
//
// Dependencies:
//   - classifyPolicyTokens, resolveVerbIndex (shell-parse.js)
//   - patterns.json (message_flags, inert-sinks) — same load as gate-logic.

import { classifyPolicyTokens, resolveVerbIndex } from "./shell-parse.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PATTERNS_RAW = JSON.parse(readFileSync(join(__dirname, "patterns.json"), "utf8"));

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

export function stripDataCommandQuotes(command) {
  return blankQuotedArgsFor(command, DATA_COMMANDS);
}

// Non-executing output verbs: echo/printf. Their quoted args are printed prose,
// not commands — banned tokens inside them cannot execute — so blanking creates
// no bypass (same false-positive class stripDataCommandQuotes closes for
// grep/jq). This blanket form is used by the full-command pass, where echo prose
// on one side of a REAL pipe cannot pair with a read-only grep/tail/head on the
// other to false-escalate. The per-segment pass blanks through
// applyInertSinkBlanking (the shell-parse substrate, pipe-target-aware), and
// matchConstraintPattern strips no echo prose at all. Executed-body verbs
// (bash -c, sh -c, python -c, awk, sed) are NOT here — their quoted bodies run.
const ECHO_PROSE_COMMANDS = new Set(["echo", "printf"]);
export function stripEchoProse(command) {
  return blankQuotedArgsFor(command, ECHO_PROSE_COMMANDS);
}

// ─── stripHeredocBodies: heredoc data-blanking pre-pass ─────────────────────
//
// Closes the last un-blanked DATA class in the gate's strip family: quoted-
// delimiter heredoc bodies attached to inert verbs. A quoted delimiter
// (`<<'EOF'`, `<<"EOF"`, `<<-'EOF'`, or any quote char / backslash in the
// delimiter word) suppresses POSIX expansion in the body — `$(...)`, backticks
// and `$var` are literal — so the body can never execute and is pure data.
// Blanking it removes false-fires like a heredoc-fed `cat` whose data happens
// to contain `vitest run foo | tail`.
//
// Safety model (allowlist, never denylist — unknown verb ⇒ visible):
//   - BLANKABLE_HEREDOC_VERBS_PROMOTED  (applyPromotedRules):
//       DATA_COMMANDS ∪ {cat, tee} ∪ node-family.
//       node-family is an ACCEPTED bypass here, mirroring stripNodeEvalBody —
//       JS source is data to the shell gate; child_process spawn is the same
//       accepted class with the same recurrence catch-net.
//   - BLANKABLE_HEREDOC_VERBS_CONSTRAINT (matchConstraintPattern):
//       DATA_COMMANDS ∪ {cat, tee} ONLY. node-family is EXCLUDED: `node
//       <<'EOJS'` reads stdin and EXECUTES it, so blanking would hide
//       `node <<'EOJS' … require('child_process').execSync('sudo docker run')`
//       from the docker/sudo constraints. `bash <<'EOF' … docker run` stays
//       visible (executor verb, not in the set).
//   - BLANKABLE_HEREDOC_VERBS_GATEVERB  (matchGateVerb/classifyPolicyTokens):
//       DATA_COMMANDS ∪ {cat, tee} ∪ node-family, applied as a pre-pass BEFORE
//       classifyPolicyTokens so a heredoc body line containing `| bash` no
//       longer fractures into a gate-verb block.
//
// Deliberately NOT blanked (visible — the safe direction):
//   - Unquoted `<<EOF` bodies: POSIX expands `$(...)`/backticks/`$var`, so the
//     body can execute. Visible = no bypass; residual false-fires are collapsed
//     tracker-side by the coarser recurrence key, not by this blanker.
//   - Executor-verb heredocs (`bash`/`sh`/`zsh`/`dash`/`python`/`python3`/
//     `ruby`/`perl`/`awk`/`sed`/`ssh` `<<'EOF'`): bodies run as programs — the
//     heredoc analogue of the locked stripNodeEvalBody asymmetry. Node-family
//     is the lone exception (see PROMOTED/GATEVERB allowlists) and only for
//     stdin-script data, mirroring the accepted node -e bypass.
//   - Herestrings `<<<`: a distinct op (`shell-parse.js` REDIRECT_OPS) that
//     feeds stdin directly and executes — never misparsed as a heredoc (the
//     scan requires the char after `<<-?` to NOT be `<`).
//
// Opaque-span recognition: once a heredoc operator + delimiter is recognized,
// the span from the operator line through the terminator line is opaque to
// quote-state tracking (the shell does not quote-parse heredoc bodies), so a
// body `don't` cannot open a quote region that hides a later `<<`. Scanning
// resumes AFTER the terminator with quote state reset to NORMAL.
//
// Fail-closed: any throw returns the command unchanged (the call-site wrapper
// logs a stderr diagnostic). Kill-switch: GATE_HEREDOC_BLANKER=0 short-circuits
// the pre-pass at every call site — the recovery lever if a blanker bug ships
// (hooks run from the working tree on all runtimes simultaneously).
//
// The receiving verb is resolved from the segment prefix before `<<` via
// `segmentVerb` (which skips env-assignments/command-prefixes through
// `resolveVerbIndex` and basename-normalizes), so `sudo bash <<'EOF'` and
// `nice python3 <<'EOF'` attribute to the executor and stay visible.
const BLANKABLE_HEREDOC_VERBS_PROMOTED = new Set(["cat", "tee", "node", "nodejs", ...DATA_COMMANDS]);
const BLANKABLE_HEREDOC_VERBS_CONSTRAINT = new Set(["cat", "tee", ...DATA_COMMANDS]);
const BLANKABLE_HEREDOC_VERBS_GATEVERB = new Set(["cat", "tee", "node", "nodejs", ...DATA_COMMANDS]);
// Exported for the shared command-classification substrate so its gate mode
// can reuse the exact promoted-rule heredoc allowlist without forking it, and
// for gate-logic's constraint functions (matchConstraintPattern uses
// BLANKABLE_HEREDOC_VERBS_CONSTRAINT; matchGateVerb uses GATEVERB).
export {
  BLANKABLE_HEREDOC_VERBS_PROMOTED,
  BLANKABLE_HEREDOC_VERBS_CONSTRAINT,
  BLANKABLE_HEREDOC_VERBS_GATEVERB,
};

// Count newlines in a span — used to blank heredoc bodies while preserving
// line structure (the operator + terminator lines stay intact).
function countNewlines(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === "\n") n++;
  return n;
}

// Index of the heredoc terminator line for a quoted-delimiter body starting at
// `bodyStart`. A line whose content (leading tabs stripped iff `stripTabs` for
// `<<-`) equals `termDelim` terminates the body; returns its start index, or
// -1 when unterminated. Shared by the gate's stripHeredocBodies and the
// classifier's collectHeredocInertSpans so the two heredoc geometries cannot
// drift. A trailing `\r` is stripped so CRLF-terminated lines (`EOF\r`) match
// the POSIX terminator (`EOF`) — without this, `\r\n` line endings leave the
// terminator unmatched and the scanner blanks to end of command, hiding a real
// command that follows the heredoc from the constraint gate (CRLF bypass).
export function findHeredocTerminator(command, bodyStart, termDelim, stripTabs) {
  if (bodyStart >= command.length) return -1;
  let scan = bodyStart;
  while (scan <= command.length) {
    const nl = command.indexOf("\n", scan);
    const lineEndIdx = nl === -1 ? command.length : nl;
    let content = command.slice(scan, lineEndIdx).replace(/\r$/, "");
    if (stripTabs) content = content.replace(/^\t+/, "");
    if (content === termDelim) return scan;
    if (nl === -1) break;
    scan = nl + 1;
  }
  return -1;
}

export function stripHeredocBodies(command, allowlist = BLANKABLE_HEREDOC_VERBS_PROMOTED) {
  if (typeof command !== "string" || !command) return command;
  if (process.env.GATE_HEREDOC_BLANKER === "0") return command; // kill-switch

  const noop = { onChar() {}, onDelimiter() {} };
  let out = "";
  let state = QUOTE_NORMAL;
  let segmentStart = 0; // start of the current shell segment (for verb attribution)
  let i = 0;

  while (i < command.length) {
    // Heredoc operator detection — only outside quotes.
    if (state === QUOTE_NORMAL && command[i] === "<" && command[i + 1] === "<") {
      let opEnd = i + 2;
      let stripTabs = false;
      if (command[opEnd] === "-") { stripTabs = true; opEnd++; }
      // Herestring exclusion: `<<<` feeds stdin and executes — not a heredoc.
      // Emit the ENTIRE `<<<` operator (all three `<` chars) and advance past
      // it. Emitting only one `<` and advancing one char would leave the
      // remaining `<<` to be re-parsed as a heredoc operator on the next
      // iteration — which blanks to end when a NEWLINE follows the herestring
      // body (a real command on the next line gets hidden from the gate).
      if (command[opEnd] === "<") {
        out += command.slice(i, opEnd + 1);
        // fallow-ignore-next-line code-duplication -- mirror of the tracker-side blanker; kept parallel so gate and tracker stay independently readable
        state = QUOTE_NORMAL;
        i = opEnd + 1;
        continue;
      }
      // Parse the delimiter word after optional spaces/tabs.
      let j = opEnd;
      while (j < command.length && (command[j] === " " || command[j] === "\t")) j++;
      let k = j;
      while (k < command.length && !/\s/.test(command[k])) k++;
      const delim = command.slice(j, k);
      if (delim.length === 0) {
        out += command[i];
        state = advanceQuoteState(state, command[i], i, noop);
        i++;
        continue;
      }
      // Quoting ANY part of the delimiter word suppresses expansion → the body
      // is data-eligible. Unquoted → stop, leave visible (may execute).
      const quoted = /['"\\]/.test(delim);
      // The terminator line is the delimiter word with quoting chars stripped
      // (POSIX: `<<'EOF'` is terminated by a bare `EOF` line).
      const termDelim = delim.replace(/['"\\]/g, "");
      const verb = segmentVerb(command.slice(segmentStart, i));
      const blankable = quoted && verb !== null && allowlist.has(verb);

      // Body starts on the line after the operator line.
      const lineEnd = command.indexOf("\n", k);
      const bodyStart = lineEnd === -1 ? command.length : lineEnd + 1;

      // Find the terminator: a line whose content (leading tabs stripped iff
      // `<<-`) is exactly the delimiter. Unterminated ⇒ blank to end (quoted).
      const termStart = findHeredocTerminator(command, bodyStart, termDelim, stripTabs);

      // Emit the operator line verbatim, then blank (or keep) the body.
      out += command.slice(i, bodyStart);
      const spanEnd = termStart === -1 ? command.length : termStart;
      if (blankable) {
        out += "\n".repeat(countNewlines(command.slice(bodyStart, spanEnd)));
      } else {
        out += command.slice(bodyStart, spanEnd);
      }
      // Opaque span: quote state resets to NORMAL after the terminator; the
      // segment context restarts AFTER the terminator LINE (the next shell
      // command begins on the line after it), so the terminator word never
      // leaks into the next heredoc's verb attribution.
      state = QUOTE_NORMAL;
      const termLineEnd = termStart === -1 ? -1 : command.indexOf("\n", termStart);
      segmentStart = termLineEnd === -1 ? command.length : termLineEnd + 1;
      i = spanEnd;
      continue;
    }

    out += command[i];
    const nextState = advanceQuoteState(state, command[i], i, noop);
    // Segment boundary for verb attribution: ; & | and newline terminate a
    // shell command (newline is a command separator even though the walker's
    // splitSegments only splits on ; & |).
    if (state === QUOTE_NORMAL && (command[i] === ";" || command[i] === "&" || command[i] === "|" || command[i] === "\n")) {
      segmentStart = i + 1;
    }
    state = nextState;
    i++;
  }
  return out;
}

// Fail-closed wrapper: a blanker throw must never crash the gate — treat the
// command as un-blanked (visible direction) with a stderr diagnostic. Used at
// every wiring site. Exported so the fail-closed contract is directly testable
// (a throwing blanker — e.g. a future edit passing a non-Set allowlist — must
// never propagate into the gate decision).
export function safeStripHeredocBodies(command, allowlist) {
  try {
    return stripHeredocBodies(command, allowlist);
  } catch (err) {
    console.error(`stripHeredocBodies: failed, treating as un-blanked: ${err.message}`);
    return command;
  }
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

export function stripCliArgvPayload(command) {
  return blankQuotedArgsFor(command, isLoopCliSegment, blankInertQuoted);
}


/**
 * Inert-sink blanking on the parse substrate. When a real pipe's target verb is a configured inert sink
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
//
// Exported for the shared command-classification substrate: the classifier's
// gate mode must reproduce this exact inert-sink blanking policy without
// forking it, so gate decisions and classifier views cannot drift. The export
// is additive — existing callers and tests are unaffected.
export function applyInertSinkBlanking(command) {
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

