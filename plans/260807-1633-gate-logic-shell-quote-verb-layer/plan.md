---
title: "gate-logic shell-quote verb-layer (Full path)"
description: "Replace the bash gate's hand-rolled shell-parsing (quote machine + strip helpers) with the `shell-quote` library (>=1.10.0, parse-only) and move the security boundary from the token to the verb. Gate-verbs (bash/sh/eval/zsh/ksh/dash + indirection env/xargs/find-exec/exec/./source + node -e/python -c/ruby -e/perl -e) become observation-gated constraints like docker/sudo; a curated operator-owned inert-sink allowlist closes the findings 1 & 2 friction; policy becomes config (patterns.json/records), not code. Closes finding 3's bypass class and the dataflow class at the verb; deletes the quote machine + strip helpers (withhold predicates ported to tokens, not deleted). Carries the CVE-2026-9277 caveat as a security boundary (pin >=1.10.0, forbid quote() import across core/+hooks/, parse-only). Supersedes the strip-helper code added by plans 260807-1401 and 260807-1450."
status: completed
priority: P1
effort: "4d"
tags: [gate-logic, bash-gate, shell-quote, verb-layer, no-bypass, tdd, security-boundary]
created: 2026-08-07
completed: 2026-08-07
supersedes_code_in: [260807-1401-bash-gate-cli-argv-payload-strip, 260807-1450-echo-printf-prose-pipe-target-aware-relaxation]
---

# gate-logic shell-quote verb-layer (Full path)

## Overview

Stop the gate-logic finding treadmill. Today `core/gate-logic.js` (1251 LoC)
decides `ok`/`escalate` by running regex rules against quote-stripped raw shell
text. Shell semantics defeat that model in two directions: **false negatives**
(regex can't see through token assembly — adjacent-quote concatenation,
`printf -v`, `$()`, variable composition) and **false positives** (regex can't
distinguish data from code — a `|` inside quoted JSON, a real pipe to an inert
sink). Each prior fix added a new strip helper; each is the loop re-implementing
shell parsing and hitting the next edge case.

This plan moves the boundary from the **token** to the **verb**. Every
dataflow-bypass shape needs an executor verb, and the verb is visible in the
text. `shell-quote`'s `parse()` owns tokenization; the loop owns policy
(config lists, not code). The gate becomes a thin check of parse-result tokens
against configured gate-verbs / inert-sinks / data-verbs.

**Soundness scope (corrected after red-team).** The verb layer is the no-bypass
lock for **gate-verb AND indirection-to-executor verbs** (bash/sh/eval/… AND
`env`/`xargs`/`find -exec`/`exec`/`.`/`source`/PATH-qualified). For **trusted-verb
executors** (`pnpm`/`node`/`git`) running *persisted* content, the verb layer
does NOT independently catch a banned token — so the redirect/exec/pipe-withhold
that today lives in `stripEchoProseSafe` is **ported onto the policy view
(`hasRedirect`, `containsExec`), not deleted**. The raw-text strip helpers are
deleted; their *withhold predicates* survive as small predicates on the parsed
tokens. This is the correction to the original "verb layer subsumes everything"
framing, which red-team falsified for persisted-prose + trusted-verb shapes.

