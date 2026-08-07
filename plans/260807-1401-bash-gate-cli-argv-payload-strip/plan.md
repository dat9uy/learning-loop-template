---
title: "bash-gate CLI argv payload strip"
description: "Resolve rule-no-raw-stdout-vitest false-escalation on loop CLI invocations whose inline JSON argument (data, not a shell command) contains the banned test-pipe pattern. Resolves meta-260807T1347Z-...-cli-invocations-whose. Patches (does NOT resolve) meta-260807T065133Z-6d1973a8 with verified shape evidence — its 3 recurrence events are the echo/printf prose class, a different locked limitation."
status: pending
priority: P1
effort: "1.5d"
tags: [gate-logic, bash-gate, scope-drift, tdd]
created: 2026-08-07
---

# bash-gate CLI argv payload strip

## Overview

The bash gate's promoted-rule pass evaluates each rule's regex against the flat
`tool_input.command` string (`extractCommand` returns it unparsed). For
`node tools/learning-loop-mastra/bin/loop.mjs <tool> '<json>'` — the canonical
loop tool surface — the inline JSON argument is **user-supplied data**, not a
shell command. When that JSON contains the banned test-pipe pattern (e.g. a
`meta_state_resolve` payload describing a prior TDD loop), `rule-no-raw-stdout-vitest`'s
regex matches the data, the gate escalates, and the CLI call does not execute —
the blocker observed 2026-08-07 (gate-decision.log line 1185,
`LOOP_SURFACE=.claude GATE_ROOT=. node .../loop.mjs meta_state_resolve ...`)
that left a finding stuck at v0/open until it was re-issued with `--args-file`.

This is the same "payload-as-data" false-positive class the gate already closes
for `git -m` (`stripMessageFlags`), `node -e` (`stripNodeEvalBody`), and
`grep`/`rg`/`jq` patterns (`stripDataCommandQuotes`). The new surface is the
loop CLI's inline JSON argument. The fix adds a `stripCliArgvPayload` helper
that blanks the quoted JSON argument of a canonical `loop.mjs <tool> <quoted>`
segment, wired into the two `applyPromotedRules` match sites.

## What this plan resolves vs. patches (red-team-corrected scope)

The user's original premise was that `meta-260807T065133Z-6d1973a8` is the
recurrence of the CLI argv finding. **Red-team verification disproved this.**
The recurrence finding's 3 events (gate-decision.log lines 1186-1188,
ts 06:41:39-06:41:41) are `printf '%s\n' '<json tool_input>'` commands — the
agent writing a JSON repro script. Their `recurrence_key`
(`rule-no-raw-stdout-vitest::386a95d8135a1e79`) was hash-confirmed to correspond
to the `printf '%s\n' {tool_name:Bash,...` normalized prefix, NOT the
`node .../loop.mjs` prefix. So:

- **Resolves:** `meta-260807T1347Z-rule-no-raw-stdout-vitest-escalates-on-cli-invocations-whose`
  (the loop.mjs CLI inline-JSON-argv false-positive).
- **Patches (does NOT resolve):** `meta-260807T065133Z-6d1973a8` — `meta_state_patch`
  adds the verified shape evidence (3× `printf '<json>'` events = echo/printf
  prose class). It stays `open` because it is the **locked echo/printf prose
  limitation** (see Out of scope), a different false-positive class that
  `stripCliArgvPayload` does not touch.

## Root cause (verified empirically, not guessed)

Repro run 2026-08-07 against `applyPromotedRules` with the **live rule pattern**
`(vitest run|pnpm test\b).*\| *(tail|head|grep)\b` (meta-state v2,
`refined_by: operator` to close the `head` loophole):

| Case | Command (shape) | Today | Correct |
|------|-----------------|-------|---------|
| 1  | `pnpm test 2>&1 \| head -50` | escalate | escalate (real pipe to head) |
| 4  | `node .../loop.mjs meta_state_resolve "<json with pnpm test \| tail>"` | **escalate** | ok |
| 4b | `node .../loop.mjs meta_state_resolve '<json with pnpm test \| tail>'` | **escalate** | ok |
| 4c | `node .../loop.mjs meta_state_resolve --args-file /tmp/x.json` | ok | ok |
| 4d | `node .../loop.mjs meta_state_list '{}' ; pnpm test 2>&1 \| tail` | escalate | escalate (real pipe in sibling segment) |
| 5  | `echo "pnpm test \| grep foo"` | escalate | escalate (**locked echo limitation**) |
| 6  | `pnpm exec vitest run 2>&1 \| tail` | escalate | escalate (real violation) |
| 7  | `node .../loop.mjs meta_state_resolve "$(pnpm test 2>&1 \| tail)"` | escalate | escalate (`$(...)` IS executed by the shell — NOT data) |
| 3  | `node -e "console.log(pnpm test \| head)"` | ok | ok (already handled by `stripNodeEvalBody`) |

