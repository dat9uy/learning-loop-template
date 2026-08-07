---
title: "echo/printf prose pipe-target-aware relaxation"
description: "Resolve the locked echo/printf prose false-positive in the bash gate's promoted-rule PER-SEGMENT pass. `printf '%s\\n' '<json>'` and `echo \"<prose>\"` are DATA — banned promoted-rule tokens inside them cannot execute. The existing full-command-pass stripEchoProse already blanks echo prose; the per-segment pass does not, so it matches `|`-inside-quoted-echo-data first and false-escalates. Fix (Option A, red-team-corrected): in the per-segment pass, blank echo/printf quoted args ONLY when the segment has no redirect and is not followed by a single real `|`-pipe (`||`/`&&`/`;`/`&`/end are NOT pipes → blank). KEEP the full-command blanket stripEchoProse unchanged. No inert-set, no chain-walk — opens NO bypass. Resolves meta-260807T065133Z-6d1973a8 (if its events had no trailing redirect); relaxes the locked limitation at gate-logic-data-command-quotes.test.js:88."
status: completed
priority: P1
effort: "0.75d"
tags: [gate-logic, bash-gate, echo-prose, no-bypass, tdd]
created: 2026-08-07
---

# echo/printf prose pipe-target-aware relaxation

## Overview

The bash gate's promoted-rule pass (`applyPromotedRules` in `core/gate-logic.js`)
evaluates each regex rule against the command string in two passes: a
**per-segment pass** (primary) and a **full-command pass** (superset, for
patterns spanning delimiters). `rule-no-raw-stdout-vitest`
(`(vitest run|pnpm test\b).*\| *(tail|head|grep)\b`) and
`rule-no-new-artifact-types` both false-escalate when a banned token lives
**inside a quoted argument of an echo/printf command** — inert printed prose,
not an executable shell command.

The gate already has `stripEchoProse`, applied in the **full-command pass**,
which blanks echo/printf quoted args (so `echo "pnpm test label" | tail` → ok
today). But the **per-segment pass** does NOT strip echo/printf prose. So a
single segment like `printf '%s\n' '{"…pnpm test run…|…tail…"}'` — where the
`|` lives INSIDE the quoted JSON (data, not a real pipe) — matches the regex in
the per-segment pass and escalates before the full-command pass can blank it.
This is the "locked echo limitation" (`gate-logic-data-command-quotes.test.js:88`).

The recurrence finding `meta-260807T065133Z-6d1973a8` (3 events at
`gate-decision.log` lines 1186-1188, ts 06:41:39-06:41:41) is this exact class:
`printf '%s\n' '{"tool_name":"Bash","tool_input":{"command":"…pnpm test run…"}}'`
— the agent writing/printing a JSON repro script — false-escalated
`rule-no-raw-stdout-vitest`. The `|` triggering the rule is inside the
single-quoted JSON (data).

The prior plan `260807-1401-bash-gate-cli-argv-payload-strip` resolved the
**distinct** sibling class (loop.mjs inline-JSON argv via `stripCliArgvPayload`)
and **explicitly deferred** this one. **This is that follow-up plan.**

## Why the limitation was locked (the bypass the fix must not open)

Blanking echo/printf prose unconditionally would open a real bypass:

```
echo "docker run evil" | bash
```

If echo prose were blanked, the gate would see `echo "" | bash` — no `docker`
visible — and return `ok`. But `bash` reads the echoed string from stdin and
**executes it**.

**Red-team correction (critical):** the prior draft claimed `matchConstraintPattern`
(the first-class `docker`/`sudo` constraint pass) "already catches
`echo "docker" | bash`", so the relaxation's blast radius was bounded. That is
**true for `docker`/`sudo`** (which have constraint patterns) but **FALSE for
promoted-rule-only tokens** — `vitest run | tail`, `pnpm test | tail`,
`create new convention` have **NO constraint pattern** (`patterns.json` defines
only `docker`, `sudo`, `package-manager`, `vendor-api`, `side-effect-import`).
For those, `applyPromotedRules` is the **only** gate; there is no backstop.
Therefore the per-segment relaxation **must be conservative enough to open no
bypass on its own** — it cannot rely on a constraint backstop that does not
exist for the affected rules.

