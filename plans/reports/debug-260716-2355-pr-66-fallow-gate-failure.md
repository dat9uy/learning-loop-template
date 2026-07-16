# Debug Report — PR #66 Fallow Gate Failure

**Date:** 2026-07-16 23:55
**PR:** #66 — `feat(meta-state): tier 2 phase C — gitattributes flip + CI advisory + compaction signal`
**Branch:** `260716-1101-tier2-phase-c` (HEAD `d7ce932`)
**Failing check:** `test` workflow → `Fallow audit (PR gate)` step
**Run:** [29517368412](https://github.com/dat9uy/learning-loop-template/actions/runs/29517368412/job/87685649792)
**mergeStateStatus:** `UNSTABLE` (one failing check); `mergeable: MERGEABLE`

## Executive Summary

Fallow audit ran with `gate: new-only` on the PR diff vs `e9e02a6` (PR base) and found **6 introduced issues**, **2 of which are `severity=high`**, which drives the verdict to `fail`. The two `severity=high` findings are quote-aware tokenizer helpers (`splitKeepingDelims`, `blankAllQuoted`) introduced by this PR. The duplication finding (60 lines × 2 instances) is the same tokenizer logic duplicated between `splitSegments` and `splitKeepingDelims`. All three are real, addressable by one shared refactor.

## Root Cause Analysis

### Verdict driver (severity=high — blocking)

| Symbol | File:Line | Cognitive | Cyclomatic | Lines |
|---|---|---|---|---|
| `splitKeepingDelims` | gate-logic.js:340 | **25** | 14 | 54 |
| `blankAllQuoted` | gate-logic.js:282 | **25** | 12 | 50 |

Fallow's gate script: `if [ "$VERDICT" = "fail" ]; then exit 1`. `VERDICT=fail` whenever any finding at error tier (severity=high) exists in the diff. Refactor both helpers to drop below cognitive=20 and the gate flips to `warn` (passes the `new-only` audit gate).

### Code duplication (60 lines, fingerprint `dup:233464d5`)

`splitSegments` (gate-logic.js:96-155) and `splitKeepingDelims` (gate-logic.js:341-388) carry the same quote-aware state machine: track `inSingle`/`inDouble`/`escaped`, branch per char, treat `;|&` as a delimiter. The two functions differ only in:
1. `splitSegments` emits *trimmed* segments and drops the delimiter token; `splitKeepingDelims` emits raw spans and preserves `;|&` as separate elements.
2. `splitSegments` has the `fallow-ignore-next-line complexity` suppression at line 93 (was grandfathered in); `splitKeepingDelims` was added by this PR without one.

`blankAllQuoted` (gate-logic.js:282) is a third instance of the same state machine with a different output policy.

A single shared tokenizer core collapses all three.

### Unused exports

| Symbol | File:Line | Reality |
|---|---|---|
| `stripDataCommandQuotes` | gate-logic.js:395 | **Real:** used only inside gate-logic.js (lines 423, 979, 997). Drop the `export` keyword. |
| `findDuplicateVersionPerId` | registry-stats.js:101 | **False positive:** consumed by `core/__tests__/registry-stats.test.js:21`, but Fallow's dead-export check ignores `*.test.js` consumers. Annotate with `// fallow-ignore-next-line unused-export` — codebase already uses this pattern (e.g. `core/operation-envelope.js:52,96` for the same "test-only public surface" rationale). |

### Non-blocking findings (severity=moderate — won't fail the gate after the high-severity fix)

| Symbol | File:Line | Cognitive | Cyclomatic |
|---|---|---|---|
| `computeRegistryStats` | registry-stats.js:41 | 21 | 14 |
| `loadPromotedRules` | gate-logic.js:725 | 20 | 16 |
| `stripMessageFlags` | gate-logic.js:170 | 18 | 8 |

These remain after the high-severity fix but won't fail the gate (the gate only fails on `severity=high`). Worth addressing in a follow-up if the operator wants strict cognitive ≤ 15, but not required to unstick PR #66.

## Fallow Config Notes

`tools/learning-loop-mastra/.fallowrc.json` has `"unused-exports": "warn"`, so the two unused-export findings are warn-tier by themselves — they are not what fail the gate. The gate fails on the two `severity=high` cognitive findings.

## Recommended Fix Path (single PR-ready commit)

1. **Extract a shared quote-aware tokenizer** `walkQuoteState(command, hooks)` at module-private scope in `gate-logic.js`. Hooks: `onChar(ch, i)`, `onEnterQuote(quote, i)`, `onExitQuote(quote, i)`, `onDelimiter(ch, i)`. Replace the bodies of `splitSegments`, `splitKeepingDelims`, `blankAllQuoted` with thin wrappers over `walkQuoteState`. Behavior unchanged; tested via existing `gate-logic-data-command-quotes.test.js` (129 lines of stripDataCommandQuotes coverage) and any existing splitSegments tests.
2. **Drop the `export` keyword** on `stripDataCommandQuotes` (line 395) — internal-only.
3. **Annotate** `findDuplicateVersionPerId` (registry-stats.js:101) with `// fallow-ignore-next-line unused-export -- public API consumed by core/__tests__/registry-stats.test.js` matching the codebase convention.
4. **Remove** the now-redundant `// fallow-ignore-next-line complexity` at gate-logic.js:93 if `splitSegments` drops under cognitive=15 post-refactor.

### Verification commands

```bash
pnpm test:iter                       # vitest deterministic parse; gate is suppressed
pnpm fallow:brief                    # brief CSV; expect zero severity=high lines
pnpm fallow:gate                     # full gate; expect exit 0
```

After verification, re-run the PR test workflow by pushing the fix (or via `gh run rerun 29517368412 --failed` once green locally).

## Risk Notes

- `splitKeepingDelims` and `blankAllQuoted` are not directly unit-tested; correctness depends on the comprehensive `gate-logic-data-command-quotes.test.js` coverage of `stripDataCommandQuotes`. The test suite is the safety net for the refactor — run `pnpm test:iter` before claiming green.
- The `splitSegments` body is currently suppressed by `// fallow-ignore-next-line complexity`; the refactor may retire that suppression, which is a strict improvement.
- The three `severity=moderate` findings (`computeRegistryStats`, `loadPromotedRules`, `stripMessageFlags`) will stay open after the fix. PR #66 will pass the gate (verdict flips to `warn`), but a follow-up tracking issue is recommended if strict cognitive ≤ 15 is desired.

## Open Questions

1. Should the three `severity=moderate` findings be addressed in the same PR or deferred?
2. Confirm acceptable to drop the `export` on `stripDataCommandQuotes` — it is internal, but is it referenced from anywhere outside this repo (e.g. consumer project)? Within this repo, only internal usages exist (grep confirmed).
3. Is the `walkQuoteState` helper file-private or should it live in a separate `core/quote-tokenizer.js` for future reuse (e.g. by the `evaluate-write-gate.js` family)?

## Evidence Trail

- CI run: `https://github.com/dat9uy/learning-loop-template/actions/runs/29517368412/job/87685649792`
- Fallow action SHA pinned at `c9326d9395c0b46f4077290473060b3e950b6e8c` (fallow-rs/fallow)
- Local brief: `pnpm fallow:brief` output reproduces 6 issues (same as CI annotation)
- Fallow config: `tools/learning-loop-mastra/.fallowrc.json`
- Test coverage for refactor target: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-data-command-quotes.test.js` (129 lines)
