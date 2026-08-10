# Phase 1 — Contract baseline and regression matrix (RED)

**Plan:** `plans/260809-1538-vitest-recurrence-telemetry-and-unexpected-match-classification/`
**Phase:** 1 (Contract baseline and regression matrix)
**Date:** 2026-08-09
**Status:** RED baseline established; no product behavior changed.

## Summary

Wrote the Phase 1 RED test baseline. No source (`core/*.js`), registry (`meta-state.jsonl`), or runtime hook file was modified — only the five owned test files. The 15 failing assertions all fail because the required behavior is missing (RED), not because of fixture/setup errors. All adjacent gate/heredoc/parser regression sets remain green.

## Files modified

| File | Action | Change |
|---|---|---|
| `tools/learning-loop-mastra/__tests__/legacy-mcp/command-classification-contract.test.js` | Created (reviewed/refined) | 9 L2 event-class contract tests: ordinary-fire, unexpected-match, legacy, contradictory (both directions), wrong producer, mixed/unclassified, cross-surface disagreement, toolchain-failure. 7 RED. |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-decision-log.test.js` | Modified | 3 provenance tests. Fixed the newline-hardening test (was ENOENT fixture bug + wrong throw premise → now correctly pins the one-line JSONL invariant and passes). Legacy-compat test passes; provenance round-trip is 1 RED. |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-promoted-rules.test.js` | Modified | `describe("gate promoted rules evaluator provenance")` block: real executable pipe, proven inert quoted heredoc, executable `bash -c` body, null write-gate caller. 3 RED. |
| `tools/learning-loop-mastra/core/evaluate-bash-gate.test.js` | Modified | Added `bash -c "vitest run …" | tail` (escalate, never unexpected) and unquoted executor heredoc (escalate, never unexpected) fixtures to the Vitest executable matrix. All 53 tests green. |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-recurrence.test.js` | Modified | Extended `makeEntry` with optional `provenance` override + `UNEXPECTED_PROV` const. Added 5 eligibility regression tests (ordinary-fire, legacy, unexpected-match-eligible, wrong producer, contradictory pair). 4 RED. |

## (a) Exact failing test names — RED baseline (15)

Run: `npx vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/command-classification-contract.test.js tools/learning-loop-mastra/__tests__/legacy-mcp/gate-decision-log.test.js tools/learning-loop-mastra/__tests__/legacy-mcp/gate-promoted-rules.test.js tools/learning-loop-mastra/core/evaluate-bash-gate.test.js tools/learning-loop-mastra/__tests__/legacy-mcp/gate-recurrence.test.js` → **4 failed / 1 passed files, 15 failed / 181 passed / 196 total.**

Per-file failure counts: contract 7, decision-log 1, promoted-rules 3, recurrence 4, evaluator 0.

Exact names:

1. `command-classification-contract.test.js > three ordinary-rule-fire events → telemetry only, zero emitted findings`
2. `command-classification-contract.test.js > legacy rows without provenance → telemetry only, zero findings`
3. `command-classification-contract.test.js > contradictory pair (unexpected-match + executable origin) → unclassified, zero findings`
4. `command-classification-contract.test.js > contradictory pair (ordinary-rule-fire + inert-data origin) → unclassified, zero findings`
5. `command-classification-contract.test.js > wrong producer marker with unexpected-match fields → zero findings`
6. `command-classification-contract.test.js > mixed origin / unclassified kind → zero findings`
7. `command-classification-contract.test.js > cross-surface same-identity provenance disagreement fails closed (no finding)`
8. `gate-decision-log.test.js > appendDecisionLog round-trips optional provenance fields (match_origin, candidate_kind, event_source)`
9. `gate-promoted-rules.test.js > gate promoted rules evaluator provenance (plan 260809-1538) > real executable vitest reader pipe → ordinary-rule-fire (executable origin), never unexpected`
10. `gate-promoted-rules.test.js > gate promoted rules evaluator provenance (plan 260809-1538) > proven inert-data quoted heredoc containing a raw vitest pipe → unexpected-match, decision stays ok`
11. `gate-promoted-rules.test.js > gate promoted rules evaluator provenance (plan 260809-1538) > executable body (bash -c) matching the rule → ordinary/unknown, never unexpected`
12. `gate-recurrence.test.js > checkAndEmit: three ordinary-rule-fire events → telemetry only, zero findings (RED)`
13. `gate-recurrence.test.js > checkAndEmit: legacy rows without provenance → zero findings (RED)`
14. `gate-recurrence.test.js > checkAndEmit: wrong producer marker with unexpected-match fields → zero findings (RED)`
15. `gate-recurrence.test.js > checkAndEmit: contradictory pair (unexpected-match + executable origin) → zero findings (RED)`

Every failure is an assertion mismatch (`undefined` vs expected enum, or `1 !== 0` for a zero-finding expectation). All 15 are the intended RED: `checkAndEmit` currently files a finding for ANY repeated rule_id event (even ordinary/legacy/contradictory), and `applyPromotedRules`/`appendDecisionLog` return no provenance fields yet.

Green pins against current behavior (correct): `three explicit unexpected-match events → one finding` and `toolchain-failure events remain on their own branch → 1 finding` — these pass today because the current buggy tracker happens to file for any repeated rule_id, which is exactly the contract Phase 4 must preserve only for explicit unexpected candidates.

## Regression status

- `tools/learning-loop-mastra/__tests__/legacy-mcp/` full suite: **15 failed (all RED, listed above) | 1939 passed | 4 skipped**. No non-RED regressions.
- Read-only regression sets (untouched): `gate-logic-{data-command-quotes,heredoc,quoted-strings,verb-layer,cli-argv-payload,echo-prose-pipe-target,inert-sink}.test.js` → **6 files / 175 tests all green**.
- `core/evaluate-bash-gate.test.js` → 53 green (Vitest tail/grep/head/pnpm matrix preserved, plus new `bash -c` + unquoted-executor-heredoc fixtures).

## (b) Effective-rule version note for Phase 5 (contract-drift input)

Three `rule-no-raw-stdout-vitest` rows exist in the live `meta-state.jsonl`, all `status: active`:

| Line | version | pattern (reader set) |
|---|---|---|
| 12 | 0 | `(vitest run\|pnpm test\b).*\| *(tail\|grep)\b` |
| 99 | 1 | `(vitest run\|pnpm test\b).*\| *(tail\|head\|grep)\b` |
| 292 | 2 | `(vitest run\|pnpm test\b).*\| *(tail\|head\|grep)\b` |

`loadPromotedRules` (`core/gate-logic.js:1493-1571`) dedupes to canonical max-version per id (v2) before the active filter, so the effective promoted rule is **v2 (`tail|head|grep`)**. v0 (`tail|grep`) is a historical narrower duplicate; v1 and v2 are textually identical and the version bump is the only difference. This is the contract-drift input for Phase 5: the drift test must resolve the active rule through canonical max-version and expose disagreement if any runtime projection or package script still names the narrower `tail|grep` set. No registry edit was made (per plan constraints).

## (c) Frozen test vocabulary and field defaults

- `event_source`: `"bash-gate-evaluator"` (promoted-rule producer) | `"toolchain-failure-capture"` (separate source). Absent ⇒ not an evaluator-produced automatic candidate.
- `match_origin`: `"executable"` | `"inert-data"` | `"mixed"` | `"unknown"`. Absent ⇒ unclassified.
- `candidate_kind`: `"ordinary-rule-fire"` | `"unexpected-match"` | `"unclassified"`. Absent ⇒ unclassified.
- Discriminated pair, fail-closed: `unexpected-match` valid only with `match_origin: "inert-data"`; `ordinary-rule-fire` valid only with executable/ordinary origin. Any missing/malformed/conflicting combination (incl. `event_source` ≠ `bash-gate-evaluator`) normalizes to `unclassified` / telemetry-only.
- Legacy fixture = the current capture shape: no `event_source` / `match_origin` / `candidate_kind`, with `rule_id`, `decision`, `reason`, `matched_pattern`, `skipped_via_override`, `session_id`, `session_id_tier`. The dedup identity in `readJsonlFromAllSurfaces` is `ts::command_prefix::rule_id::decision::session_id` — provenance fields are NOT in the dedup key, so a same-identity cross-surface duplicate with differing provenance collapses to one row and must fail closed (Phase 4 must detect the disagreement before dedup order picks a winner).
- `VITEST_READER = "vitest run --bail=1 foo.test.js 2>&1 | tail -10"`; `INERT_VITEST = "cat <<'EOF'\nvitest run foo.test.js | tail\nEOF\n"`.
- `makeEvent` (contract test) defaults `rule_id: "rule-no-raw-stdout-vitest"`, `decision: "escalate"`, `session_id: SID`, `session_id_tier: "real"`; `makeEntry` (recurrence test) gained a trailing `provenance = {}` override with `UNEXPECTED_PROV = { event_source: "bash-gate-evaluator", match_origin: "inert-data", candidate_kind: "unexpected-match" }`.
- Evaluator-level pins: `bash -c "vitest …" | tail` and unquoted `cat <<EOF` bodies must escalate and never carry `candidate_kind: "unexpected-match"` (asserted via `notStrictEqual` today; Phase 3 will make the ordinary-rule-fire field explicit).

## Acceptance criteria check

- [x] Failures are RED (missing behavior), not fixture/setup errors — verified each is an assertion mismatch.
- [x] Existing gate + recurrence + evaluator tests remain green except the 15 intentional RED assertions (1939 legacy-mcp passing, 175 read-only regression passing, 53 evaluator passing).
- [x] No source, registry, or runtime hook file modified (`git diff --name-only` shows only the 4 modified test files + 1 new test file).
- [x] Acceptance command run to `/tmp/phase1-vitest.log` (no vitest stdout piped to tail/grep). RED test names + counts captured above.
- [x] No commit made; plan files untouched.

## Notes / open items

- The `sync-skills` EACCES stderr line seen in the full legacy-mcp run is a pre-existing environmental quirk in a temp dir, unrelated to this phase.
- Test `checkAndEmit: three explicit unexpected-match events → one finding (unchanged schema/key)` (recurrence) and the contract-test unexpected-match/toolchain-failure pins pass on current behavior and are NOT RED — they pin the surviving semantics that Phase 4 must preserve.
- The cross-surface disagreement RED test depends on the current dedup key NOT including provenance; Phase 4 must add disagreement detection at/before the dedup boundary, not after dedup order selects a winner.