The relaxation is still scoped to `applyPromotedRules` (the surface the finding
lives on); `matchConstraintPattern` is left untouched so the first-class
security boundaries (`docker`/`sudo`) stay maximally conservative.

## Threat model (Option A — minimal, no-bypass)

The blanking decision for an echo/printf segment reduces to: **is the segment's
printed output routed to a place that could execute it?** Two routes exist:

1. **A real `|` pipe** to a downstream segment (which could be `bash`/`sh`/etc.)
   → the output may be executed → **preserve** the prose (keep tokens visible).
2. **A redirect** (`>`/`>>`/`<` outside quotes) → the output is **persisted** to
   a file, which a sibling segment can later execute (`echo "banned" > f &&
   bash f`) → **preserve**.

If NEITHER is present, the output goes only to the terminal (stdout) and cannot
execute → **blank** the quoted args (inert data).

**Logical operators are not pipes.** `||`, `&&`, `;`, `&` do NOT route echo's
stdout to the next segment (`echo "X" && bash` runs `bash` with its OWN stdin,
not echo's output; `echo "X" || bash` likewise). So these terminators →
**blank** (subject to the redirect check). `splitKeepingDelims` emits `||`/`&&`
as two single-char delimiter tokens with an empty segment between; the
implementation must recognize a single `|` (real pipe) vs `||` (logical-OR).

**Quote-kind awareness** (reuses `blankInertQuoted`): single-quoted regions are
always inert (POSIX: no expansion) → blanked. Double-quoted regions are blanked
only when free of `$(`/backtick — `"$(pnpm test | tail)"` is shell-expanded
before echo runs, so it IS real and stays visible. Unquoted echo args are NOT
blanked (pre-existing behavior; `echo $(docker run)` is real expansion —
accepted limitation, locked by a test).

**No inert-sink allowlist, no forward-chain walk.** The prior draft proposed
classifying downstream pipe targets as inert/exec and walking the `|`-chain.
Red-team showed that is both unsound (`tee`/`dd`/`cat` persist; the exec-sink
long tail is unbounded) and unnecessary: preserving on ANY real `|` (regardless
of target) is strictly conservative and still resolves the finding, because the
finding's `|` is inside the quoted data, not a real pipe. KISS/YAGNI: drop the
machinery.

## What this plan resolves vs. leaves open

- **Resolves (if no redirect):** `meta-260807T065133Z-6d1973a8`. After the fix,
  `printf '%s\n' '<json with | inside>'` (no redirect, no real pipe) → blanked →
  ok; the recurrence key `rule-no-raw-stdout-vitest::386a95d8135a1e79` stops
  firing. **Residual risk:** the 3 events' `command_prefix` is truncated in
  `gate-decision.log` (no full `command` field stored), so a trailing `>
  /tmp/x` redirect cannot be confirmed or ruled out. If the events had a
  redirect, Option A **preserves** them (no bypass) and the finding **stays
  open** with updated evidence — the false positive persists but no bypass
  opens. The "echo/printf prose class" classification (prior plan,
  hash-confirmed to the printf prefix) implies no executing pipe target; a
  redirect-to-file-for-inspection is the only plausible redirect and is
  addressed by Option A's preserve-on-redirect (conservative).
- **Relaxes (correctly):** the locked single-segment echo limitation for ALL
  promoted regex rules. `echo "pnpm test | grep"` (`|` inside quotes, no real
  pipe) → ok; `echo "create new convention"` → ok (printing ≠ creating). The
  three locked-limitation tests flip from `escalate` → `ok` (their `rule_id`
  assertions removed).
- **Already handled (no change):** the real-pipe-to-inert-read-only case
  (`echo "pnpm test label" | tail` → ok) is already blanked by the existing
  full-command-pass `stripEchoProse`, which this plan does NOT touch. Option A
  does not extend that — it only fixes the per-segment pass.
- **Leaves open (out of scope):** the heredoc limitation (`cat > f << 'EOF' …`,
  `gate-decision.log` line 1189) — a different stripping mechanism. Unquoted
  echo args (`echo docker run evil`) remain visible — accepted pre-existing
  limitation. `matchConstraintPattern` echo handling is deliberately untouched.

## Sibling findings — corrected (red-team)

The prior draft's sibling analysis was wrong. Corrected handling (Phase 3
inspects each, does not assert):

