---
phase: 4
title: "Inert-sink allowlist as config"
status: pending
priority: P1
effort: "1d"
dependencies: [3]
---

# Phase 4: Inert-sink allowlist as config

## Overview

Close findings 1 & 2 (friction) with a curated, operator-owned inert-sink
allowlist: when a command has a real `|` whose target verb is a configured
inert sink, promoted-rule tokens living only in the *inert side's* quoted data
do not escalate, because that data cannot execute. This reopens — by operator
sign-off — the previously-locked decision "preserve prose on ANY real pipe /
never classify sinks." Distinct from the rejected *automatic* classification:
the set is closed policy (a config entry), not inference; new entries require
an operator decision like every other gate policy.

**This phase owns the behavior change (red-team #4).** The inert-sink branch
*replaces* `stripEchoProseSafe`'s pipe-preservation role in `applyPromotedRules`
and, in doing so, MUST carry `stripEchoProseSafe`'s no-bypass withholds
(redirect, exec, real-pipe-to-executor) onto the policy view — otherwise the
friction fix opens a promoted-rule evasion for persisted-prose + trusted-verb
shapes (red-team #3). After this phase, `stripEchoProseSafe` is dead code and
is deleted in Phase 5.

The verb layer (Phase 3) is the no-bypass lock for gate-verb AND
indirection-to-executor verbs. For **trusted-verb** executors (`pnpm`/`node`/
`git`) running persisted content, the verb layer does NOT independently catch a
banned token — so the inert-sink/data-verb blanking's withholds (this phase)
are the second lock and must not be dropped.

## Requirements

- Functional: `printf '%s\n' '<json with | inside>' | node bash-gate.js` and
  `pnpm test:one <file> 2>&1 | tail` return `ok` via the inert-sink path.
- Functional: `echo "docker run evil" | bash`, `echo "banned" > f && bash f`,
  and any pipe to a *gate-verb* still escalate (no bypass).
- Functional: **persisted-prose + trusted-verb shapes still escalate (red-team
  #3):** `echo "vitest run | tail" > /tmp/x && pnpm run /tmp/x`,
  `echo "banned" &> f && pnpm run f`, `exec > /tmp/x ; echo "banned" ; pnpm run
  /tmp/x`. The executor is `pnpm` (trusted, not a gate-verb), so the withhold
  on the data-verb/inert-sink blanking — not the verb layer — is the lock here.
- Functional: the inert-sink set is config (`patterns.json` and/or a record),
  operator-owned, and curated — NOT inferred.
- Non-functional: inert-sink relaxation applies only to *quoted data* on the
  inert side, never to executable bodies routed through a gate-verb, and never
  when the inert-sink segment has a redirect or the command contains `exec`.

## Architecture

Add an `inert-sinks` list to `patterns.json` (start conservative:
`["tail","head","grep","rg","cat","wc","sort","uniq"]`). Hold `awk`/`sed` out
of inert-sinks entirely (red-team #1 dual-role): they are executor-capable, and
the executed-body vs stdin-reader distinction is not cleanly parseable from
`parse()` — no bypass is preferable to friction. If `awk`/`sed` friction later
recurs, a separate `loop-design` decision adds them with a recorded
exec-vs-read predicate; not now.

The `applyPromotedRules` per-segment pass gains an inert-sink branch on the
policy view that **replaces `stripEchoProseSafe`'s pipe-preservation role**:
when a segment's `pipeTarget` is an inert sink, blank the *inert-side* segment's
`quotedDataArgs` before regex-matching (so a banned token living only in the
inert side's quoted data cannot pair with the pipe to false-escalate). Because
this replaces `stripEchoProseSafe`, it MUST also reproduce that helper's three
no-bypass withholds (gate-logic.js:444-498), now as predicates on the policy
view:

1. **Redirect withhold (red-team #3):** do NOT blank a data-verb/inert-side
   segment's `quotedDataArgs` when that segment has `hasRedirect` (the output
   is persisted to a file a trusted verb can later run). Covers `>`, `>>`,
   `&>`, `&>>`, `>&`, fd-numbered.
2. **exec withhold (red-team #3):** do NOT blank ANY data-verb segment's
   `quotedDataArgs` when the policy view has `containsExec: true` (`exec`
   re-routes stdout globally).
3. **Executor-pipe withhold:** a real `|` whose target is a *gate-verb*
   (Phase 3) is NOT an inert sink — never blank across it. (The verb layer
   gates the gate-verb anyway, so this is defense-in-depth, not the primary
   lock, but it keeps the promoted-rule pass honest.)

`stripCliArgvPayload` and `stripDataCommandQuotes` roles are also folded into
this branch: blank `quotedDataArgs` of loop-CLI segments (`node .../loop.mjs
<tool> '<json>'`) and of data-verbs (`grep`/`jq`/...). All blanking is on
`quotedDataArgs` (tokens), not regex-blanked raw text.

**Soundness (corrected):** the inert-sink list removes friction only. The
no-bypass lock is the verb layer (gate-verb + indirection) for executor shapes
AND the redirect/exec withholds (this phase) for persisted-prose + trusted-verb
shapes. A misconfigured inert-sink list opens no bypass as long as BOTH locks
hold — assert with a test where the inert sink is legitimately inert (`cat`)
but a redirect + trusted verb is present (red-team #3's falsifying case).

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/patterns.json` (add `inert-sinks`).
- Modify: `tools/learning-loop-mastra/core/gate-logic.js` (`applyPromotedRules` inert-sink branch on the shim).
- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-inert-sink.test.js`.

## Implementation Steps (TDD)

1. **Write inert-sink tests first** (`gate-logic-inert-sink.test.js`):
   - Group A (friction -> ok): finding 1 `printf '%s\n' '{"x":"pnpm test run | tail"}' | node .../bash-gate.js`;
     finding 2 `pnpm test:one foo.test.js 2>&1 | tail`; `echo "label with | token" | grep x`.
   - Group B (no-bypass lock — executor): `echo "docker run evil" | bash` escalates
     (verb layer gates `bash`); `printf '%s\n' 'evil' | bash` escalates (target is a gate-verb).
   - Group C (no-bypass lock — persisted-prose + trusted verb, red-team #3):
     `echo "vitest run | tail" > /tmp/x && pnpm run /tmp/x` escalates (echo
     segment has `hasRedirect` -> withhold); `echo "banned" &> f && pnpm run f`
     escalates; `exec > /tmp/x ; echo "banned" ; pnpm run /tmp/x` escalates
     (`containsExec` -> global withhold); `echo "x" | cat > /tmp/y && pnpm run
     /tmp/y` escalates (inert sink `cat` WITH a redirect -> withhold; this is
     the falsifying case for the original "verb layer alone is the lock" claim).
   - Group D (inert-sink misconfig safety): if `bash` were *accidentally* added
     to `inert-sinks`, `printf evil | bash` still escalates because the verb
     layer gates `bash` independently AND the executor-pipe withhold blocks
     blanking across a gate-verb pipe.
   - Group E (data on the *executable* side stays visible): `bash -c "vitest run | tail"` escalates (gate-verb + executed body, not inert-sink-protected).
2. Run tests -> fail.
3. Add `inert-sinks` to `patterns.json` (conservative list; NO awk/sed).
4. Implement the inert-sink branch in `applyPromotedRules` on the policy view:
   blank `quotedDataArgs` of a segment whose `pipeTarget` is an inert sink,
   applying the three withholds (redirect, exec, executor-pipe). ALSO fold in
   `stripCliArgvPayload` (loop-CLI segment) and `stripDataCommandQuotes`
   (data-verb segment) blanking as the same token-level operation. Remove
   `stripEchoProseSafe` from the per-segment pass (it is now replaced; it
   becomes dead code — deleted in Phase 5). Keep the full-command pass
   consistent (it uses `stripEchoProse` blanket today; replace with the same
   token-blanking via the policy view).
5. Re-run -> green. Run the existing echo-prose / cli-argv / data-command-quotes
   suites — they must stay green (their invariants are now satisfied by the
   inert-sink branch + verb layer + withholds; if any test asserted the *old
   mechanism* rather than the *outcome*, port it to assert the outcome, EXCEPT
   the limitation-locking test in Phase 5 step 2).
6. Confirm `stripEchoProseSafe`/`stripEchoProse` are no longer referenced in
   `applyPromotedRules` (dead); leave deletion to Phase 5.

## Success Criteria

- [ ] Findings 1 & 2 return `ok` via configured inert-sinks.
- [ ] `echo "docker run evil" | bash` and `printf evil | bash` still escalate.
- [ ] Persisted-prose + trusted-verb shapes (Group C, including `cat` + redirect) escalate — the redirect/exec withholds hold.
- [ ] A misconfigured inert-sink list opens NO bypass (both locks asserted).
- [ ] `inert-sinks` is config; awk/sed held out; the dual-role non-decision is documented.
- [ ] `stripEchoProseSafe`/`stripEchoProse` no longer referenced in `applyPromotedRules` (dead, deleted in Phase 5).
- [ ] Existing echo-prose/cli-argv/data-command-quotes suites green (outcome-asserted).

## Risk Assessment

- **Inert-sink list grows unbounded over time.** Mitigation: it is
  operator-owned config; each addition is a recorded decision (change-log).
  Bounded by the verb-layer + withhold locks.
- **awk/sed dual role.** Mitigation: held out of inert-sinks entirely; no
  bypass. A later friction fix is a separate recorded decision.
- **A withhold is missed and a persisted-prose shape regresses.** Mitigation:
  Group C tests assert each withhold with a trusted-verb executor (`pnpm run`),
  not `bash` — the exact falsifying class red-team identified.
- **Test asserts old mechanism, not outcome.** Mitigation: port to outcome
  assertions; never weaken an invariant — if an old test caught a real bypass,
  it stays.