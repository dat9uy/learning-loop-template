---
phase: 3
title: "Gate-verb config + observation-gated verb layer"
status: pending
priority: P1
effort: "1d"
dependencies: [2]
---

# Phase 3: Gate-verb config + observation-gated verb layer

## Overview

Land the security boundary: executor verbs (`bash`, `sh`, `eval`, `node -e`,
`python -c`, etc.) AND indirection-to-executor verbs (`env`, `xargs`,
`find -exec`, `exec`, `.`, `source`) become observation-gated constraints,
joining the existing `docker`/`sudo` mechanism (`matchConstraintPattern` +
`checkObservationExists` + `makeGateDecision`). This closes finding 3's bypass
class and the assembled-token dataflow class at the verb, because every
bypass shape requires an executor verb and the verb is visible in the parsed
token stream. `awk`/`sed` are deliberately NOT in the initial gate-verb set
(held for a separate exec-vs-read decision; see Phase 4). This is additive —
the new verb check runs on the Phase 2 shim alongside the existing
(still-present) gate passes; deletion is deferred to Phase 5.

## Requirements

- Functional: any command segment whose verb (or pipe-target verb) is a
  configured gate-verb returns `block`/`escalate` when no active observation
  exists, and `ok` when one does — same decision shape as `docker`/`sudo`.