- **`meta-260716T2220Z-…-full-command-second-pass`:** NOT an echo-prose
  finding — it is a **resolved** grep/jq-quoted-pattern finding (resolved by
  `stripDataCommandQuotes`). **Dropped** from this plan's sibling list.
- **`meta-260801T1549Z-…-echo-prose-token`:** **already `resolved`** via the
  full-command-pass `stripEchoProse`. Phase 3 verifies the new per-segment
  behavior is **consistent** with that prior resolution (the mechanism now also
  fires per-segment for no-pipe shapes); patches the resolution text if needed.
  Does NOT re-resolve from scratch.
- **`meta-260807T054940Z-92fb5b00` and `meta-202608040535131Z-a5a14e16`:** do
  **NOT** "share the fingerprint" with the primary finding — they have three
  DISTINCT `recurrence_key`s (`386a95d8135a1e79` vs `424bbd5fa3489dbc` vs
  `a52c972d904c2221`). `meta_state_refresh_file_index` re-grounds by cited
  **path** (`gate-logic.js`), not by recurrence shape. `92fb5b00` is plausibly a
  **real pipe** (`pnpm test:one … 2>&1 | head`, per its sibling resolution
  `meta-260807T054940Z-cbab4a3d`), which this relaxation does NOT resolve. Phase
  3 shape-verifies each; if real-pipe, notes "untouched, not an echo-prose
  shape" and leaves open.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `printf '%s\n' '<json with \| inside>'` (finding shape, no redirect, no real pipe) → `ok`; recurrence stops | P1 |
| 2 | `echo "<prose with banned token>"` single segment (`\|` inside quotes), no redirect, no real pipe → `ok` (locked limitation relaxed for all promoted regex rules) | P1 |
| 3 | `echo "banned" > f && bash f` (redirect) → `escalate`; `echo "banned" \| bash` (real pipe) → `escalate`; `echo "banned" \|\| bash` / `&& bash` / `; bash` (logical-op, no redirect) → `ok` (no bypass — echo stdout does not flow to bash) — NO new bypass, no backstop relied on | P1 |
| 4 | Real violations preserved: `vitest run \| tail` (case 6), `bash -c "vitest run \| tail"`, case 4d sibling real pipe, case 7 `"$(pnpm test \| tail)"` loop CLI double-quote → all `escalate` | P1 |
| 5 | `echo $(docker run)` unquoted `$()` → `escalate` (real expansion; unquoted-arg limitation locked) | P1 |
| 6 | Existing full-command-pass relaxation preserved: `echo "pnpm test label" \| tail` → `ok` (full-command `stripEchoProse` unchanged); `matchConstraintPattern` unchanged; full suite + `runtime-agnostic.test.js` green | P1 |
| 7 | `meta-260807T065133Z-6d1973a8` resolved (if no redirect) or patched-with-evidence (if redirect); sibling findings shape-verified, not asserted | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: TDD red — Option A echo/printf regression tests](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Implement per-segment safe echo/printf blank and wire](./phase-02-implement-stripechoprosesafe-and-wire-both-match-passes.md) | Completed |
| 3 | [Phase 3: Verify suite, resolve and patch meta-state findings](./phase-03-verify-suite-resolve-and-patch-meta-state-findings.md) | Completed |

## Implementation Log — 2026-08-07

Four corrections to the plan's design spec were required during implementation.
Three were found by adversarial probing and one by the mandatory code-review
subagent; each closed a bypass the plan's literal spec would have shipped. All
four were confirmed against HEAD by differential testing, so "introduced by this
diff" vs "pre-existing" is established rather than assumed.

### 1. `followedByRealPipe` — `||` needs an empty-segment check (Critical)

The plan specified: `parts[i+1] === "|"` AND `parts[i+3] === "|"` → treat as
`||` → blank. That shape is also produced by a pipe CHAIN: `echo "banned" | cat
| bash` splits to `[echo…, "|", " cat ", "|", " bash"]`. The literal rule would
have classified it as logical-OR, blanked the prose, and reopened the exec-sink
bypass the plan's Risk #1 exists to prevent.

