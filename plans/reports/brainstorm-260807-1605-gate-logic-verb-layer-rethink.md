# Brainstorm — gate-logic verb-layer rethink

**Status:** PAUSED (summary only; no plan yet). Awaiting operator go to run the
library spike, then hand off to `/ak:plan`.
**Branch:** `260807-1349-meta-state-resolve-and-cli-argv-scope-drift-finding`
**Date:** 2026-08-07

## Trigger

Three open `gate-logic-bug` findings, all filed today (2026-08-07), and a
history of many sessions fixing gate-logic errors with new error kinds
reappearing each session. Operator asked to rethink the approach rather than
continue incremental patching.

## The three findings (scouted, full text read)

| Finding | Direction | Shape | Why the gate misses it |
|---|---|---|---|
| `meta-260807T1538Z-pre-existing-not-introduced-by-the-echo-prose-relaxation-pro` | **False negative (real bypass)** | `echo "widgetctl"" run evil" \| bash` → `ok`; `printf -v` split; cross-segment var composition; `$()` composition | regex matches raw text; shell concatenates/expands *after* matching |
| `meta-260807T065133Z-6d1973a8` | **False positive (friction)** | `printf '%s\n' '<json with \| inside>' \| node bash-gate.js` → escalate | `\|` is inside quoted **data**; gate preserves on ANY real pipe by design |
| `meta-260807T054940Z-92fb5b00` | **False positive (friction)** | `pnpm test:one <file> 2>&1 \| <reader>` → escalate | real pipe to an **inert** sink; preserve-on-any-pipe by design |

## Diagnosis — one root cause

The bash gate decides `ok`/`escalate` by running **regex rules against raw
(quote-aware-stripped) shell text** in `core/gate-logic.js` (1251 LoC). Shell
semantics defeat that model in two directions:

- **False negatives** — regex can't see through shell token composition
  (adjacent-quote concatenation, `printf -v`, variable composition, `$()`).
- **False positives** — regex can't distinguish **data** from **code** (a `|`
  inside quoted JSON; a real pipe to an inert sink).

Every prior fix was a new strip-helper (`stripEchoProse[Safe]`,
`stripCliArgvPayload`, `stripDataCommandQuotes`, the `walkQuoteState` machine,
`splitSegments`, `splitKeepingDelims`, `blankInertQuoted`). Each is the loop
**re-implementing shell parsing** and hitting the next shell edge case — that
is the treadmill.

Findings 1 & 2 are the *deliberate cost* of a soundness decision a prior session
locked ("preserve prose on ANY real pipe; never classify sinks" — red-team in
plan `260807-1450`, rejected inert-sink classification as unsound: `tee`/`dd`/`cat`
persist, exec-sink long tail unbounded).

## Key correction made during brainstorm

The active `loop-design-ast-based-runtime-agnostic-check` was initially
(c wrongly) cited as the bash-gate structural fix. It is NOT — it covers the
**JS source** runtime-agnostic checklist (acorn AST walk), a different surface.
For the **bash gate** there is no existing structural design on the books; the
structural approach would be net-new. This is recorded so the plan does not
build on a misattribution.

## The rethinking (operator-accepted direction)

**Move the security boundary from the token to the verb.** The evaluation
class (assembled tokens) is closable only at the executor, because static text
cannot see runtime assembly — but it does not need to: every dataflow shape
needs an **executor verb**, and the verb is visible in the text.

- `printf -v x 'evi'; bash` → gated at `bash`
- `bash <<< "$(echo ev)$(il)"` → gated at `bash`
- `eval "$x"` → gated at `eval`
- `node -e "…execSync(assembled)"` → gated at `node -e`

`patterns.json` already observation-gates `docker`/`sudo` (constraint requires
an active observation). The gate-verb layer joins that *same* mechanism — no new
machinery, one new constraint class. The codebase already names this class:
the comment in `applyPromotedRules` lists "executed-body verbs
(bash -c, sh -c, python -c, awk, sed)" and deliberately does NOT strip them.
The move promotes that known class from "don't strip" to "gate at the verb."

### Architecture: configure, don't implement (trajectory-aligned)

The loop's product is the policy, not the parsing logic (trajectory gradient:
knowledge from code → records → tools). So:

| Role | Owner | Lives in |
|---|---|---|
| **Parse** shell → tokens (verb, pipe-target, quoted-args, operators) | **a library** (e.g. `shell-quote`) | one small dependency |
| **Configure** policy: gate-verbs, inert-sinks, data-verbs | **the loop** | `patterns.json` / records |
| **Check** parse-result against configured policy | thin gate shim (~30 LoC generic) | `core/gate-logic.js`, shrunk |

The verb layer and inert-sink allowlist both become **configured lists evaluated
against a library-parsed token stream** — not hand-rolled regex. The strip
helpers and the quote-state machine are deleted; the library owns parsing; the
loop owns policy. New shell shapes become *config entries*, not new code +
findings — that is what stops the treadmill.

### What each layer closes

| Layer | Concern | Closes | Mechanism |
|---|---|---|---|
| **Verb** (security) | assembled-token execution | finding 3 bypass + dataflow class | configured gate-verbs, observation-gated like docker/sudo |
| **Sink** (friction) | legitimate inert pipes | findings 1 & 2 | configured inert-sink list (operator-owned; reopens the locked decision by operator sign-off) |
| **Token** (discipline) | direct promoted-rule violations | remaining discipline rules | existing promoted-rule regex on the parsed stream (normalizer optional — its security value is subsumed by the verb layer) |
| **Loop-design** (residual) | assembled token → *trusted* verb (`pnpm run evil-script`) | genuinely-bounded remainder | a `loop-design` record; agents cite it. Far smaller than first claimed |

### Locked decision reopened (by operator sign-off)

"Preserve prose on ANY real pipe / never classify sinks" → replaced by a
**curated, operator-owned inert-sink allowlist**. Distinct from the rejected
*automatic* classification: the set is closed policy, not inference; new
entries require an operator decision (a config/record change), like every
other gate policy.

## Library pick — `shell-quote` (VERIFIED 2026-08-07)

Verified via WebSearch + npm registry + CVE databases.

**Maintenance — confirmed.** Moved substack → **ljharb**. Active releases
through 2026: `1.8.4` (2026-05-22), `1.9.0` (2026-06-25), `1.10.0` (2026-07-10).
2330 dependents. Actively maintained.

**CVE-2026-9277 — command injection, touches `parse()` too.** The `.op` field
of object-tokens is not escaped against JS line terminators (`\n` `\r` U+2028
U+2029). Two reachable vectors per SentinelOne: (1) `quote()` with object-tokens
(output path); (2) `parse(cmd, envFn)` when `envFn` returns an attacker-influenced
`.op`. Fixed in commit `1518179` (strict shape validation); pin **≥1.10.0**.

**Exposure for a parse-only, classify-only gate:** the injection is *realized*
at `quote()` (unescaped terminator reaches a shell); `parse()` only *produces*
the bad token. Our flow (`parse(cmd)` → read tokens → classify verb/pipe-target
→ check config) never calls `quote()`, never passes tokens to an executor.
Not on the realization path. Defensible mitigations: pin ≥1.10.0; **forbid
`quote()` import** (lint + test guard); consume only string/positional tokens,
never trust `.op` field values; regression-test that `parse()` does not evaluate
`$(...)` (README confirms it does not interpret `$(...)`/`$((...))`).

### Verification reframed the decision into two decoupled paths

The verb layer does **not** strictly need a full parser — identifying the
executor-verb and pipe-target needs only quote-aware segmentation, which the
gate **already has** (`splitSegments`/`splitKeepingDelims` on `walkQuoteState`).
So the core rethinking splits:

| Path | What | Dep / CVE risk | Ends strip-helper treadmill? |
|---|---|---|---|
| **Minimal (no dep)** | verb layer (config) + inert-sink allowlist (config) on existing `splitSegments`. Loop configures; gate checks. | none | no — strip helpers stay as the token-discipline substrate |
| **Full (shell-quote)** | replace quote machine + all strip helpers with `parse()`; policy is pure config; deletes ~600 LoC | `shell-quote` ≥1.10.0, parse-only, CVE caveat | yes — at the root |

Minimal delivers the security win (finding 3 + dataflow class closed at the
verb) and the friction win (findings 1 & 2 via configured inert-sinks) — the
actual rethinking — without the dep/CVE. It satisfies "configure, don't
implement" for the new layers. It does NOT delete the strip-helper maintenance
surface the operator wants to shed. Full does, at the cost of adopting a
library with a recent command-injection CVE as a security boundary.

