---
phase: 5
title: "Migrate gate passes onto parse substrate + delete strip helpers"
status: pending
priority: P1
effort: "1.25d"
dependencies: [4]
---

# Phase 5: Migrate gate passes onto parse substrate + delete strip helpers

## Overview

Now that the verb layer (Phase 3) and inert-sink layer (Phase 4) carry the
security boundary and the friction fix on the parse shim, migrate the two
remaining raw-text passes — `matchConstraintPattern` (docker/sudo/etc.) and
the `applyPromotedRules` per-segment + full-command regex passes — onto the
same `classifyPolicyTokens` substrate, then delete the hand-rolled quote
machine (`walkQuoteState` family, `splitSegments`, `splitKeepingDelims`) and
all the strip helpers (`stripMessageFlags`-on-raw-text, `stripNodeEvalBody`,
`stripDataCommandQuotes`, `stripEchoProse`[Safe] — already dead after Phase 4,
`stripCliArgvPayload`, `blankInertQuoted`, `printfAssignsToVariable`,
`segmentVerb`, `segmentHasRedirect`, `followedByRealPipe`, `findDquoteEnd`,
`blankStep`, `blankAllQuoted`, `blankQuotedArgsFor`, `isLoopCliSegment`).

**What survives (red-team #3):** the *withhold predicates* — `hasRedirect` and
`containsExec` — are NOT strip helpers; they are small predicates on the
policy view (Phase 2) used by the Phase 4 blanking. They stay. What is deleted
is the raw-text quote machine + the regex-blanking helpers; the withholds are
re-expressed as two boolean fields already on the policy view. The net LoC drop
is therefore slightly smaller than the full helper line count, but still
substantial (the quote machine + blankers are the bulk).

## Requirements

- Functional: `matchConstraintPattern` and `applyPromotedRules` produce
  identical decisions to Phase 4 on the entire gate corpus (behavior-preserving
  refactor), now computed over `classifyPolicyTokens`.
- Functional: every deleted helper is gone; `core/gate-logic.js` net LoC drops
  materially (target: >400 LoC removed; the quote machine + strip helpers).
- Non-functional: the no-bypass regression suite (built across Phases 3-4 and
  locked here) stays green throughout deletion; deletions happen in small
  commits with the suite re-run after each.
- `stripMessageFlags` and `stripNodeEvalBody` semantics survive — but
  reimplemented on tokens (blank the `-m`/`--message` body; blank the `node -e`
  body) because those are still legitimate data-stripping needs, OR folded into
  the verb/data-verb policy. Decide per-helper in step 2.

## Architecture

After migration the gate flow is:

1. `classifyPolicyTokens(cmd)` -> structured policy view (once).
2. `matchConstraintPattern(view)` -> docker/sudo/etc. against the verb + args
   (regex over the *reconstructed relevant text*, or token predicates — keep
   the existing regex patterns, just feed them the right token-derived string).
3. `matchGateVerb(view)` -> gate-verb constraint (Phase 3).
4. `applyPromotedRules(view, rules)` -> per-segment + full-command regex, with
   inert-sink blanking (Phase 4) and data-verb blanking (replaces
   `stripDataCommandQuotes`/`stripEchoProse`/`stripCliArgvPayload`), now
   computed by blanking `quotedDataArgs` of data-verbs / inert-sinks / loop-CLI
   segments in the policy view.
5. Path-write detection (unchanged — it operates on raw text and does not
   need shell parsing; keep as-is).

`splitSegments`-on-raw-text is replaced by `view.segments`. The `walkQuoteState`
machine is deleted entirely — `shell-quote` owns quote awareness.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/gate-logic.js` (migrate passes; delete helpers).
- Modify: `tools/learning-loop-mastra/core/evaluate-bash-gate.js` (call sites pass the policy view through; minor).
- Read-only / migration source: the helper list above.
- Update: every `gate-logic-*.test.js` suite that imported a deleted helper
  directly — switch to importing `classifyPolicyTokens` or test through
  `applyPromotedRules`/`evaluateBashGate`.

## Implementation Steps (TDD — behavior-preserving)

1. **Lock the no-bypass suite first:** aggregate a single regression entry
   point (`gate-logic-no-bypass-regression.test.js`) that runs every known
   bypass + friction + legitimate shape from Phases 3-4 + the existing echo-prose
   / cli-argv / data-command-quotes suites against `evaluateBashGate`. This is
   the net that must stay green through every deletion commit. Run it green
   on the Phase-4 code first.
2. For each helper to delete, decide its successor:
   - `splitSegments`/`splitKeepingDelims`/`walkQuoteState`/`step*`/`advanceQuoteState`
     -> `classifyPolicyTokens`.
   - `segmentVerb`/`printfAssignsToVariable` -> shim fields.
   - `stripDataCommandQuotes`/`stripEchoProse`/`stripEchoProseSafe`/`stripCliArgvPayload`/`blankInertQuoted`/`blankQuotedArgsFor`/`blankAllQuoted`/`blankStep`/`findDquoteEnd`/`isLoopCliSegment` -> blank `quotedDataArgs` of the matching segment class in the policy view.
   - `segmentHasRedirect`/`followedByRealPipe` -> shim `hasRedirect`/`pipeTarget`.
   - `stripMessageFlags` -> blank the body after `-m`/`--message`/`--title`/`--description`/`--body` in the policy view (data-verb class).
   - `stripNodeEvalBody` -> blank the `node -e` body in the policy view (it remains asymmetric-by-design: only `node` wrappers; `bash -c`/`python -c` stay visible because they are gate-verbs now, gated independently).
   - **Limitation-locking test expected to change (red-team #7):**
     `gate-logic-quoted-strings.test.js:88-99` asserts `node -e
     "console.log(\"sudo apt update\")"` -> `"sudo"` (locks the escaped-inner-
     quote limitation of regex `stripNodeEvalBody`; the test comment itself says
     to update it when quote-aware). Token-based parse blanks the whole body as
     one quoted token -> the result becomes `null`. Change the assertion to
     `null` (limitation fixed); the accepted `node -e` bypass is preserved by
     the verb layer gating `node -e` independently. Do NOT weaken to keep the
     old buggy `"sudo"` — the new behavior is correct.
3. **Move the remaining hardcoded verb sets to config (red-team #6):** add
   `data-verbs` (`grep`/`egrep`/`fgrep`/`rg`/`jq`), `echo-prose-verbs`
   (`echo`/`printf`), and `command-prefixes` (`sudo`/`time`/`nice`/`nohup`/
   `command`) to `patterns.json`. Replace the hardcoded `DATA_COMMANDS`/
   `ECHO_PROSE_COMMANDS`/`COMMAND_PREFIXES` Sets (gate-logic.js:300-301) with
   config reads. Add a test asserting `gate-logic.js` contains no
   `new Set([...])` verb/prefix lists (grep-based guard) so the success
   criterion "no hardcoded verb lists" is enforced, not just claimed.
4. Migrate `matchConstraintPattern` onto the view. Run no-bypass suite + the
   `evaluate-bash-gate.test.js` corpus -> green.
5. Migrate `applyPromotedRules` per-segment + full-command onto the view (with
   inert-sink + data-verb + echo-prose + loop-CLI blanking and the redirect/exec
   withholds from Phase 4). Run suite -> green.
6. Delete the helpers in small commits, re-running the no-bypass suite after
   each. Remove their exports and update importing test files (switch imports to
   `classifyPolicyTokens` / test through `evaluateBashGate`). `stripEchoProse`/
   `stripEchoProseSafe` are already dead after Phase 4; delete them here.
7. Run the FULL test suite (`pnpm test:unit`) -> green. Run `pnpm fallow:gate`
   to confirm no new dead code from the deletion (baseline-inherited lines
   ignored).
8. Record the LoC delta before/after.

## Success Criteria

- [ ] No-bypass regression suite green before, during, and after every deletion commit.
- [ ] `matchConstraintPattern` + `applyPromotedRules` decisions identical to Phase 4 across the gate corpus.
- [ ] `walkQuoteState` family, `splitSegments`/`splitKeepingDelims`, and the full `strip*`/`blank*` helper list deleted from `gate-logic.js`.
- [ ] `data-verbs`, `echo-prose-verbs`, and `command-prefixes` moved to `patterns.json`; no `new Set([...])` verb lists in `gate-logic.js` (grep test green).
- [ ] `gate-logic-quoted-strings.test.js:88-99` updated to assert `null` (limitation fixed), not weakened.
- [ ] `core/gate-logic.js` net LoC drops materially (withhold predicates `hasRedirect`/`containsExec` survive as small policy-view fields).
- [ ] `pnpm test:unit` green; `pnpm fallow:gate` shows no new actionable dead code.
- [ ] No test was *weakened* — every old bypass-catching assertion survives (outcome-asserted through `evaluateBashGate`).

## Risk Assessment

- **A deleted helper carried a subtle invariant a test didn't catch.**
  Mitigation: the no-bypass suite is locked first and run after *every* commit;
  `fallow:gate` cross-checks coverage; any red commit is reverted, not patched
  around.
- **`stripMessageFlags`/`stripNodeEvalBody` semantics lost.** Mitigation:
  reimplement on tokens (step 2) before deleting; add explicit tests for the
  `git commit -m "..."` and `node -e "..."` shapes.
- **The limitation-locking test flip hides a real regression.** Mitigation:
  the new `null` is the *correct* result (body blanked by quote-aware parse);
  the verb layer independently gates `node -e`, so the bypass is still caught —
  assert that too, not just the constraint-pattern result.
- **Test files importing deleted helpers break the build.** Mitigation:
  update imports in the same commit as the deletion; prefer testing through
  `evaluateBashGate` (the public surface) rather than internal helpers.
- **`fallow:gate` flags the deletion as dead-code regression.** Mitigation:
  baseline-inherited lines are ignored per the loop's fallow discipline; only
  genuinely-new dead code from the new path is actionable.