Implemented rule additionally requires the segment between the two `|` tokens to
be empty (`parts[i+2].trim() === ""`), which is what genuine `||` produces.
Locked by the `| cat | bash` test.

### 2. `segmentHasRedirect` — `&>` splits across the tokenizer (Critical)

`walkQuoteState` treats `&` as a delimiter, so in `echo "banned" &> /tmp/x &&
bash /tmp/x` the `>` opens the NEXT part and an in-segment-only scan never sees
it. Verified as a live bypass (returned `ok`). `segmentHasRedirect` now also
returns true when the following delimiter is `&` and the next part starts with
`>`, covering `&>` and `&>>`. Locked by tests for both forms.

### 3. `exec` invalidates per-segment reasoning (Critical)

`exec > /tmp/x ; echo "banned" ; bash /tmp/x` persists the prose without the
echo segment carrying any redirect of its own. Confirmed introduced by this
change (HEAD escalated, branch returned `ok`). Any `exec` segment now disables
blanking for the whole command — reading fd state is unbounded, so the
conservative over-approximation is the correct call. Locked by two tests.

### 4. `printf -v VAR` assigns instead of printing (High — found by code review)

The plan's threat model rests on "echo/printf output goes to the terminal unless
piped or redirected". `printf -v VAR fmt args` does neither: it writes the
formatted result into a shell variable, which a later segment executes —
`printf -v x "%s" "<banned>" && sh -c "${x}"`. Six variants confirmed as
regressions introduced by this diff (HEAD escalated, branch returned `ok`),
including the attached `-vx` form and `eval`/`bash -c`/`bash <<<` sinks.

`stripEchoProseSafe` now skips any `printf` segment carrying a `-v` flag. The
flag is detected after `blankAllQuoted`, so genuine prose containing a quoted
`"-v"` still relaxes. Locked by seven tests using the live rule pattern.

### Goal 1 / Criterion 5 outcome: finding NOT resolved (patched instead)

The plan treated the 3 recurrence events' tails as permanently unknowable
(decision-log `command_prefix` truncates at ~120 chars; `recurrence_key` hashes
only the first 50 via `normalizePrefix`). They were recoverable from the
originating session transcript. All three are:

```
printf '%s\n' '<json tool_input>' | node tools/learning-loop-mastra/hooks/universal/bash-gate.js; echo "---exit=$?---"
```

A **real pipe**, not a redirect. Option A preserves prose on any real pipe, so
these events correctly still escalate — verified empirically (actual →
`escalate`; identical payload with the trailing pipe removed → `ok`). Per the
validated decision rule (Validation Session 1, Q1: resolve-or-patch-with-evidence),
`meta-260807T065133Z-6d1973a8` was **patched with the recovered shape and left
open**, not resolved. The residual false positive is now documented with
certainty rather than hedged; its only known fix is pipe-target classification,
which the red team rejected as unsound.

Goals 2-6 are met and verified. Siblings `meta-260807T054940Z-92fb5b00`
(`pnpm test:one … 2>&1 |`) and `meta-202608040535131Z-a5a14e16` (`pnpm exec
vitest run …`) were shape-verified as real test invocations, not echo prose;
both patched and left open. `meta-260801T1549Z-…` confirmed already `resolved`;
not re-resolved. `meta-260716T2220Z` dropped as the resolved grep/jq class.

### New finding filed

`meta-260807T1538Z-pre-existing-not-introduced-by-the-echo-prose-relaxation-pro`
— promoted-rule regexes match raw shell text, so a banned token composed from
pieces is never seen. Three confirmed shapes, one root cause: adjacent-quote
concatenation (`echo "widgetctl"" run evil" | bash`), printf format/argument
split, and cross-segment composition through a shell variable. All verified
identical on HEAD and on this branch, so they are pre-existing and orthogonal;
filed rather than fixed here. Full dataflow through shell variables is out of
reach for a regex gate and is recorded as a bounded limitation.

## Success Criteria