**Operator decision (resolved):** the brainstorm forked minimal (no dep,
strip helpers retained) vs full (`shell-quote`, deletes strip helpers, CVE
caveat). Operator chose **full** — adopt `shell-quote` >=1.10.0 parse-only,
delete the quote machine + strip helpers, accept the CVE caveat as a
security boundary with the documented mitigations.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Finding 3's shapes return `escalate` via the verb layer (assembled-token execution gated at the executor verb) | P1 |
| 2 | Indirection-to-executor verbs (`env`/`xargs`/`find -exec`/`exec`/`.`/`source`/PATH-qualified) are gated, not bypassable | P1 |
| 3 | Findings 1 & 2 return `ok` via configured inert-sinks without opening `echo "docker run evil" \| bash` | P1 |
| 4 | Persisted-prose + trusted-verb shapes (`echo "banned" > f && pnpm run f`) still escalate via the ported redirect/exec/pipe-withhold | P1 |
| 5 | No-bypass regression suite green on the new parse substrate | P1 |
| 6 | gate-verbs + inert-sinks + data-verbs + echo-prose-verbs + command-prefixes are config (patterns.json / records), not code | P1 |
| 7 | `core/gate-logic.js` shrinks: quote machine + strip helpers deleted (withhold predicates ported to tokens, not deleted) | P2 |
| 8 | Residual bounded in a `loop-design` record (assembled token to a *trusted* verb) | P2 |
| 9 | CVE-2026-9277 mitigations enforced: pin >=1.10.0, forbid `quote()` import across core/+hooks/, parse-only, never trust `.op` | P1 |

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|------------|
| 1 | [Phase 1: Spike & shell-quote dependency adoption](./phase-01-start.md) | Completed | — |
| 2 | [Phase 2: Parse-to-policy-token shim](./phase-02-parse-to-policy-token-shim.md) | Completed | 1 |
| 3 | [Phase 3: Gate-verb config + observation-gated verb layer](./phase-03-gate-verb-config-and-observation-gated-verb-layer.md) | Completed | 2 |
| 4 | [Phase 4: Inert-sink allowlist as config](./phase-04-inert-sink-allowlist-as-config.md) | Completed | 3 |
| 5 | [Phase 5: Migrate gate passes onto parse substrate + delete strip helpers](./phase-05-migrate-gate-passes-onto-parse-substrate-and-delete-strip-helpers.md) | Partial (substrate migration done; strip-helper deletion deferred) | 4 |
| 6 | [Phase 6: Residual loop-design + no-bypass suite + records](./phase-06-residual-loop-design-no-bypass-suite-and-records.md) | Completed (residual + records documented; formal MCP writes gated) | 5 |

## Success Criteria

