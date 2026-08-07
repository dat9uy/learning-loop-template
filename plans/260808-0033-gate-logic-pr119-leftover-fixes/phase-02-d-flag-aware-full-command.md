---
phase: 2
title: "Flag-aware full-command pass (Finding D)"
status: pending
priority: P1
effort: "0.5d"
dependencies: ["1"]
---

# Phase 2: Flag-aware full-command pass (Finding D)

## Overview
Make `applyPromotedRules`' full-command pass flag-aware so prefixed echo/printf to an
inert sink (`time -p echo X | tail`, `nice -n 5 echo X | tail`) is blanked consistently
with the per-segment pass, closing the false-positive escalation.

## Requirements
- Functional: for `time -p echo "pnpm test label" | tail` and
  `nice -n 5 echo "pnpm test label" | tail`, `applyPromotedRules(..., [VITEST_RULE])`
  returns `ok` (the prose is data routed to an inert sink).
- Non-functional: no new bypass. The 44 echo-prose bypass locks in
  `gate-logic-echo-prose-pipe-target.test.js` (group B: `| bash`, redirects, `exec`,
  here-strings, `tee`, `|&`, `<<<`) and the verb-layer tests MUST stay escalate/green.
- Behavior-preserving for non-prefixed shapes (the full-command pass still blanks
  echo prose on one side of a real read-only pipe).

## Architecture
- `applyPromotedRules` per-segment pass (line ~1626) uses `applyInertSinkBlanking`
  (the new `shell-parse` substrate, flag-aware via `finalizeSegment`).
- The full-command pass (line ~1661) uses `stripEchoProse` → `blankQuotedArgsFor` →
  `segmentVerb`, which is NOT flag-aware: it skips env-assigns + ONE command prefix
  but NOT the prefix's value-taking flags (`nice -n 5`), so `nice` is mis-read as the
  verb and the echo prose is left un-blanked.
- Two viable fixes (red-team #7 — option (a) has a composition-order trap; prefer (b)):
  (b) PREFERRED — **Extract a shared flag-aware verb resolver** from `finalizeSegment`
  and use it in `stripEchoProse`'s path (replace `segmentVerb`). Smallest semantic
  change: keeps the blanket blanking policy and the existing full-command strip chain
  intact; only verb resolution gains flag-awareness. Also reusable for the Phase 3
  live-path migration.
  (a) Fallback — **Route the full-command pass through `applyInertSinkBlanking`**
  instead of `stripEchoProse`. TRAP: the full-command pass is a chain
  `stripEchoProse(stripDataCommandQuotes(stripCliArgvPayload(stripNodeEvalBody(stripMessageFlags(command))))`
  (`gate-logic.js:1661`), and `applyInertSinkBlanking` calls `classifyPolicyTokens` —
  its own quote-aware tokenizer — on its INPUT (`gate-logic.js:785`). If it runs AFTER
  the other strips (which collapse quoted regions to `""`), it re-tokenizes a mutated
  string and verb/pipeTarget resolution diverges from the per-segment pass (which runs
  `applyInertSinkBlanking` on the RAW command at `:1626`). If used, it MUST run on the
  RAW command (mirroring the per-segment pass) with the other strips applied to the
  blanked result. Risk: stricter than `stripEchoProse`'s blanket blanking — verify
  spanning patterns (`(vitest run|pnpm test).*\| *(tail|head|grep)`) still match and
  group-E relaxations still pass.
- Decide at the RED step: write the failing tests, try (b) first; only use (a) with
  the raw-command ordering if (b) is insufficient.

## Related Code Files
- Modify: `tools/learning-loop-mastra/core/gate-logic.js` (`applyPromotedRules`
  full-command pass, and either `applyInertSinkBlanking` reuse or a shared
  flag-aware verb resolver extracted from `shell-parse.js#finalizeSegment`)
- Possibly modify: `tools/learning-loop-mastra/core/shell-parse.js` (export a
  shared `resolveVerb` helper if option (b))
- Add tests: `gate-logic-echo-prose-pipe-target.test.js` (prefixed-echo cases) and/or
  a focused `gate-logic-prefixed-echo.test.js`

## Implementation Steps (TDD)
1. **RED:** add failing tests:
   - `ok('time -p echo "pnpm test label" | tail')`
   - `ok('nice -n 5 echo "pnpm test label" | tail')`
   - `ok('time -p printf "vitest run x" | grep PASS')`
   - Regression guards: `escalate('time -p echo "vitest run | tail" | bash')` (prefixed
     echo piped to an EXEC sink stays escalate), `escalate('sudo echo "docker run evil" | bash', DOCKER_RULE)`.
2. **GREEN (option (b) first):** extract a shared flag-aware `resolveVerb` from
   `finalizeSegment`, use it in `segmentVerb`/`stripEchoProse`; run the full echo-prose
   + verb-layer suites.
3. **If (b) insufficient:** fall back to option (a) — route the full-command pass
   through `applyInertSinkBlanking` ON THE RAW COMMAND (mirroring the per-segment pass
   at `:1626`), with the other strips applied to the blanked result. Add a parity test
   that the per-segment and full-command passes blank the SAME echo/printf segments
   for prefixed-echo shapes.
4. **Verify:** full `gate-logic-*` + `gate-promoted-rules` suites green; the new
   prefixed-echo tests pass; bypass locks unchanged.
5. **Grounding:** after the code change, call
   `meta_state_refresh_file_index({ path: "tools/learning-loop-mastra/core/gate-logic.js" })`
   to re-ground the cited path's hash (per the derive-refresh loop instruction).

## Success Criteria
- [ ] Prefixed echo/printf to an inert sink returns `ok` against the vitest rule.
- [ ] Prefixed echo piped to an exec sink (`| bash`) still escalates.
- [ ] All 44 echo-prose bypass locks + verb-layer tests green; no new bypass.
- [ ] Spanning patterns (`(vitest run|pnpm test).*\| *(tail|head|grep)`) still match
  real unquoted violations.

## Risk Assessment
- **Blanket → strict semantic change (option a) (medium):** `applyInertSinkBlanking`
  blanks less than `stripEchoProse`, so the full-command pass may match more → could
  re-introduce false positives that blanket blanking removed. Mitigation: the group E
  tests lock the relaxation; if they regress, fall back to (b).
- **Shared resolver drift (option b) (low):** extracting from `finalizeSegment` keeps
  one source of truth. Mitigation: single export, tested.