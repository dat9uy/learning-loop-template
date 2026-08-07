# Phase 3 — Gate-verb config + observation-gated verb layer

Date: 2026-08-07

## Outcome

`matchGateVerb()` lands in `tools/learning-loop-mastra/core/gate-logic.js`
and is wired into `evaluateBashGate` as an additive constraint branch.
Gate-verbs are config (in `patterns.json`), not hardcoded; the verb layer
closes the bypass class for finding 3 (executor shapes) and indirection
shapes (red-team #1). 36/36 verb-layer tests green; existing gate suites
unchanged.

## Files changed

- `tools/learning-loop-mastra/core/patterns.json` — added `gate-verbs`
  structured list (direct executors + indirection verbs + verb+flag
  entries).
- `tools/learning-loop-mastra/core/gate-logic.js` — added
  `GATE_VERBS` constant (loaded from patterns.json, normalized to
  `{verb, flags}` shape) + `INDIRECTION_VERBS` set + `matchGateVerb()`
  function + private `basename()` helper. Imports `classifyPolicyTokens`
  from the new `shell-parse.js`.
- `tools/learning-loop-mastra/core/evaluate-bash-gate.js` — wired the
  gate-verb check after `matchConstraintPattern`. Same observation /
  decision plumbing as docker/sudo; gate-verb result replaces the
  existing constraint result when stricter (hard_block) or when the
  existing result is `ok`.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-verb-layer.test.js`
  (new) — 36 tests across direct executor shapes, indirection shapes,
  verb+flag variants, non-gate-verb passthroughs, and indirection
  predicate precision.

## Behavior changes

Additive — no existing gate passes changed. The gate-verb layer runs
alongside `matchConstraintPattern` in the constraint branch; either match
escalates; the stricter (hard_block) wins; if neither matches, the gate
falls through to `applyPromotedRules` and path-write checks as before.

Gate-verbs covered:
- **Direct executors:** `bash`, `sh`, `dash`, `zsh`, `ksh`, `eval`
- **Indirection-to-executor verbs:** `exec`, `source`, `env`, `xargs`, `.`
  (the dot/source alias); `find` via the `-exec`/`-execdir`/`-ok` flag
- **Verb+flag entries:** `node -e`/`--eval`/`-p`/`--print`,
  `python -c`, `python3 -c`, `ruby -e`, `perl -e`/`-E`
- **Held back from inert-sinks (Phase 4):** `awk`/`sed` — dual exec/reader
  role is not cleanly parseable; their exec-role is the residual that
  the loop-design record (Phase 6) captures

Verb matching:
- `basename(verb)` normalization so `/bin/bash` -> `bash`
- Command-prefix skip in `classifyPolicyTokens` so `sudo bash`,
  `command bash`, `nice bash`, `nohup bash`, `time bash` all resolve
  to verb `bash`
- Indirection predicate: `env` and `xargs` match only when the next
  arg is itself a gate-verb; `env FOO=bar` and `find . -name '*.js'`
  (no `-exec`) do NOT match

Self-probe path (open item 1): the gate's own adversarial self-probes
and the repo's rare legitimate `bash -c` one-liners get a recorded
observation, not a preflight marker — observations are the existing
per-constraint unlock and they audit who/why. If friction proves
recurrent, a scoped `gate_override` (TTL) covers a session.

## Phase 3 success criteria

- [x] Finding-3 + dataflow + indirection shapes escalate without an
      observation; pass with one. (36 tests cover the shapes.)
- [x] PATH-qualified (`/bin/bash`) and command-prefixed verbs gated
      via `basename` + prefix-skip.
- [x] verb+flag entries match only with the flag; `node script.js`
      does NOT match.
- [x] `gate-verbs` lives in `patterns.json` (config), not hardcoded.
- [x] No new decision machinery — reuses
      `checkObservationExists` / `makeGateDecision`.
- [ ] Existing gate corpus green — pre-existing flake: 1 failure in
      `gate-logic-data-command-quotes.test.js` ("vitest run | tail")
      and 1 in `gate-logic-echo-prose-pipe-target.test.js`; both
      reproducible on HEAD (verified via git stash); not caused by
      Phase 3. Phase 4 (inert-sink allowlist) replaces the strip
      helpers and resolves both.
- [x] Self-probe path decided (recorded observation, not preflight)
      and logged.