- [ ] New regression test file proves: finding-shape `printf '%s\n' '<json | inside>'` → `ok`; `echo "pnpm test \| grep"` (`\|` inside quotes) → `ok`; `echo "create new convention"` → `ok`; `echo "banned" > f && bash f` → `escalate`; `echo "vitest run \| tail" \| bash` → `escalate` (real VITEST_RULE, not synthetic); `echo "banned" \|\| bash` / `&& bash` / `; bash` → `ok`; `echo "pnpm test label" \| tail` → `ok` (existing relaxation preserved); `echo $(docker run)` → `escalate`.
- [ ] The three locked-limitation tests flipped `escalate`→`ok` with `rule_id` assertions REMOVED: `gate-logic-data-command-quotes.test.js:88`, `gate-logic-cli-argv-payload.test.js:103` (case 5), `gate-promoted-rules.test.js:404` (rule-no-new-artifact-types echo test).
- [ ] All prior real-violation / no-bypass regression tests stay green: cases 1/4d/6/7, `bash -c` body, spoofed-recognition negatives, `gate-logic-quoted-strings`, `gate-promoted-rules`, `cli-bash-gate-guard` (full path `tools/learning-loop-mastra/__tests__/cli-bash-gate-guard.test.js` — NOT in `legacy-mcp/`), `bash-gate-decision-visibility` (unquoted `echo test-escalate-token` still escalates), AND the three existing echo-prose tests at `gate-logic-data-command-quotes.test.js:131-149` (`echo "pnpm test label" \| tail -5` → ok, `printf "vitest run output" \| grep PASS` → ok — these constrain the full-command pass to keep working).
- [ ] Per-segment pass blanks echo/printf quoted args only when (no redirect) AND (not followed by a single real `|`); `||`/`&&`/`;`/`&`/end → blank. Full-command pass `stripEchoProse` UNCHANGED; `matchConstraintPattern` UNCHANGED.
- [ ] `pnpm test` exit 0; `runtime-agnostic.test.js` green (gate-logic is universal-hook core shared by 3 runtimes).
- [ ] `meta_state_resolve` succeeds for `meta-260807T065133Z-6d1973a8` (if shape has no redirect) OR `meta_state_patch` updates it with verified shape evidence (if redirect → stays open); `meta_state_refresh_file_index({path:'tools/learning-loop-mastra/core/gate-logic.js'})` re-grounds the cited path; sibling findings shape-verified per the corrected analysis.

## Risk Assessment

