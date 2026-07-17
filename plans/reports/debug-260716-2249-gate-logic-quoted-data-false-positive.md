# Debug: gate-logic quoted-data false positive

**Date:** 2026-07-16
**Skill:** /ak-debug → /ak-fix
**Finding:** meta-260716T2220Z-…full-command-second-pass (resolved)

## Symptom
Banned tokens inside a quoted **search pattern** to a pure-data command triggered `escalate`:
- `grep -E "pnpm test|grep" file` → escalate (false positive; no real vitest/pipe)
- `grep -oE '"command":"[^"]*(vitest|pnpm test|grep)[^"]*"' file` → escalate (the exact scout command false-escalated at 2026-07-16T14:16/14:17 during the prior debug session)
- `echo "pnpm test foo | grep bar"` → escalate (locked accepted echo limitation — must stay)

## Root cause
The gate's strip pipeline (`gate-logic.js`) only blanks quoted bodies for `git -m` (`stripMessageFlags`) and `node -e` (`stripNodeEvalBody`). There was no strip for `grep`/`rg`/`jq` **pattern args**, so rule regexes saw banned tokens inside a data pattern as a real match — in both `matchConstraintPattern` (constraint rules) and `applyPromotedRules` (promoted rules), per-segment AND full-command passes.

**Why now:** `rule-no-raw-stdout-vitest` (promoted 2026-07-15) is the first rule whose right alternation (`| grep`) is a substring commonly found *inside* grep/jq patterns, exposing the latent gap. The maintainers solved this exact false-positive class for `-m` and `node -e`; this is the same gap for a new command family.

## Design constraint (verified, not guessed)
`gate-logic-quoted-strings.test.js` locks an **intentional asymmetry**: `bash -c`/`sh -c`/`python -c`/`ssh -t` quoted bodies are NOT stripped (they ARE executed → must stay enforceable; `bash -c "docker run"` → docker). A blanket "strip all quotes" fix would re-introduce that bypass. Confirmed `bash -c "vitest run | tail"` is currently caught and must remain caught.

## Fix (option chosen: narrow, bypass-free)
New `stripDataCommandQuotes` (`gate-logic.js`) — blanks quoted regions ONLY when the segment's verb is a **pure-data command** (`grep`/`egrep`/`fgrep`/`rg`/`jq`): commands that cannot execute subcommands from a pattern string, so zero new bypass. Helpers: `segmentVerb` (skips env-assignment prefixes + one `sudo`/`time`/`nice`/`nohup`/`command` prefix; `echo grep "…"` is NOT a data command), `blankAllQuoted` (quote-aware state machine — a quote inside the other kind is a literal), `splitKeepingDelims` (lossless quote-aware split preserving `; & |` so the full-command pass still matches real spanning violations like `vitest run … | tail`).

Wired into all three match sites: `matchConstraintPattern`, `applyPromotedRules` per-segment pass, `applyPromotedRules` full-command pass.

Not touched (YAGNI until observed): `echo`/`sed`/`awk` — `awk 'system("…")'` CAN exec, so stripping it would open a bypass; `echo` is a locked accepted limitation.

## Side effects
None in the blast radius. First full-suite run after wiring was green; the only fix needed during implementation was a lossless-rejoin nit in `splitKeepingDelims` (my own test caught it — trimmed spans dropped a space after `;`).

## Verification (fresh evidence)
- New `gate-logic-data-command-quotes.test.js`: **18 tests / 4 suites green** (FP cases → ok; real violations → escalate; verb-recognition edges)
- `gate-logic-quoted-strings.test.js`: **23 green** (locked asymmetry preserved)
- `gate-promoted-rules.test.js`: **54 green** (G8, echo limitation, cache, schema-validation preserved)
- **Full `pnpm test`: exit 0, 2146 tests / 436 suites green** (was 2128 → +18)
- Live `evaluateBashGate` (the actual gate code path), run from a file to avoid the gate evaluating its own banned tokens:
  - `grep -E "pnpm test|grep" …` → **ok** (was escalate)
  - exact scout command → **ok** (was escalate)
  - `pnpm exec vitest run … | tail` → **ESCALATE** (real violation preserved)
  - `echo "pnpm test | grep"` → **ESCALATE** (echo limitation preserved)

Note: the `gate_check` **MCP tool** briefly returned stale `escalate` for the fixed commands because the long-lived MCP server held a pre-edit module instance; the live `evaluateBashGate` it calls returns the correct `ok`. This is a server-caching artifact, not a fix defect.

## Regression tests added
`tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-data-command-quotes.test.js` — FP cases (grep/rg/jq patterns → ok, incl. the exact scout command and a grep spanning a real `| tail`), real-violation preservation (vitest|tail, bash-c, echo), and `stripDataCommandQuotes` verb-recognition edges (prefix handling, echo-arg-not-verb, lossless rejoin).

## Meta-state
- `meta-260716T2220Z-…full-command-second-pass` → **resolved**
- Change-log `meta-260716T2334Z-tools-learning-loop-mastra-core-gate-logic-js` recorded

## Unresolved questions
1. Should `segmentVerb` recognize env-assignment prefixes (`FOO=bar grep …`)? Currently skipped via the while-loop, but only one command prefix is consumed — a `sudo time grep` double-prefix is not recognized. Not observed; deferred.
2. The MCP `gate_check` tool returns stale results when the server process predates a `gate-logic.js` edit. Worth a finding (the gate is the single source of truth, but the tool can lag the code)? Left open.