The bug is **case 4 / 4b**: the inline JSON argument (single- or double-quoted,
**and free of `$(...)`/backticks**) is data, but the regex sees it as part of the
command. **Case 7 is NOT a bug** — `"$(pnpm test | tail)"` is shell-expanded
before node runs, so it is a REAL violation and must stay `escalate`. This is
the critical bypass the fix must not open (red-team Finding 1).

## Out of scope (scope discipline + sibling findings)

This plan does NOT relax the echo/printf prose limitation. Red-team traced that
relaxing `stripEchoProse` into the per-segment pass opens a **real bypass**:
`echo "docker run evil" | bash` (echo prose blanked → gate sees no `docker` →
ok → bash executes the echoed string). Closing that safely needs pipe-target
awareness (only blank echo prose when the pipe target is read-only), a separate
threat-modeling exercise. Therefore:

- **Fix-shape (a)** from the original finding (extend per-segment strip chain to
  call `stripEchoProse`) is **rejected** — it would reverse the locked echo
  limitation (`gate-logic-data-command-quotes.test.js:88`,
  `echo "pnpm test foo | grep bar"` → escalate) AND open the `echo "X" | bash`
  bypass.
- **Case 3** (`node -e`) is already handled by `stripNodeEvalBody` — no change,
  regression-lock only. The rule's regex is correct and is NOT tightened.
- **Sibling scope-drift findings left open** (not addressed by
  `stripCliArgvPayload`, which matches only the canonical loop CLI segment):
  `meta-260716T2220Z-...-full-command-second-pass` (grep/jq quoted patterns) and
  `meta-260801T1549Z-...-echo-prose-token` (echo-prose + later real pipe). A
  follow-up plan should decide the echo/printf relaxation with pipe-target-aware
  threat modeling; that follow-up would also resolve `meta-260807T065133Z-6d1973a8`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Inline JSON argv of a canonical `loop.mjs <tool> <quoted>` segment no longer false-escalates `rule-no-raw-stdout-vitest` (cases 4/4b → ok) | P1 |
| 2 | `$(...)`/backtick double-quoted args stay `escalate` (case 7) — no new bypass | P1 |
| 3 | Real pipes in sibling segments stay enforceable (case 4d → escalate); locked echo limitation preserved (case 5 → escalate); real violations preserved (case 6 → escalate) | P1 |
| 4 | `meta-260807T1347Z` resolved via `meta_state_resolve`; `meta-260807T065133Z-6d1973a8` patched with verified shape evidence (stays open) | P1 |
| 5 | Bypass-free: loop.mjs JSON argv is data (cannot exec except via `$(...)`, which the quote-kind-aware blanking preserves); guarded by a static check that no CLI handler execs argv-derived input | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: TDD red — CLI argv payload regression tests](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Implement stripCliArgvPayload and wire match sites](./phase-02-implement-stripcliargvpayload-and-wire-match-sites.md) | Pending |
| 3 | [Phase 3: Verify suite, resolve finding, patch recurrence](./phase-03-verify-suite-and-resolve-meta-state-findings.md) | Pending |

## Success Criteria

- [ ] New regression test file proves cases 4/4b → `ok`, case 7 → `escalate`, cases 1/4d/5/6 → `escalate`, case 3 → `ok` (lock); negative recognition cases (non-canonical `loop.mjs`, trailing-token spoof) → `escalate`
- [ ] `stripCliArgvPayload` wired into the two `applyPromotedRules` sites only (NOT `matchConstraintPattern`); recognition anchored to the canonical script-path token; verb normalized (`node`/`nodejs`/basename-`node`)
- [ ] Quote-kind-aware blanking: single-quoted always blanked; double-quoted blanked only if free of `$(`/backtick
- [ ] Static guard test: no `CLI_TOOLS` handler imports `child_process` or calls `execSync`/`spawnSync` with argv-derived input
- [ ] `gate-logic-quoted-strings.test.js`, `gate-logic-data-command-quotes.test.js`, `gate-promoted-rules.test.js`, `cli-bash-gate-guard.test.js` stay green
- [ ] `pnpm test` exit 0; `runtime-agnostic.test.js` green (gate-logic is universal-hook core shared across 3 runtimes)
- [ ] `meta_state_resolve` succeeds for `meta-260807T1347Z` (resolve payload contains the trigger phrase so the inline-JSON path is exercised)
- [ ] `meta_state_patch` adds verified shape evidence to `meta-260807T065133Z-6d1973a8`; it stays `open`
- [ ] `meta_state_refresh_file_index` blast radius acknowledged; sibling findings' evidence lines re-checked

## Risk Assessment

- **`$(...)` bypass (Critical):** double-quoted args containing `$(pnpm test | tail)`
  are real executions. Mitigated by quote-kind-aware blanking (single-quoted
  always; double-quoted only without `$(`/backtick). Locked by the case-7 test.
