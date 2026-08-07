// shell-parse.js — parse-only tokenizer for the bash-gate policy view.
//
// SECURITY BOUNDARY (CVE-2026-9277). The `shell-quote` package's `parse()`
// returns a token stream that does not interpret command substitution or
// expand variables. Its `quote()` function, by contrast, can produce
// unescaped shell terminators when fed an attacker-influenced `.op` token
// from `parse()` (CVE-2026-9277). The bash-gate never reaches `quote()` —
// it consumes its own token stream for classification only and never
// re-emits or executes the tokens.
//
// This module re-exports `shell-quote`'s `parse()` for the path-wide
// import-guard test (which proves `quote` is not reachable from the
// gate path). The shim's `classifyPolicyTokens` builds a structured
// policy view from a quote-aware walker that mirrors shell-quote's
// tokenizer while exposing per-token quoted metadata (which shell-quote
// strips). The walker is a single source of truth for tokenization in
// the gate; shell-quote's parse is available for cross-validation.
//
// Policy view shape:
//   { segments: [{ verb, args, quotedDataArgs, hasRedirect, pipeTarget? }],
//     containsExec: boolean }

export { parse } from "shell-quote";

// Command-prefixes that skip past to the next real verb. They do NOT change
// the verb; the gate applies its own prefix-specific rules independently
// (e.g. `sudo` always escalates by matchConstraintPattern).
const COMMAND_PREFIXES = new Set(["sudo", "time", "nice", "nohup", "command"]);

// Logical-op op-strings that split segments but are NOT real pipes (no stdout
// routing). Real pipe is `|`; everything else splits without setting
// pipeTarget.
const LOGICAL_OPS = new Set([";", "&&", "||", "&"]);

// Op-strings that represent a redirect (write/append/read/heredoc/herestring/
// fd-dup). Used to set `hasRedirect` on the originating segment.
const REDIRECT_OPS = new Set([
  ">",
  ">>",
  "<",
  "<<",
  "<<<",
  ">>>",
  "&>",
  "&>>",
  ">&",
  "|&",
  "<&",
]);

// Op-strings that represent a real pipe (stdout routing). Used to set
// `pipeTarget` on the originating segment.
const PIPE_OPS = new Set(["|"]);

// ─── classifyPolicyTokens ────────────────────────────────────────────────────

export function classifyPolicyTokens(command) {
  if (!command || typeof command !== "string") {
    return { segments: [], containsExec: false };
  }

  // 1. Tokenize: produce [{ type: "string", value, quoted } | { type: "op", op }].
  const tokens = tokenize(command);

  // 2. Split into segments on logical ops + pipes. Each segment becomes a
  //    {verb, args, quotedDataArgs, hasRedirect, pipeTarget?} entry.
  const rawSegments = [];
  let cur = newSegment();
  for (const tok of tokens) {
    if (tok.type === "op") {
      if (LOGICAL_OPS.has(tok.op) || PIPE_OPS.has(tok.op)) {
        cur._joiningOp = tok.op;
        rawSegments.push(cur);
        cur = newSegment();
      } else if (REDIRECT_OPS.has(tok.op)) {
        cur._hasRedirect = true;
        // Redirect content (file path, fd, here-doc body) flows into the
        // segment's string tokens via the walker — handled naturally.
      }
    } else {
      cur._tokens.push(tok);
    }
  }
  rawSegments.push(cur);

  // 3. Resolve verb + args + quotedDataArgs per segment.
  const segments = rawSegments.map(finalizeSegment);

  // 4. Wire pipeTarget: the verb of segment[i+1] becomes segments[i].pipeTarget
  //    ONLY when the joining op was a real pipe (`|`). _joiningOp is preserved
  //    on the policy view so the inert-sink blanking (and future passes
  //    routed to the policy view) can detect the op that ended each segment
  //    without re-parsing.
  for (let i = 0; i < segments.length - 1; i++) {
    const joiningOp = segments[i]._joiningOp;
    if (joiningOp && PIPE_OPS.has(joiningOp)) {
      const next = segments[i + 1];
      if (next.verb) segments[i].pipeTarget = next.verb;
    }
  }

  // 5. containsExec: any segment whose verb is `exec` — exec re-routes the
  //    shell's fds globally, a known no-bypass withhold that disables
  //    data-verb / inert-side blanking.
  const containsExec = segments.some((s) => s.verb === "exec");

  // 6. _joiningOp is preserved on the policy view so the inert-sink
  //    blanking (and future passes routed to the policy view) can detect
  //    the op that ended each segment without re-parsing.
  return { segments, containsExec };
}

