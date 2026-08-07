---
phase: 1
title: "TDD red — Option A echo/printf regression tests"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: TDD red — Option A echo/printf regression tests

## Overview

Write the failing regression tests FIRST. They pin the Option A behavior:
blank echo/printf quoted args in the per-segment pass ONLY when the segment has
no redirect and is not followed by a single real `|`-pipe. Bypass shapes
(redirect, real pipe) → `escalate`; logical-op shapes (`||`/`&&`/`;`/`&`) →
`ok`; real violations preserved. All relaxation tests RED against today's
per-segment pass (which does not strip echo prose).

## Requirements

- Functional: a new test file asserts the Option A matrix; the three
  locked-limitation tests are flipped in-place (with `rule_id` assertions
  REMOVED).
- Non-functional: tests use the LIVE rule patterns and the public
  `applyPromotedRules` surface; the bypass tests cover redirect, real-pipe (with
  the real VITEST_RULE), and logical-op shapes; `sudo`-prefixed no-bypass locks
  included.

## Architecture

New file `__tests__/legacy-mcp/gate-logic-echo-prose-pipe-target.test.js`,
structured like `gate-logic-cli-argv-payload.test.js`: a `VITEST_RULE` fixture
(pattern `(vitest run|pnpm test\b).*\| *(tail|head|grep)\b`), an `ARTIFACT_RULE`
fixture (pattern
`(propose|design|create)\s+(a|an|new|separate|own|the)?\s*(schema|artifact|directory|convention)|new\s+(schema|artifact|directory|convention)`),
and a `DOCKER_RULE` fixture (`docker\s+run`) for the synthetic immediate-exec
case. `ok(...)` / `escalate(...)` helpers wrap `applyPromotedRules(cmd, null,
[rule])`. Groups: (A) relaxation → ok, (B) bypass → escalate, (C) real
violations preserved → escalate, (D) unquoted-arg limitation → escalate, (E)
existing full-command relaxation preserved → ok.

## Related Code Files

- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-echo-prose-pipe-target.test.js`
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-data-command-quotes.test.js` (flip line-88 test; REMOVE its `rule_id` assertion if present)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-cli-argv-payload.test.js` (flip case-5 test ~line 103; remove `rule_id` assertion if present)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-promoted-rules.test.js` (flip line-~404 echo test; REMOVE `result.rule_id === "rule-no-new-artifact-types"` assertion — an `ok` result has no `rule_id`)
- Read: `tools/learning-loop-mastra/core/gate-logic.js` (applyPromotedRules, blankInertQuoted, segmentVerb, splitKeepingDelims, ECHO_PROSE_COMMANDS)

## Implementation Steps

