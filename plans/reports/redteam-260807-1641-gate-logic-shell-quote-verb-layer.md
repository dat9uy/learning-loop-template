# Red-team review — gate-logic shell-quote verb-layer plan

**Plan:** `plans/260807-1633-gate-logic-shell-quote-verb-layer/`
**Reviewer:** code-reviewer (adversarial)
**Verdict:** FIX (rework soundness framing; fix 2 blockers + 5 majors + 2 minors before cook)
**Date:** 2026-08-07

## Confirmed findings (ranked, all verified against source)

1. **BLOCKER — Indirection verbs bypass the verb layer.** `env bash -c "evil"`,
   `xargs bash`, `find . -exec bash -c 'evil' \;`, `/bin/bash`, `. script`,
   `exec`, `source` — none in the gate-verb list; no PATH normalization. The
   "verb layer is the no-bypass lock" claim is false for these. Current
   `applyPromotedRules`/`stripEchoProseSafe` catches the promoted-rule-only
   variants (preserves prose on ANY real pipe). Fix: add indirection verbs to
   `gate-verbs` + `basename(verb)` normalization; OR expand the residual.
2. **BLOCKER — `command`/`sudo`/`nice`/`nohup`/`time` prefix regression.** The
   shim (Phase 2) only skips `KEY=VALUE` env-assignments; it omits
   `COMMAND_PREFIXES` (gate-logic.js:301), so `command bash -c "evil"` →
   verb=command → not gated. Fix: shim skips command-prefixes (move the set to
   `patterns.json`); add tests.
3. **MAJOR — Phase 4/5 blanking drops `stripEchoProseSafe`'s
   redirect/exec/pipe-withhold.** `echo "vitest run | tail" > /tmp/x && pnpm run
   /tmp/x` → data-verb blanking hides the prose; executor `pnpm` is trusted (not
   a gate-verb) → verb layer does NOT catch it → regression for promoted-rule-
   only tokens. `&>`/`&>>`/`>&`/fd-numbered forms and `exec`-segment global
   disable also dropped. Fix: port the withhold (segment hasRedirect; command
   contains `exec`; `&>` rejoin) onto the inert-sink + data-verb blanking in
   the policy view.
4. **MAJOR — Phase 4 ordering: cannot take effect without Phase 5's migration.**
   If `stripEchoProseSafe` still preserves prose on ANY real pipe in Phase 4,
   the inert-sink branch never sees prose to blank → findings 1 & 2 don't fix.
   Fix: Phase 4 owns the behavior change (replace stripEchoProseSafe, port the
   withholds); Phase 5 deletes the now-dead helper.
5. **MAJOR — `node -e`/`python -c` verb+flag matching underspecified.** List
   entries like `"node -e"` vs verb `node` + arg `-e`. Fix: entry = verb AND
   flag-set; add flag-variant tests + negative `node script.js`.
6. **MAJOR — `data-verbs`/`echo-prose-verbs`/`command-prefixes` never moved to
   `patterns.json`.** Success criterion unmet by the plan's own steps.
   `DATA_COMMANDS`/`ECHO_PROSE_COMMANDS`/`COMMAND_PREFIXES` (gate-logic.js:300-301)
   stay hardcoded. Fix: explicit Phase 5 step + test asserting no `new Set([...])`
   verb lists in `gate-logic.js`.
7. **MAJOR — Limitation-locking test will flip.**
   `gate-logic-quoted-strings.test.js:88-99` asserts `node -e
   "console.log(\"sudo apt update\")"` -> `"sudo"` (locks the escaped-inner-quote
   limitation; comment says update when quote-aware). Token-based parse blanks
   the whole body -> result becomes `null` -> test fails. Fix: list it in
   Phase 5 as expected-to-change (assert `null`).
8. **MINOR — CVE test guard too narrow.** Covers `shell-parse.js` only; a
   direct `import { quote } from "shell-quote"` in `gate-logic.js` bypasses it.
   Fix: grep `core/`+`hooks/` for `quote` import from `shell-quote`, fail on
   match.
9. **MINOR — `hasRedirect` operator set incomplete.** Missing `<<`, `&>`,
   `&>>`, `>&`, fd-numbered (`1>`). shell-quote splits `&` as a logical op, so
   `echo "x" &> f` puts the redirect on a different token. Fix: enumerate the
   operators from `gate-logic-echo-prose-pipe-target.test.js`; add a post-parse
   rejoin for `&`+`>`.

## Conceptual correction folded into the plan

"Verb layer is the no-bypass lock" → "Verb layer is the no-bypass lock for
**gate-verb and indirection-to-executor verbs**; for **trusted-verb executors**
(`pnpm`/`node`/`git`) running persisted content, the redirect/exec/pipe-withhold
on data-verb blanking remains the lock and is **ported to tokens, not deleted**."
The raw-text strip helpers are still deleted; their *withhold predicates*
survive as small predicates on the policy view (`hasRedirect`,
`containsExec`). LoC savings hold, but smaller for the withhold-bearing
helpers than first claimed.