- **`echo "banned" | bash` bypass (Critical):** blanking on a real pipe would reopen it. Mitigated by Option A: ANY single real `|` after the echo/printf segment → preserve. Locked by `echo "vitest run | tail" | bash` → escalate (real VITEST_RULE).
- **Redirect-persistence bypass (Critical):** `echo "banned" > f && bash f`. Mitigated by Option A: redirect operator (`>`/`>>`/`<` outside quotes) in the echo/printf segment → preserve. Locked by `echo "banned" > f && bash f` → escalate. (This is the case the prior draft's inert-set design missed — red-team Critical.)
- **`||`/`&&` misread as a pipe (High):** `splitKeepingDelims` emits `||`/`&&` as two delimiter tokens with an empty segment between. A naive "next delim is `|`" check would treat `||` as a pipe → over-preserve (false positive, not a bypass). Mitigated by recognizing `||`/`&&` as logical operators (not pipes) → blank; locked by `echo "X" || bash` / `&& bash` → ok tests.
- **No constraint backstop for promoted rules (High):** `vitest`/`artifact` have no `matchConstraintPattern` entry. Mitigated by Option A being no-bypass on its own (preserve on redirect or real pipe); the plan does NOT rely on a constraint backstop. Documented.
- **Residual: finding events may have had a redirect (Medium):** logs are truncated; unconfirmable. If so, Option A preserves → finding stays open (no bypass). Acceptable: no bypass opens either way; Phase 3 patches the finding with the verified shape rather than asserting it resolved.
- **Unquoted `$()` expansion (Medium):** `echo $(docker run)` is real. Unquoted args are not blanked (pre-existing). Locked by a test; documented as accepted limitation.
- **Blast radius (Medium):** `gate-logic.js` is universal-hook core shared by 3 runtimes. Full suite + `runtime-agnostic.test.js` mandatory in Phase 3; `matchConstraintPattern` and the full-command `stripEchoProse` untouched to limit blast radius.
- **Recurrence re-admit via archive (Low):** archiving the resolved finding re-admits its `recurrence_key`; the 3 historical decision-log entries (append-only) would re-file at next SessionStart. Mitigated by a do-not-archive note (Phase 3): `resolved` is the terminal state for this finding.

## Red Team Review

### Session — 2026-08-07
**Findings:** 21 (all accepted; 1 design-revision absorbed as Option A)
**Severity breakdown:** 2 Critical, 6 High, 8 Medium, 5 Low
**Reviewers:** Security Adversary, Failure Mode Analyst, Assumption Destroyer (Standard tier: Fact Checker + Contract Verifier)

The red-team overturned the prior draft's core design (inert-set + forward-chain-walk → Critical persistence bypass with no backstop for promoted-rule-only tokens). The user selected **Option A** (minimal/no-bypass), which absorbs the Critical/High findings by dropping the inert-set machinery entirely and preserving on redirect-or-real-pipe. Sibling-finding analysis corrected; missing tests added; paths fixed.

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Redirect/inert-sink persistence bypass (`echo "banned" > f && bash f`, `\| tee f && bash f`) | Critical | Accept | plan.md threat model + Phase 2 (Option A: preserve on redirect/real-pipe) |
| 2 | `matchConstraintPattern` backstop claim false for promoted-rule-only tokens | Critical | Accept | plan.md "Why locked" + Risk (no-backstop acknowledged) |
| 3 | `&&`/`\|\|` asymmetric/Unhandled | High | Accept | plan.md threat model + Phase 1 tests + Phase 2 |
| 4 | Phase 2 cited a `;`-separated test absent from Phase 1 | High | Accept | Phase 1 (added `;`/`&&`/\|\|` tests) |
| 5 | `meta-260716T2220Z` mischaracterized (resolved grep/jq, not echo prose) | High | Accept | plan.md siblings + Phase 3 (dropped) |
| 6 | `meta-260801T1549Z` already resolved; treated as open | High | Accept | plan.md siblings + Phase 3 (verify consistency, not re-resolve) |
| 7 | "share the fingerprint" claim false (distinct recurrence_keys; refresh is by path) | High | Accept | plan.md siblings + Phase 3 |
| 8 | `meta-260807T054940Z-92fb5b00` plausibly real pipe, not echo prose | High | Accept | plan.md siblings + Phase 3 (shape-verify, leave open if real pipe) |
| 9 | `tee`/`dd`/`cat` inert misclassification | Medium | Accept (moot) | Option A drops inert-set; preserve on ANY real `\|` |
| 10 | `cli-bash-gate-guard.test.js` path wrong (not in `legacy-mcp/`) | Medium | Accept | plan.md + Phase 2 (full path cited) |
| 11 | Group B must use real VITEST_RULE, not synthetic DOCKER_RULE | Medium | Accept | Phase 1 Group B |
| 12 | DRY duplication vs `blankQuotedArgsFor` | Medium | Accept (note) | Phase 2 (minimal duplication; simpler than chain-walk) |
| 13 | Inconsistent strip ordering between passes | Medium | Accept (note) | Phase 2 (full-command unchanged; ordering documented) |
| 14 | Scope creep: inert-set vs no-pipe primary finding | Medium | Accept | Option A drops inert-set (YAGNI) |
| 15 | Missing `sudo`-prefixed tests | Medium | Accept | Phase 1 (sudo-prefixed no-bypass locks) |
| 16 | Keep-green inventory omits 3 echo-prose tests (`gate-logic-data-command-quotes.test.js:131-149`) | Medium | Accept | plan.md success criteria + Phase 2 |
| 17 | Flipped tests' `rule_id` assertion must be removed | Low | Accept | Phase 1 step 6 |
| 18 | Phase 3 step 2 "empirical repro" redundant | Low | Accept | Phase 3 (dropped) |
| 19 | Archived-finding re-admit recurrence risk | Low | Accept | plan.md risk + Phase 3 (do-not-archive note) |
| 20 | `meta-202608040535131Z-a5a14e16` shape-verify independently | Medium | Accept | plan.md siblings + Phase 3 |
| 21 | Sibling-finding exact ids not yet resolved | Low | Accept | Phase 3 (resolve exact ids before acting) |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-start.md, phase-02-…, phase-03-…
- Decision deltas checked: 6 (inert-set dropped → Option A; backstop claim dropped; sibling-finding ids corrected; `\|\|`/`&&` = non-pipe; full-command stripEchoProse unchanged; cli-bash-gate-guard path fixed)
- Reconciled stale references: all references to "inert-sink allowlist", "forward-chain walk", "transitive chain", "share the fingerprint", and the prior `meta-260716T2220Z` sibling framing removed from plan.md and all phase files.
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-08-07
**Trigger:** Post-red-team `/ak:plan validate` on the rewritten Option A plan.
**Verification:** Skipped (per validate guard — `## Red Team Review` already contains Fact Checker + Contract Verifier evidence; no `[UNVERIFIED]` tags present).
**Questions asked:** 4

#### Questions & Answers

1. **[Risk]** The finding's 3 events have a truncated `command_prefix` (no full command stored), so a trailing `> redirect` cannot be confirmed. How should Phase 3 handle this before resolving `meta-260807T065133Z-6d1973a8`?
   - Options: Resolve-or-patch-with-evidence | Recover the full command first | Never resolve in this plan
   - **Answer:** Resolve-or-patch-with-evidence
   - **Rationale:** Avoids both premature resolve and indefinite deferral; no bypass opens either way; the finding is patched-with-evidence if a redirect can't be ruled out.

2. **[Architecture/Security]** Option A blanks echo prose when followed by `||`/`&&`/`;`/`&` (logical operators — bash runs with its own stdin, not echo's output). `echo "banned" || bash` → ok. Confirm acceptable, or preserve extra-conservatively?
   - Options: Blank on `||`/`&&` | Preserve on `||`/`&&` too
   - **Answer:** Blank on `||`/`&&`
   - **Rationale:** Correct no-bypass call; `||`/`&&` do not route echo stdout to the next segment; preserving would re-introduce the false positive.

3. **[Scope]** `gate-decision.log` line 1189 shows a heredoc false positive on the same rule in the same session. Fold heredoc into this plan or defer?
   - Options: Defer heredoc to a separate plan | Fold a heredoc-body strip into this plan
   - **Answer:** Defer heredoc to a separate plan
   - **Rationale:** Heredoc bodies are a different stripping mechanism (multi-line region, not a quoted arg); Option A stays scoped to echo/printf prose; a focused follow-up is cleaner and lower-risk.

4. **[Assumption/Scope]** Unquoted echo args (`echo docker run evil`) are NOT blanked by Option A (pre-existing; `echo $(docker run)` is real expansion). Accept as out-of-scope or extend?
   - Options: Accept unquoted limitation | Extend blanking to unquoted echo args
   - **Answer:** Accept unquoted limitation
   - **Rationale:** Blanking unquoted args risks the `$()`/backtick expansion threat; the finding's shape is quoted; unquoted stays visible (conservative, caught by first-class constraints for docker/sudo).

#### Confirmed Decisions
- Redirect uncertainty → resolve-or-patch-with-evidence (Phase 3 branches on visible prefix + recurrence shape).
- `||`/`&&`/`;`/`&` → blank (no bypass; locked by Phase 1 Group C tests).
- Heredoc → out of scope (deferred to a separate follow-up plan).
- Unquoted echo args → out of scope (accepted pre-existing limitation).

#### Action Items
- None — all 4 answers confirmed the plan's existing decisions; no plan or phase edits required.

#### Impact on Phases
- None — Phase 1/2/3 already reflect all confirmed decisions.

### Whole-Plan Consistency Sweep (post-validation)
- Files reread: plan.md, phase-01-start.md, phase-02-…, phase-03-…
- Decision deltas checked: 0 new (all 4 validation answers confirmed existing plan decisions)
- Reconciled stale references: 0
- Unresolved contradictions: 0 — plan is eligible for implementation (Verification Failed: 0).