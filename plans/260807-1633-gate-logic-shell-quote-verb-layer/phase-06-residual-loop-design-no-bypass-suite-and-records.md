---
phase: 6
title: "Residual loop-design + no-bypass suite + records"
status: pending
priority: P2
effort: "0.5d"
dependencies: [5]
---

# Phase 6: Residual loop-design + no-bypass suite + records

## Overview

Bound the residual — the classes the verb layer + Phase 4 withholds cannot
statically close:

1. **Assembled token to a trusted verb** — `pnpm run evil-script` where `pnpm`
   is trusted and the script name is data, but the script body executes. The
   verb layer cannot see this because `pnpm` is not a gate-verb.
   (Note: the *persisted-prose* variant `echo "banned" > f && pnpm run f` is
   CLOSED by Phase 4's redirect withhold, not residual — assert it in the
   no-bypass suite. The residual is the *direct* assembled-token-to-trusted-verb
   where the trusted verb's arg is itself an assembled script reference.)
2. **An unlisted indirection verb** — a future shell shape using an
   indirection-to-executor verb not in the `gate-verbs` config. The set is
   config; a new indirection verb is a config gap until a recorded decision
   adds it. Smaller than "all shell dataflow," bounded by the curated
   gate-verb + indirection list.

Record both as a `loop-design` (agent-cited, not evergreen docs). Lock the
no-bypass regression suite as a first-class artifact. Close the loop's own
records: the change-log entry for the substrate swap, the supersede
relationship to plans 260807-1401 / 260807-1450, and the resolution status of
the three findings' underlying mechanism.

## Requirements

- Functional: a `loop-design` record captures the residual (assembled token to
  a trusted verb) with the agent-citation pattern; no silent auto-resolve.
- Functional: the no-bypass regression suite is a named, runnable artifact
  (`pnpm test:one`-addressable) covering every shape from Phases 3-5.
- Functional: a `change-log` entry records the mechanical change (strip
  helpers removed, parse substrate adopted) with `change_dimension:
  "mechanical"`, `change_target: "bash-gate shell parsing"`, and the
  added/removed/changed diff.
- Non-functional: the three findings' *resolution* stays valid (their shapes
  now escalate/ok via the new architecture); the *mechanism* changed, which is
  logged, not silently flipped. Re-ground cited code paths via
  `meta_state_refresh_file_index` after the refactor.

## Architecture

The residual is genuinely bounded: the verb layer closes every shape whose
executor is a *gate-verb* (observable). The only open class is when the
executor is a *trusted* verb the gate does not gate (`pnpm`, `node`, `git`)
AND the payload is an assembled token referencing an attacker-influenced
script. That is a smaller surface than "all shell dataflow," and it is the
class the existing `loop-design` record mechanism exists for — agents cite
it; no evergreen doc, no auto-resolve.

This phase writes records, not code (except the regression-suite entry point,
which is test code). It does not change gate behavior.

## Related Code Files

- Create/curate: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-no-bypass-regression.test.js` (the locked suite, consolidated in Phase 5 step 1; here it is finalized and named).
- Records: `meta_state_propose_design` + `meta_state_ship_loop_design` for the residual; `meta_state_log_change` for the substrate swap; `meta_state_refresh_file_index` for the refactored `gate-logic.js` path.

## Implementation Steps

1. Propose + ship the residual `loop-design`:
   `meta_state_propose_design({title:"assembled-token-to-trusted-verb and unlisted-indirection residual",
   description:"verb layer + indirection gate-verbs + Phase 4 redirect/exec
   withholds close the bypass + persisted-prose classes; residual is (a)
   assembled tokens routed to a trusted verb (pnpm run <script>) and (b) a
   future shell shape using an unlisted indirection-to-executor verb — both
   agent-cited, not statically closable", proposed_design_for:"bash-gate",
   affected_system:"bash-gate", severity_hint:"low"})` then
   `meta_state_ship_loop_design({id,
   shipped_in_plan:"260807-1633-gate-logic-shell-quote-verb-layer"})`.
2. Log the mechanical change: `meta_state_log_change({change_dimension:
   "mechanical", change_target:"bash-gate shell parsing (gate-logic.js)",
   change_diff:{added:["shell-quote parse substrate","gate-verb constraint",
   "inert-sink allowlist"],removed:["walkQuoteState quote machine",
   "splitSegments/splitKeepingDelims","strip* helpers"],changed:[
   "matchConstraintPattern + applyPromotedRules run on classifyPolicyTokens"]},
   reason:"stop the gate-logic finding treadmill; move security boundary from
   token to verb; library owns parsing, loop owns policy"})`.
3. Re-ground the refactored code path:
   `meta_state_refresh_file_index({path:"tools/learning-loop-mastra/core/gate-logic.js",
   reason:"parse-substrate refactor"})` and for `shell-parse.js` +
   `evaluate-bash-gate.js`.
4. For each of the three findings, re-verify the resolution rides the new
   architecture: `meta_state_re_verify({id, refresh:true})` for
   `meta-260807T1538Z-...` (finding 3 — now escalates via verb layer),
   `meta-260807T065133Z-6d1973a8` (finding 1 — now ok via inert-sink),
   `meta-260807T054940Z-92fb5b00` (finding 2 — now ok via inert-sink). Cite the
   new test that proves each.
5. Finalize the no-bypass regression suite as a named artifact; confirm
   `pnpm test:one tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-no-bypass-regression.test.js` is green and documented in the plan.
6. Revisit open item 2: if the quote-concatenation normalizer's *discipline*
   value is gone (security value subsumed by the verb layer) and no discipline
   regression appeared, record the decision to leave it deleted in the
   change-log entry. If a regression appeared, add a minimal token-level
   normalizer (not a raw-text strip helper).

## Success Criteria

- [ ] Residual captured in a shipped `loop-design` record; no auto-resolve.
- [ ] `change-log` entry records the substrate swap with the full diff + reason.
- [ ] Cited code paths re-grounded (`meta_state_refresh_file_index`).
- [ ] Three findings re-verified on the new architecture with citing tests.
- [ ] No-bypass regression suite is a named, green, documented artifact.
- [ ] Open item 2 (quote-concatenation normalizer) decided and logged.

## Risk Assessment

- **A finding's resolution silently flips because the mechanism changed.**
  Mitigation: `meta_state_re_verify` with `refresh:true` re-runs the
  verification steps on the new substrate; the citing tests prove the outcome.
- **Residual under-recorded.** Mitigation: `propose_design` +
  `ship_loop_design` make it a first-class cited artifact, not a comment.
- **Forgetting to re-ground the file index.** Mitigation: explicit step 3;
  the loop's cold-tier cache invalidates on the path SHA change, so a missed
  refresh just means a stale fingerprint until next seed — low risk, but do it.