---
phase: 2
title: "Parse-to-policy-token shim"
status: pending
priority: P1
effort: "0.75d"
dependencies: [1]
---

# Phase 2: Parse-to-policy-token shim

## Overview

Build the thin generic shim that turns `shell-quote`'s `parse()` token stream
into a structured *policy view* the gate checks against: a list of command
segments, each with a verb, a pipe-target (verb of the next piped segment),
quoted-data-args, and the operators between segments. This is the "Configure,
don't implement" boundary — the shim owns token interpretation; the loop owns
policy. No gate behavior changes yet; the shim is a pure function with its own
unit tests.

## Requirements

- Functional: `classifyPolicyTokens(command)` returns
  `{ segments: [{ verb, args, quotedDataArgs, hasRedirect, pipeTarget? }] }`
  for any shell command string.
- Non-functional: pure, deterministic, no I/O; consumes only string/positional
  tokens from `parse()`; never trusts `.op` field values as executable truth.
- The shim must handle the brainstorm shapes: adjacent-quote concatenation
  (`echo "a""b"`), `printf -v`, here-strings (`<<<`), `eval`, `node -e`, and
  real vs logical operators (`|` vs `||`/`&&`/`;`/`&`).

## Architecture

`shell-quote` `parse()` returns a mixed array: string tokens, `{op:"|"}`
operator tokens, `{op:";"/"&&"/"||"}` etc. The shim walks the stream:

1. Split the token array on *real pipe* ops (`{op:"|"}`) into segments. Logical
   ops (`;` `&` `&&` `||`) also split segments but are NOT pipes (no stdout
   routing) — the segment's `pipeTarget` is only set across a real `|`.