1. Create `gate-logic-echo-prose-pipe-target.test.js` with `VITEST_RULE`, `ARTIFACT_RULE`, `DOCKER_RULE` fixtures and `ok`/`escalate` helpers mirroring `gate-logic-cli-argv-payload.test.js`.
2. Group A (relaxation → ok) — no redirect, no real `|`-pipe (the `|` is inside quoted data, or absent):
   - `printf '%s\n' '{"tool_name":"Bash","tool_input":{"command":"echo \"pnpm test run 2>&1 | tail\""}}'` → ok (finding's exact shape; `|` inside single-quoted JSON; no redirect, no real pipe).
   - `echo "pnpm test foo | grep bar"` → ok (`|` inside double quotes; single segment; no real pipe).
   - `echo "create new convention"` → ok (rule-no-new-artifact-types; printing ≠ creating).
   - `printf '%s\n' '{"x":"pnpm test | tail"}'` → ok (no redirect, no real pipe).
3. Group B (bypass → escalate — the critical no-bypass lock):
   - `echo "vitest run | tail" | bash` → escalate using the REAL `VITEST_RULE` (not DOCKER_RULE) — the `|` inside the echo quotes matches the pattern; real `|` to bash preserves prose. (Also the canonical production rule lock.)
   - `echo "docker run evil" | bash` → escalate using `DOCKER_RULE` (immediate exec sink; real pipe → preserve).
   - `echo "vitest run | tail" > /tmp/x && bash /tmp/x` → escalate using `VITEST_RULE` (redirect → preserve; `|` inside quotes matches).
   - `echo "docker run evil" > /tmp/x && bash /tmp/x` → escalate using `DOCKER_RULE` (redirect persistence → preserve).
   - `echo "create new schema" | bash` → escalate using `ARTIFACT_RULE` (exec sink preserves prose).
   - `echo "vitest run | tail" | sudo bash` → escalate using `VITEST_RULE` (`sudo`-prefixed exec sink; real pipe → preserve — locks `segmentVerb`/prefix handling in the preserve path).
4. Group C (logical-op → ok — echo stdout does NOT flow to the next segment):
   - `echo "pnpm test | tail" || bash` → ok (`||` is logical-OR, not a pipe; no redirect → blank; bash does not receive echo's output).
   - `echo "pnpm test | tail" && bash` → ok (`&&`; same reasoning).
   - `echo "pnpm test | tail" ; bash` → ok (`;`; same).
   - These lock the `||`/`&&`/`;`-are-not-pipes rule (red-team: `splitKeepingDelims` emits `||`/`&&` as two delim tokens — the implementation must not misread them as a real `|`).
5. Group D (real violations preserved → escalate):
   - `pnpm exec vitest run 2>&1 | tail` → escalate (case 6, no echo).
   - `bash -c "vitest run foo | tail"` → escalate (bash -c body runs).
   - `node <CLI_BIN> meta_state_list '{}' ; pnpm test 2>&1 | tail` → escalate (case 4d sibling real pipe).
   - `node <CLI_BIN> meta_state_resolve "$(pnpm test 2>&1 | tail)"` → escalate (case 7 `$(…)` in double-quote).
6. Group E (existing full-command relaxation preserved → ok — full-command `stripEchoProse` unchanged):
   - `echo "pnpm test label" | tail -5` → ok (real `|` to read-only `tail`; per-segment no match; full-command strip blanks → ok. Locks that the full-command pass keeps working).
   - `printf "vitest run output" | grep PASS` → ok (same; matches existing `gate-logic-data-command-quotes.test.js:146`).
7. Group F (unquoted-arg limitation → escalate):
   - `echo $(docker run evil)` → escalate (unquoted `$()` is real expansion; not blanked).
   - `echo test-escalate-token` → escalate (unquoted arg; mirrors `bash-gate-decision-visibility.test.js:78` — confirms unquoted echo args stay visible).
8. Flip the three locked-limitation tests in-place (REMOVE `rule_id` assertions for the `ok` cases):
   - `gate-logic-data-command-quotes.test.js:88`: `echo "pnpm test | grep"` `escalate`→`ok`; rename "echo prose relaxation (Option A: no real pipe)"; add comment citing this plan + the no-backstop reasoning.
   - `gate-logic-cli-argv-payload.test.js` case 5 (~103): `echo "pnpm test | grep foo"` `escalate`→`ok`; update comment from "locked echo limitation is out of scope" to "echo prose relaxation; bypass/redirect cases locked in gate-logic-echo-prose-pipe-target.test.js".
   - `gate-promoted-rules.test.js:~404`: `echo "create new convention"` `escalate`→`ok` under `rule-no-new-artifact-types`; REMOVE the `assert.strictEqual(result.rule_id, "rule-no-new-artifact-types")` line; rename "known heredoc limitation" → "echo prose relaxation".
9. Run `pnpm test:one tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-echo-prose-pipe-target.test.js` — confirm via the parsed vitest-failures.sh JSON summary:
   - Groups A and C (relaxation, logical-op) RED today (fail — per-segment pass escalates).
   - Groups B, D, E, F GREEN today (they already escalate/ok correctly).
   - The three flipped in-place tests RED today.

## Success Criteria

- [ ] New `gate-logic-echo-prose-pipe-target.test.js` exists with groups A-F.
- [ ] Group A + C (relaxation, logical-op) tests RED today (will pass after Phase 2).
- [ ] Group B (bypass: redirect + real-pipe, real VITEST_RULE + sudo) GREEN today and stay GREEN after Phase 2 — the no-bypass lock.
- [ ] Group D (real violations) GREEN today and stay GREEN after Phase 2.
- [ ] Group E (existing full-command relaxation) GREEN today and stays GREEN after Phase 2 (full-command `stripEchoProse` unchanged).
- [ ] Group F (unquoted `$()` / unquoted arg) GREEN today and stays GREEN after Phase 2.
- [ ] The three in-place locked-limitation tests flipped to `ok` with `rule_id` assertions removed; RED today.
- [ ] `pnpm test:one` parsed summary shows the expected red/green split (no raw-stdout grep — use the JSON summary per the test-discipline hint).

## Risk Assessment

- **Bypass tests green today by accident (Low):** verify each Group B case is `escalate` TODAY (per-segment pass, no echo strip, `|`-inside-quotes matches) BEFORE Phase 2. The reviewer-confirmed trace: `echo "docker run evil" | bash` against `docker\s+run` escalates today because the per-segment pass sees `echo "docker run evil"` (no echo strip) and the pattern matches inside the quotes. If any Group B case is `ok` today, the fixture is wrong — fix the test, do not proceed.
- **`||`/`&&` test expectation (Low):** `echo "pnpm test | tail" || bash` → ok assumes `||` is recognized as non-pipe. Today (no per-segment echo strip) this ESCALATES (the `|` inside quotes matches in the per-segment pass). So the Group C tests are RED today (correct — they will pass after Phase 2 recognizes `||`/`&&` as non-pipe). Confirm they are red, not green.
- **Flipped test breaks suite run (Low):** flipping 3 tests to `ok` (red today) must flip ONLY those; the rest of each file stays green. Run each touched file to confirm.