// ─── segment helpers ────────────────────────────────────────────────────────

function newSegment() {
  return {
    _tokens: [],
    _joiningOp: null,
    _hasRedirect: false,
  };
}

function finalizeSegment(seg) {
  // Determine verb: first non-prefix, non-env-assignment string token.
  // Verb matching uses `basename(verb)` so PATH-qualified verbs normalize.
  const tokens = seg._tokens;
  let verbIdx = -1;
  let verb = null;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (COMMAND_PREFIXES.has(t.value)) continue;
    if (/^[A-Z_][A-Z0-9_]*=/.test(t.value)) continue; // env-assignment
    verbIdx = i;
    verb = basename(t.value);
    break;
  }

  const out = {
    verb,
    args: [],
    quotedDataArgs: [],
    hasRedirect: seg._hasRedirect,
    _joiningOp: seg._joiningOp,
  };

  if (verb !== null) {
    const tail = tokens.slice(verbIdx + 1);
    out.args = tail.map((t) => t.value);
    out.quotedDataArgs = tail.filter((t) => t.quoted).map((t) => t.value);
  }

  return out;
}

function basename(p) {
  if (typeof p !== "string") return p;
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

// ─── tokenizer ──────────────────────────────────────────────────────────────

// Quote-aware tokenizer. Walks the command char-by-char with quote state
// (single, double, escape), producing:
//   - `{ type: "string", value, quoted }` for non-op word tokens
//   - `{ type: "op", op }` for op tokens (`|`, `;`, `&`, `>`, `<`, etc.)
//
// Quote semantics:
//   - Single quotes are literal — no escapes inside; only `'` closes.
//   - Double quotes allow `\\` and `\"` escapes; only `"` closes.
//   - Backslash outside quotes: literal char follows (the backslash itself
//     is NOT included in the string token).
//   - Backslash inside double quotes: consumed; the next char is literal.
//   - Variable references (`$x`), command substitution (`$(...)`), and
//     backticks are NOT expanded — they remain part of the surrounding
//     string token (their content is DATA, classified as quoted if inside
//     quotes, unquoted otherwise).
//   - Adjacent quote contexts concatenate (no whitespace between them).
//
// Op recognition (longest match first, only outside quotes):
//   3-char: `<<<`, `>>>`, `&>>`
//   2-char: `&&`, `||`, `>>`, `<<`, `&>`, `>&`, `|&`, `<&`
//   1-char: `|`, `;`, `&`, `<`, `>`, `(`, `)`
function tokenize(command) {
  const tokens = [];
  let i = 0;
  let buf = "";
  let bufQuoted = false;
  let inSingle = false;
  let inDouble = false;
  let escape = false;

  function flushString() {
    if (buf.length > 0) {
      tokens.push({ type: "string", value: buf, quoted: bufQuoted });
      buf = "";
      bufQuoted = false;
    }
  }

  function flushOp(op) {
    flushString();
    tokens.push({ type: "op", op });
  }

  while (i < command.length) {
    const ch = command[i];

    if (escape) {
      buf += ch;
      escape = false;
      i++;
      continue;
    }

    if (!inSingle && !inDouble) {
      if (ch === "\\") {
        escape = true;
        i++;
        continue;
      }
      if (ch === "'") {
        inSingle = true;
        bufQuoted = true;
        i++;
        continue;
      }
      if (ch === '"') {
        inDouble = true;
        bufQuoted = true;
        i++;
        continue;
      }
      if (/\s/.test(ch)) {
        flushString();
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
        i += 2;
        continue;
      }
      if ("|&;<>()".includes(ch)) {
        flushOp(ch);
        i++;
        continue;
      }
      buf += ch;
      i++;
      continue;
    }

    if (inSingle) {
      if (ch === "'") {
        inSingle = false;
        i++;
        continue;
      }
      buf += ch;
      i++;
      continue;
    }

    // inDouble: backslash-escapes work, `"` closes.
    if (ch === "\\") {
      escape = true;
      i++;
      continue;
    }
    if (ch === '"') {
      inDouble = false;
      i++;
      continue;
    }
    buf += ch;
    i++;
  }

  flushString();
  return tokens;
}