2. For each segment, the verb is the first string token after skipping:
   (a) `KEY=VALUE` env-assignment prefixes (`FOO=bar cmd`), and
   (b) **command-prefixes** `sudo`/`time`/`nice`/`nohup`/`command` (the existing
   `COMMAND_PREFIXES` set, gate-logic.js:301 — move to `patterns.json` in Phase
   5; the shim reads it as config). So `command bash -c "evil"` -> verb `bash`,
   `sudo bash` -> verb `bash`. For `printf -v x` the verb is `printf`.
   Verb matching uses `basename(verb)` so PATH-qualified `/bin/bash`,
   `/usr/bin/zsh` normalize to `bash`/`zsh` (red-team #1).
3. `quotedDataArgs` = the string tokens that came from a quoted context (parse
   tags these) — these are DATA, not code.
4. `hasRedirect` = any redirect op in the segment: `>`, `>>`, `<`, `<<`
   (heredoc), `<<<` (here-string), **`&>`/`&>>`/`>&`/`&`+`>` rejoin, and
   fd-numbered `1>`/`2>`** (red-team #9). `shell-quote` splits `&` as a logical
   operator, so `echo "x" &> f` parses as `echo "x"` + `&` + `> f` — the redirect
   sits on the next token. The shim runs a post-parse pass that rejoins a `&`
   immediately followed (after whitespace) by `>`/`>>` into an `&>`/`&>>`
   redirect on the *originating* segment, and folds `1>`/`2>`/`>&N` forms into
   the same flag. Enumerate every redirect form asserted in
   `gate-logic-echo-prose-pipe-target.test.js` Group B and assert the shim
   detects each.
5. `containsExec` = any segment whose verb is `exec` (a shell builtin that
   re-routes the following command's stdout) — set on the whole policy view so
   data-verb blanking can withhold globally (mirrors `stripEchoProseSafe`'s
   `exec`-disables-blanking, gate-logic.js:493-498; red-team #3).

The shim exposes what the verb layer (Phase 3) and inert-sink layer (Phase 4)
need: verb, pipeTarget, quotedDataArgs, hasRedirect, containsExec. It does NOT
classify gate-verbs or inert-sinks — that is config policy, applied in Phases
3-4.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/shell-parse.js` (fill the shim).
- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/shell-parse-classify.test.js`.
- Read-only reference: `tools/learning-loop-mastra/core/gate-logic.js` (`splitSegments`, `splitKeepingDelims`, `segmentVerb`, `printfAssignsToVariable`, `segmentHasRedirect`, `followedByRealPipe`) — the old semantics the shim must reproduce *structurally* (not copy).

## Implementation Steps (TDD)

1. **Write shim unit tests first** (`shell-parse-classify.test.js`), one per
   shape, asserting the policy view:
   - `echo "widgetctl"" run evil" | bash` -> segments: [{verb:"echo",
     quotedDataArgs:["widgetctl"," run evil"], pipeTarget:"bash"},
     {verb:"bash"}]. (Adjacent-quote concat is two quoted args to echo.)
   - `printf -v x 'evi'; bash` -> two segments (split on `;`):
     [{verb:"printf", args:["-v","x"], quotedDataArgs:["evi"]},
     {verb:"bash"}]; first segment's pipeTarget is unset (`;` is not a pipe).
   - `bash <<< "$(echo ev)$(il)"` -> one segment {verb:"bash", hasRedirect
     (here-string), quotedDataArgs containing the `$(...)` composition as a
     single token (unevaluated)}.
   - `eval "$x"` -> {verb:"eval", quotedDataArgs:["$...contents"]}.
   - `node -e "…execSync(assembled)"` -> {verb:"node", args:["-e"],
     quotedDataArgs:[the body]}.
   - `pnpm test:one foo.test.js 2>&1 | tail` -> [{verb:"pnpm",...},
     pipeTarget:"tail"].
   - `echo "x" && bash` -> two segments split on `&&`; first pipeTarget unset.
   - **Command-prefix / indirection / PATH-qualified (red-team #1, #2):**
     `command bash -c "evil"` -> verb `bash`; `sudo bash -c "evil"` -> `bash`;
     `nice bash` / `nohup bash` / `time bash` -> `bash`; `env bash -c "evil"`
     -> verb `env` (env with a bare verb arg is indirection — surfaced, gated
     in Phase 3); `/bin/bash -c "evil"` -> verb `bash` (basename); `FOO=bar
     bash` -> `bash`.
   - **Redirect forms (red-team #9):** `echo "x" > f`, `>> f`, `< f`, `<<EOF
     … EOF`, `<<< "$x"`, `&> f`, `&>> f`, `>&2`, `1> f`, `2>&1` — assert
     `hasRedirect` is true for each; `2>&1` alone (no file redirect) is a
     redirect-flag for withhold purposes.
   - **exec global flag (red-team #3):** `exec > /tmp/x ; echo "y"` -> the view
     has `containsExec: true`.
2. Run tests -> fail (shim empty).
3. Implement `classifyPolicyTokens` in `shell-parse.js` over `parse()`,
   including the post-parse `&>`/fd rejoin and the command-prefix/env-assignment
   skip.
4. Re-run -> green.
5. Cross-check: every shape the old `segmentVerb`/`followedByRealPipe`/
   `printfAssignsToVariable`/`segmentHasRedirect` got right, the shim gets
   right; enumerate the old helpers' test cases and port the assertions as a
   compatibility suite. Specifically port `COMMAND_PREFIXES` prefix-skip and
   the `&>` cross-tokenizer cases from `gate-logic-echo-prose-pipe-target.test.js`.

## Success Criteria

- [ ] `classifyPolicyTokens` returns the documented policy view for all shapes
      above (tests green), including command-prefix skip, PATH-qualified verb
      normalization, indirection-verb surfacing, every redirect form, and the
      `containsExec` flag.
- [ ] Real pipe (`|`) sets `pipeTarget`; logical ops (`;` `&&` `||` `&`) do not.
      `2>&1` is a redirect, not a pipe.
- [ ] `$(...)` inside quoted args appears as an unevaluated token (parse does
      not interpret command substitution) — asserted for the here-string shape.
- [ ] No gate behavior changes yet (existing gate-logic suites unchanged and
      still green).

## Risk Assessment

- **`parse()` token shape differs from the brainstorm spike assumption.**
  Mitigation: the spike (Phase 1) already captured real parse output; the shim
  tests are written against that captured output, not assumption.
- **Env-assignment vs indirection `env`.** `FOO=bar bash` (assignment) skips to
  verb `bash`; `env bash` (indirection) surfaces verb `env`. Mitigation: shim
  distinguishes `KEY=VALUE` tokens from a bare `env` command; tests for both.
- **`&>` rejoin wrong across whitespace/newline.** Mitigation: enumerate the
  exact forms from `gate-logic-echo-prose-pipe-target.test.js`; assert each.
- **Here-string `<<<` vs redirect `<`/`<<` heredoc.** Mitigation: parse tags
  these distinctly; assert in tests.