- Functional: the gate-verb set covers BOTH direct executors AND
  indirection-to-executor verbs (`env`/`xargs`/`find -exec`/`exec`/`.`/`source`)
  so the verb layer cannot be bypassed by wrapping (red-team #1).
- Functional: verb matching normalizes PATH-qualified verbs via `basename`
  (`/bin/bash` -> `bash`), and matches verb+flag entries (`node -e`,
  `python -c`) as verb AND flag-set, not string equality (red-team #5).
- Functional: the gate-verb set is config (`patterns.json` and/or a promoted
  `rule` record), not a hardcoded list in `gate-logic.js`.
- Non-functional: the verb layer is observation-gated, not hard-blocked (mirrors
  docker/sudo) so legitimate recorded one-liners proceed; `side-effect-import`
  stays hard-blocked.
- The gate's own adversarial self-probes (`echo "evil" | bash`) need a path
  that does not friction-block the loop's own operation.

## Architecture

Add `gate-verbs` to `patterns.json` as a structured list — entries are either
a bare verb string (`"bash"`) or a `{verb, flags}` object for verb+flag forms:

```jsonc
"gate-verbs": [
  "bash","sh","dash","zsh","ksh","eval",          // direct executors
  "exec","source","env","xargs",                   // indirection-to-executor
  {"verb":"node","flags":["-e","--eval","-p","--print"]},
  {"verb":"python","flags":["-c"]},
  {"verb":"python3","flags":["-c"]},
  {"verb":"ruby","flags":["-e"]},
  {"verb":"perl","flags":["-e","-E"]},
  {"verb":"find","flags":["-exec","-execdir","-ok"]}  // find -exec runs its arg
]
```

`.` (dot) is a verb alias for `source`; list it explicitly. `awk`/`sed` are
held back to Phase 4's inert-sink decision (they are stdin readers too);
do NOT gate them here yet — a bypass that needs `awk`/`sed` execution is added
by a config change in a later decision, with a recorded change-log entry.

`matchGateVerb(policyView)`:
1. For each segment, compute `verbKey = basename(segment.verb)` (so `/bin/bash`
   -> `bash`). Then check `segment.pipeTarget` the same way.
2. A bare-string entry matches when `verbKey === entry`.
3. A `{verb,flags}` entry matches when `verbKey === entry.verb` AND the segment's
   args intersect `entry.flags`.
4. Return the first match as `constraint_type: "gate-verb:<verbKey>"`.

Reuse the observation infrastructure already in `evaluate-bash-gate.js`: after
`matchConstraintPattern`, run `matchGateVerb(classifyPolicyTokens(cmd))`, then
route through `checkObservationExists` + `makeGateDecision`. No new decision
machinery, one new constraint source.

Decision ordering in `evaluateBashGate`: gate-verb is checked in the same
constraint branch as docker/sudo. `applyPromotedRules` runs after and is
unaffected (it still uses the old strip helpers until Phase 4 ports the
inert-sink branch, then Phase 5 deletes the remnants).

**Self-probe path (open item 1 resolved here):** the gate's self-probes and the
repo's rare legitimate `bash -c` one-liners get a recorded observation, not a
preflight marker — observations are the existing per-constraint unlock and they
audit who/why. A preflight marker is for path-writes, not verbs. If friction
proves recurrent, a scoped `gate_override` (existing `gate_override` tool, TTL)
covers a session. Decide the concrete observation text in implementation;
record the decision in a `change-log` entry.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/patterns.json` (add `gate-verbs`).
- Modify: `tools/learning-loop-mastra/core/gate-logic.js` (add `matchGateVerb`, wire into the constraint path; reuse `checkObservationExists`/`makeGateDecision`).
- Modify: `tools/learning-loop-mastra/core/evaluate-bash-gate.js` (call `matchGateVerb` in the constraint branch).
- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-verb-layer.test.js`.

## Implementation Steps (TDD)

1. **Write verb-layer tests first** (`gate-logic-verb-layer.test.js`):
   - Group A (direct executor bypass -> escalate, no observation): each
     finding-3 shape and the dataflow class returns `block`:
     `echo "widgetctl"" run evil" | bash`; `printf -v x 'evi'; bash`;
     `bash <<< "$(echo ev)$(il)"`; `eval "$x"`; `node -e "require('x').execSync('evil')"`;
     `echo "evil" | bash`; `sh -c "evil"`; `python -c "import os;os.system('evil')"`.
   - Group A2 (indirection bypass -> escalate, red-team #1):
     `env bash -c "evil"`; `echo "evil" | xargs bash`;
     `find . -exec bash -c 'evil' \;`; `/bin/bash -c "evil"`; `. evil.sh`;
     `exec bash`; `source evil.sh`; `command bash -c "evil"`; `sudo bash -c "evil"`;
     `nice bash -c "evil"`. Each must report `constraint_type: "gate-verb:<verb>"`.
   - Group A3 (verb+flag variants, red-team #5): `node --eval "evil"`,
     `node -p "evil"`, `python3 -c "evil"`, `perl -e "evil"`, `perl -E "evil"`,
     `ruby -e "evil"` all escalate; **negative** `node script.js` and
     `python script.py` do NOT match `gate-verb:node`/`gate-verb:python` (the
     `-c`/`-e` flag is required).
   - Group B (same shapes -> ok WITH a recorded observation for the matched
     gate-verb constraint_type).
   - Group C (no executor verb -> not gated by verb layer): `pnpm test`, `git
     commit -m "x"`, `node loop.mjs meta_state_list '{}'` return `ok` here
     (may still be gated by other passes — assert only the verb-layer result).
   - Group D (self-probe path): an observation recorded for `gate-verb:bash`
     lets `echo "evil" | bash` through; assert the observation is required.
2. Run tests -> fail.
3. Add `gate-verbs` to `patterns.json` (structured list per Architecture).
   Implement `matchGateVerb(policyView)` with `basename` normalization and
   verb+flag matching.
4. Wire into `evaluate-bash-gate.js` constraint branch (after
   `matchConstraintPattern`, before the path-write check). Reuse
   `checkObservationExists` + `makeGateDecision`.
5. Re-run verb-layer tests -> green.
6. Run the full existing gate corpus (`pnpm test:one` on each `gate-logic-*`
   suite) -> no regression (the new check is additive; shapes that previously
   escalated via promoted rules may now also escalate via the verb — that is
   correct, not a regression, but assert no *new ok* on bypass shapes).

## Success Criteria

- [ ] All finding-3 + dataflow + indirection shapes escalate without an observation; pass with one.
- [ ] PATH-qualified (`/bin/bash`) and command-prefixed (`command`/`sudo`/`nice`/`nohup`/`time`) verbs gated via `basename` + prefix-skip.
- [ ] verb+flag entries (`node -e`, `python -c`) match only with the flag; `node script.js` does NOT match.
- [ ] `gate-verbs` lives in `patterns.json` (config), not hardcoded.
- [ ] No new decision machinery — reuses `checkObservationExists`/`makeGateDecision`.
- [ ] Existing gate corpus green; no new ok on any known bypass shape.
- [ ] Self-probe path decided (recorded observation, not preflight) and logged.

## Risk Assessment

- **Over-gating inert verbs.** `sed`/`awk` are common stdin readers. Mitigation:
  NOT gated in Phase 3 (held for Phase 4 inert-sink decision); a later bypass
  needing their execution is a config change + change-log entry.
- **Indirection verb over-gating legitimate `env`/`find`/`xargs` use.** `env`
  with only env-assignments (no bare verb) is not indirection; `find` without
  `-exec` is not execution. Mitigation: `env` matches only when a gate-verb
  follows as an arg; `find` matches only via the `{-exec,-execdir,-ok}` flag
  entry. Tests for both.
- **Friction on repo automation.** Rare here; the loop uses `node`/`pnpm`/`git`.
  Mitigation: observation + scoped `gate_override` TTL for genuine recurrence.
- **False ok via pipe-target not checked.** If only the *first* segment's verb
  is checked, `printf evil | bash` slips. Mitigation: `matchGateVerb` checks
  both each segment verb AND each `pipeTarget` (the piped-to verb).
- **New indirection verbs missed later.** The set is config; a new bypass via
  an unlisted indirection verb is the residual, recorded in Phase 6's
  `loop-design` (expanded scope).