- **Over-stripping / spoofed recognition:** mitigated by anchoring recognition to
  the canonical script-path token (positional, after `node` + env-assigns + one
  prefix), not `/loop\.mjs\b/` anywhere. Locked by mandatory negative tests
  (non-canonical `./loop.mjs`, trailing `loop.mjs` token → escalate).
- **Reversing the echo limitation:** explicitly out of scope; case-5 test guards it.
- **Blast radius:** `gate-logic.js` is universal-hook core shared by all three
  runtimes. Full suite + `runtime-agnostic.test.js` mandatory in Phase 3.
- **`meta_state_refresh_file_index` amplified blast radius:** a single refresh
  re-grounds every `mechanism_check:true` finding citing `gate-logic.js`,
  including the two open sibling findings. Acknowledged in Phase 3; their open
  status is unaffected and their evidence lines are re-checked manually.
- **Self-escalation on the resolving `meta_state_resolve`:** the fix removes that
  failure mode; Phase 3 verifies with a payload that contains the trigger phrase.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/gate-logic.js` (new `stripCliArgvPayload`, generalize `blankQuotedArgsFor` to a predicate + pluggable blanker, 2 wire sites)
- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-cli-argv-payload.test.js`
- Read-only anchors: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-data-command-quotes.test.js` (echo lock at line 88), `gate-logic-quoted-strings.test.js`, `gate-promoted-rules.test.js`, `tools/learning-loop-mastra/__tests__/cli-bash-gate-guard.test.js`, `tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js`
- Bypass-free grounding: `tools/learning-loop-mastra/bin/loop.mjs` (JSON.parse + zod dispatch, no exec of argv), `core/verification-runner.js` (`shell:false` + cmd allowlist), `tools/handlers/` (static guard test target)
- Meta-state (via loop CLI, never direct file I/O): `meta-260807T1347Z-...-cli-invocations-whose` (resolve), `meta-260807T065133Z-6d1973a8` (patch)

## Red Team Review

### Session — 2026-08-07
**Findings:** 20 raw / 13 unique accepted (7 rejected as dup/no-evidence)
**Severity breakdown:** 1 Critical, 5 High, 7 Medium
**Reviewers:** Security Adversary (Fact Checker), Failure Mode Analyst (Flow Tracer), Assumption Destroyer (Scope Auditor)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `$(...)`/backtick bypass in double-quoted args | Critical | Accept | Phase 1, 2 |
| 2 | Recognition `/loop\.mjs\b/` path/position-insensitive → spoof bypass | High | Accept | Phase 1, 2 |
| 3 | Phase 1 ESM missing-export hard-errors whole file | High | Accept | Phase 1 |
| 4 | Wiring `matchConstraintPattern` extends bypass to security constraints, no observed need | High | Accept | Phase 2 |
| 5 | Live rule pattern includes `head`; matrix misquoted | High | Accept | plan.md |
| 6 | Phase 3 self-escalation check vacuous (no trigger phrase) | Medium | Accept | Phase 3 |
| 7 | Verb misses `nodejs`/absolute `node` | Medium | Accept | Phase 2 |
| 8 | Echo lock cited to wrong test file | Medium | Accept | plan.md |
| 9 | `check_runtime_agnostic` is MCP-only, not CLI | Medium | Accept | Phase 3 |
| 10 | `meta_state_refresh_file_index` re-grounds open sibling findings | Medium | Accept | Phase 3 |
| 11 | Plan borrows "same family" framing but leaves siblings open | Medium | Accept | plan.md |
| 12 | DRY: generalize `blankQuotedArgsFor` to a predicate | Medium | Accept | Phase 2 |
| 13 | "Bypass-free" claim ungrounded; no guard test | Medium | Accept | plan.md, Phase 1 |
| 14 | "Same root cause" for 6d1973a8 is FALSE — verified printf-prose shape | High | Accept (scope change) | plan.md, Phase 3 |

### Whole-Plan Consistency Sweep
Applied 2026-08-07 after red-team edits. Re-read `plan.md` + all `phase-*.md`.
- "Resolve both findings" → corrected to "resolves meta-260807T1347Z; patches 6d1973a8 (stays open)" across Overview, Goals #4, Phase 3 title/steps/success, Success Criteria.
- Live rule pattern corrected to `(vitest run|pnpm test\b).*\| *(tail|head|grep)\b` in the matrix; case 1 re-derived to `escalate`; case 7 (`$(...)`) added.
- Echo-lock citation corrected to `gate-logic-data-command-quotes.test.js:88`.
- `matchConstraintPattern` wire removed from Phase 2; success criterion updated.
- Phase 1 restructured: no `stripCliArgvPayload` static import; negative recognition + `$(...)` cases added.
- Out-of-scope subsection names the two sibling finding ids.
- No unresolved contradictions remain.

<!-- slug: bash-gate-cli-argv-payload-strip -->