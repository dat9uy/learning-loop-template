---
date: 2026-06-29
title: "PR #21 fallow audit gate fixed: high-crap-score + stale dupes baseline"
branch: 260628-2008-phase-e-evaluator-refactor
pr: 21
ci_runs: [28367374832, 84036728851]
status: green
commits: [84348cd, 97c2b5b, 2d4a332, da1c869]
related_finding: meta-260629T1450Z-pr-21-fallow-audit-gate-exits-1-in-ci-jobs-28352732928-28356
---

# PR #21 fallow audit gate fix — journal

## TL;DR

The PR #21 fallow audit gate was correctly failing on real findings, not env drift. Fixed across 4 commits:

1. `84348cd ci(fallow): drop dead-weight subdir install + refresh dupes baseline`
2. `97c2b5b refactor(evaluators): drop cyclomatic complexity below fallow threshold`
3. `2d4a332 chore(meta-state): refresh bash-gate fingerprint after refactor`
4. `da1c869 chore(meta-state): refresh gate-logic.js fingerprints`

PR #21 CI run 28367374832 (`test`) and run 84036728851 (`fallow`) both pass green. Meta-state finding `meta-260629T1450Z-...` resolved.

## What actually broke

The diagnostic at `plans/reports/diagnostic-260629-pr-21-fallow-audit-gate-root-cause.md` refuted the env-drift hypothesis. The real cause was 4 `fallow/high-crap-score` findings + a stale `dupes-baseline.json`:

| # | Location | CC | CRAP | Source |
|---|----------|-----|------|--------|
| 1 | `core/evaluate-write-gate.js` `evaluateWriteGate` | 16 | 272 | New in PR #21 |
| 2 | `core/evaluate-write-gate.js` `evaluatePreflight` | 6 | 42 | New in PR #21 |
| 3 | `core/evaluate-inbound-gate.js` `evaluateInboundGate` | 9 | 90 | New in PR #21 |
| 4 | `hooks/legacy/bash-gate.js` `main` | 8 | 72 | Pre-existing (file touched by PR #21) |

Plus 18 stale entries in `dupes-baseline.json` that matched 0 current clone groups, causing fallow to flag every current clone as "new."

## How it got fixed

**Phase 1 (commit 84348cd):** Reverted `.github/workflows/test.yml` L51-58 subdir install (380ms no-op). Regenerated `dupes-baseline.json` via `pnpm exec fallow dupes --save-baseline` (19 entries matching current paths).

**Phase 2 (commit 97c2b5b):** Refactored each evaluator to drop CRAP below threshold 30:

| Function | Before CC | After CC | Approach |
|----------|-----------|----------|----------|
| `evaluateWriteGate` | 16 | 4 | Declarative `WRITE_GATE_RULES` array + `Array.find` |
| `evaluatePreflight` | 6 | 3 | Extracted `findPreflightMarker` + `buildPreflightChecklist` |
| `evaluateInboundGate` | 9 | 2 | Extracted `evaluateStateChangeWarning` + `loadStaleActiveObservations` + `warnDecision` |
| `main` (bash-gate.js) | 8 | 5 | Extracted `emitIfBlocked` + `buildLogEntry` |

The original plan suggested extracting the rule registry into `core/write-gate-rules.js` as a separate file. I tried that first, but the `placement-manifest.test.js` role-layering invariant forbids evaluators from importing evaluators (or even helpers — turns out helpers are also off-limits). I inlined the registry data inside `evaluate-write-gate.js` instead. The registry pattern works either way; inlining is the minimal-blast-radius choice given the closed role taxonomy.

**Phase 2 unexpected detour:** I initially went with Option C (exclude `hooks/legacy/**` from `.fallowrc.json#ignorePatterns`). The diagnostic recommendation was Option C. But this cascaded: the only importer of `core/evaluate-inbound-gate.js` was `hooks/legacy/inbound-gate.js`, so masking the legacy directory triggered a new `fallow/unused-file` finding on `core/evaluate-inbound-gate.js`. Per the plan's preference for refactoring over suppression, I refactored the legacy file instead.

**Phase 3 (commits 2d4a332 + da1c869):** Resolved meta-state finding. The `meta_state_resolve` consult gate (`rule-no-orphaned-evidence`) required refreshing 4 stale fingerprints first — 1 for bash-gate.js (changed by Phase 2), 3 for gate-logic.js anchor references (drifted since Phase E extraction in commit 09415f4).

## What worked / what didn't

**Worked:**
- Following the plan's diagnostic → Phase 1 → Phase 2 → Phase 3 sequence kept changes reviewable.
- Inlining the rule registry instead of extracting kept the placement-manifest layering invariant satisfied with zero churn outside the file that needed refactoring.
- The `meta_state_refresh_fingerprint` tool cleanly handled the 4 stale fingerprints without manual SHA computation.

**Didn't work first try:**
- Initial `.fallowrc.json` exclude-`hooks/legacy/**` change introduced a new `fallow/unused-file` finding (cascade). Reverted.
- Initial plan to extract `write-gate-rules.js` failed placement layering. Deleted and inlined.

## Edge cases worth noting

- **Cold-tier regression test sensitivity:** The test grounds `mechanism_check=true` findings against stored fingerprints. ANY refactor that changes a referenced file's content requires a fingerprint refresh in the same commit. The 4-file change to `bash-gate.js` plus 4-file change to `core/evaluate-*.js` triggered this — would have been a maintenance hazard otherwise.

- **fallow CC counter quirks:** `??` and `||` chains are counted as +1 per occurrence (not per chain). This means `decision.rule_id ?? decision.meta_state_id ?? null` adds +2 CC. With 0% test coverage on legacy files, this matters — even CC 5 = CRAP 30 exactly. Adding a single `??` chain tips CRAP above threshold.

- **CI vs local `pnpm exec fallow audit --changed-since` divergence:** Running from the repo root fails silently with `failed to read baseline: No such file or directory`. Must run from `tools/learning-loop-mastra/` to get exit-code-1-on-fail semantics. The CI workflow handles this via `cd tools/learning-loop-mastra` before the fallow invocation.

## Unresolved questions

None. The plan's acceptance criteria are all met:

- [x] `.github/workflows/test.yml` no longer contains the `pnpm --dir ... install` step
- [x] `.github/workflows/test.yml` still contains the SARIF upload-artifact step
- [x] `dupes-baseline.json` regenerated; sanity checks pass
- [x] 4 high-crap-score findings eliminated (via refactor; legacy file refactored not excluded)
- [x] PR #21 CI `test` check passes (green)
- [x] `fallow` audit check passes (green)
- [x] Meta-state finding `meta-260629T1450Z-...` resolved with green-run URL evidence
- [x] Local test suite passes (1369 tests)