**Revised recommendation:** start with the **minimal** path; treat the
shell-quote full-refactor as a separate later decision once we see whether the
strip-helper treadmill actually persists after the verb layer lands (the verb
layer may eliminate the dangerous *bypass* findings, leaving only *discipline*
findings that may not justify a parser dep + CVE risk).

Fallbacks if `shell-quote` is later chosen and falls short:
`@mergesium/shell-quote` (fork, opaque maintenance), `node-posix-shell-parser`,
or a small native bridge to `mvdan/sh`'s `shfmt` (heavier; reject unless
needed).

## Next step — decide minimal vs full, then (if full) spike

**If minimal chosen:** no spike needed; hand the converged contract to
`/ak:plan` directly (verb layer + inert-sink allowlist on existing
`splitSegments`; strip helpers retained).

**If full chosen:** spike `shell-quote` ≥1.10.0 in an isolated worktree
(side-effect: `gate_check` + record before `pnpm add`):

```bash
# verify installed version >= 1.10.0 (includes CVE-2026-9277 fix, commit 1518179)
node -e 'console.log(require("shell-quote/package.json").version)'
# parse-only, classify-only — NEVER import quote()
node -e '
  const {parse} = require("shell-quote");
  const cases = [
    `echo "widgetctl"" run evil" | bash`,
    `printf '\''%s\n'\'' '\''{"x":"pnpm test run | tail"}'\'' | node tools/learning-loop-mastra/hooks/universal/bash-gate.js`,
    `pnpm test:one foo.test.js 2>&1 | tail`,
    `echo "docker run evil" | bash`,
    `printf -v x "evi"; bash <<< "$x"`,
    `eval "$x"`,
  ];
  for (const c of cases) { console.log(JSON.stringify(c), "=>", JSON.stringify(parse(c))); }
'
```

Spike acceptance: (a) installed version ≥1.10.0; (b) parse output lets the shim
identify verb + pipe-target + quoted-data for each shape; (c) `parse()` does
not evaluate `$(...)` (sanity); (d) a lint/test guard forbids importing `quote`
from `shell-quote` anywhere in the gate path. If any finding shape mis-parses,
fall back to `@mergesium/shell-quote` / `node-posix-shell-parser`.

After the decision (+ spike if full): hand the converged contract to `/ak:plan`
→ `/ak:cook`.

## Brainstorm contract (final)

- **Outcome:** Stop the gate-logic finding treadmill; the gate's shell parsing
  is library-owned and the loop configures policy via records.
- **Constraints:** Open no bypass (verb layer is the new security boundary).
  Reuse a library for parsing — the loop configures, not implements. New dep
  must be small and verified maintained. Keep `matchConstraintPattern`
  (docker/sudo) as the existing verb-gate precedent the new gate-verbs join.
  Track residual via `loop-design`, not evergreen docs; no silent auto-resolve
  (the loop has a documented preference against auto-resolve-by-clock —
  `loop-design-stale-flag-redesign-replace-auto-resolve-by-clock-with-re-ve`).
- **Non-goals:** Don't model full shell dataflow evaluation (residual is
  bounded). Don't hand-roll a parser. Don't touch write/inbound gates.
- **Acceptance criteria:** (1) finding 3's shapes return `escalate` via the
  verb layer; (2) findings 1 & 2 return `ok` via configured inert-sinks
  without opening `echo "docker" | bash`; (3) no-bypass regression suite green
  on the new substrate; (4) gate-verbs + inert-sinks + data-verbs are config
  (patterns.json / records), not code; (5) `core/gate-logic.js` shrinks (strip
  helpers + quote machine deleted); (6) residual bounded in a `loop-design`.

## Open items / unresolved

1. **Minimal vs full path** — the verification reframed this into a real fork
   (see Library pick). Minimal: no dep, no CVE, strip helpers retained. Full:
   `shell-quote` ≥1.10.0 parse-only, deletes strip helpers, carries CVE caveat
   as a security boundary. **Operator decision before plan.**
2. Friction cost of observation-gating legitimate `bash -c`/`sh -c`/`eval`
   one-liners — rare in this repo (loop uses `node loop.mjs`, `pnpm`, `git`),
   and the gate's own adversarial self-probes (`echo "evil" | bash`) need a
   preflight-exempt or recorded-observation path. Decide in the plan.
3. Whether to keep the quote-concatenation normalizer for *discipline* value
   once the verb layer subsumes its *security* value — decide in the plan
   (operator leaned "verb layer + allowlist only" but left it open).