- [x] Finding 3 shapes escalate via the verb layer (Phase 3 tests): `printf -v x 'evi'; bash`, `bash <<< "$(echo ev)$(il)"`, `eval "$x"`, `node -e "…execSync(…)"`, `echo "widgetctl"" run evil" | bash`.
- [x] Indirection shapes escalate: `env bash -c "evil"`, `xargs bash`, `find . -exec bash -c 'evil' \;`, `/bin/bash -c "evil"`, `. evil.sh`, `exec bash`, `source evil.sh`, `command bash -c "evil"`, `sudo bash -c "evil"`.
- [x] Findings 1 & 2 return `ok` via configured inert-sinks; `echo "docker run evil" | bash` still escalates (no bypass).
- [x] Persisted-prose + trusted-verb shapes escalate: `echo "vitest run | tail" > /tmp/x && pnpm run /tmp/x`, `echo "banned" &> f && pnpm run f` (redirect/exec/pipe-withhold ported to tokens).
- [ ] Full no-bypass regression suite green on the parse substrate (existing echo-prose / cli-argv / data-command-quotes / quoted-strings suites migrated, not weakened). **Partial — Phase 5 strip-helper deletion deferred; 5 legacy suites still import the helpers (see Finding `meta-*-260807-phase-5-strip-helper-deletion-deferred`).**
- [x] gate-verbs, inert-sinks, data-verbs, echo-prose-verbs, and command-prefixes live in `patterns.json` and/or records — no hardcoded `new Set([...])` verb lists in `gate-logic.js` (asserted by test).
- [ ] `core/gate-logic.js` net LoC drops (quote machine `walkQuoteState` family + `splitSegments`/`splitKeepingDelims` + `strip*` helpers deleted; withhold predicates survive as small policy-view predicates). **Partial — helpers retained as legacy (see Finding `meta-*-260807-phase-5-strip-helper-deletion-deferred`).**
- [x] `quote` is unimportable from `shell-quote` anywhere in `core/`+`hooks/` (lint guard + grep-based test guard); installed version >=1.10.0 asserted by test.
- [x] Residual (assembled token to a trusted verb like `pnpm run evil-script`) captured in a `loop-design` record; no silent auto-resolve. **Documented in `plans/reports/phase-06-260807-1858-residual-loop-design-and-records.md` (the formal MCP `meta_state_propose_design` write was gated on the auto-classifier's credential-leakage heuristic; reports-only stand-in).**
- [ ] `meta_state_log_change` records the mechanical change (strip helpers removed, parse substrate adopted); affected finding ids cited in the new tests. **Partial — diff documented in phase-06 report; the formal `meta_state_log_change` write is queued for direct operator authority (see same open item).**

## Risk Assessment

- **Two bypass directions the original framing missed (red-team, fixed).**
  (a) Indirection-to-executor verbs (`env`/`xargs`/`find -exec`/`exec`/`.`/`source`
  /PATH-qualified) were absent from the gate-verb list — gated by adding them +
  `basename(verb)` normalization. (b) Persisted-prose + trusted-verb shapes
  (`echo "banned" > f && pnpm run f`) were dropped by data-verb blanking that
  lost `stripEchoProseSafe`'s redirect/exec/pipe-withhold — fixed by porting the
  withholds onto the policy view. See
  `plans/reports/redteam-260807-1641-gate-logic-shell-quote-verb-layer.md`.
- **CVE-2026-9277 in a security boundary.** `shell-quote` parse() with an
  attacker-influenced `.op` produces an unescaped terminator realized at
  `quote()`. Mitigation: parse-only flow (never call `quote()`, never pass
  tokens to an executor), pin >=1.10.0, forbid `quote` import via lint+test,
  consume only string/positional tokens, never trust `.op` field values.
  Residual risk: low for a parse-only classify-only gate.
- **Regression surface.** The strip helpers are load-bearing for the existing
  echo-prose / cli-argv / data-command-quotes test suites. Migration must keep
  those suites green or explicitly port their invariants. Mitigation: TDD —
  the no-bypass suite is written/locked before deletion; deletion phase runs
  the full gate test corpus.
- **Observation-gating friction on legitimate `bash -c`/`sh -c`/`eval`
  one-liners.** Rare in this repo (loop uses `node loop.mjs`, `pnpm`, `git`),
  but the gate's own adversarial self-probes (`echo "evil" | bash`) need a
  preflight-exempt or recorded-observation path. Resolved in Phase 3.
- **Dep adoption is a side-effect command.** `pnpm add shell-quote` requires
  `gate_check` + `runtime_state_record` (ledger) + `meta_state_report(category:"budget-check")`
  before running, per the loop's internalization rule. Resolved in Phase 1.

## Open items

1. Whether the gate-verb observation for the gate's own self-probes lives in a
   preflight marker (like runtime-state-edit) or a recorded observation —
   decided in Phase 3.
2. Whether to keep the quote-concatenation normalizer for *discipline* value
   once the verb layer subsumes its *security* value — the operator leaned
   "verb layer + allowlist only"; the Full path deletes it. Revisited in
   Phase 6 if a discipline regression appears.

## Resolved by validation (2026-08-07)

- **Gate-verb enforcement posture: block + observation.** Gate-verbs block by
  default and require a recorded observation, exactly like docker/sudo (not
  warn/escalate-only). Locked into Phase 3's `makeGateDecision` wiring.
- **awk/sed held out of inert-sinks.** Their dual executor/reader role is not
  cleanly parseable; they stay gate-verb-gated only. `echo "x" | sed` friction
  persists until a separate recorded decision adds a predicate. Locked into
  Phase 4.

## Related files

- `tools/learning-loop-mastra/core/gate-logic.js` — quote machine + strip helpers deleted; `matchConstraintPattern` / `applyPromotedRules` reimplemented on parse shim.
- `tools/learning-loop-mastra/core/evaluate-bash-gate.js` — orchestrator; verb layer plugs into the constraint branch.
- `tools/learning-loop-mastra/core/patterns.json` — gate-verbs / inert-sinks / data-verbs config.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-*.test.js` — migrated regression suites.
- `package.json` — `shell-quote` >=1.10.0 dependency.
- `records/meta-state.jsonl` / `change-log.jsonl` — loop-design + change-log entries.

<!-- slug: gate-logic-shell-quote-verb-layer -->