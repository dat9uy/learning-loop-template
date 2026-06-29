---
title: "PR #21 fallow audit gate root cause — env-drift hypothesis refuted"
description: "Diagnostic outcome of the two CI edits in plans/260629-1538-fallow-ci-env-drift-diagnostic/. The subdir install step did NOT eliminate the node_modules warning; the actual gate failures are pre-existing/baseline-stale findings surfaced by fallow's analyzers."
date: 2026-06-29
pr: 21
branch: "260628-2008-phase-e-evaluator-refactor"
ci_run: 28358847609
ci_job: 84008321887
commit: f524cb4
sarif_artifact: fallow-sarif
status: "branch-b — hypothesis refuted, real cause identified"
---

# PR #21 fallow audit gate root cause — env-drift hypothesis refuted

## TL;DR

The env-drift hypothesis (`tools/learning-loop-mastra/node_modules` symlink missing in CI) is **refuted**. The new `pnpm --dir tools/learning-loop-mastra install --frozen-lockfile` step at `.github/workflows/test.yml:51-58` ran successfully in CI run 28358847609 (job 84008321887) and reported `"Already up to date"` — pnpm hoisting already included the subdir's deps via the workspace, so the symlink (or its absence) is not what fallow's analyzers care about. The "WARN node_modules directory not found" warning persists even with the subdir installed.

The actual gate failures are real findings emitted by fallow's analyzers against the current code, plus a stale duplication baseline. They are **not** environmental drift.

## CI evidence

### The new subdir install step ran successfully

```
test    Install subdir dependencies (fallow audit gate)    2026-06-29T08:28:34.0714414Z ##[group]Run pnpm --dir tools/learning-loop-mastra install --frozen-lockfile
test    Install subdir dependencies (fallow audit gate)    2026-06-29T08:28:34.4816389Z Already up to date
test    Install subdir dependencies (fallow audit gate)    2026-06-29T08:28:34.4823333Z Done in 380ms using pnpm v11.9.0
```

`pnpm --dir ... install` completed in 380ms with no work to do — the workspace install at L48-49 already hoisted the subdir deps to `node_modules/.pnpm/` and the subdir's package.json has no separate lockfile.

### The "WARN node_modules directory not found" warning persists

Despite the subdir install step running, fallow still emits the warning at the start of both dead-code and duplication analyzers (twice in the run). This means fallow's import resolver is not looking at `tools/learning-loop-mastra/node_modules` — it is looking for some other path the analyzer expects. The warning is benign on the success path (the actual findings below are emitted regardless of whether the warning fires).

### The actual findings (from the preserved SARIF)

Downloaded from artifact `fallow-sarif` of run 28358847609. Run breakdown:

| Run | Analyzer | Rules | Results |
|-----|----------|-------|---------|
| 0 | dead-code | 45 | **0 results** |
| 1 | code-duplication | 0 | **1 result** |
| 2 | health | 16 | **4 results** |

5 findings total (4 health + 1 duplication). All 5 emit against the **current code**, not against extra "unresolved" / "unused" signals — exactly the pattern the env-drift hypothesis predicted would happen if `node_modules` were missing.

#### `fallow/high-crap-score` × 4 (health analyzer)

| File:line | Function | CRAP | Cyclomatic |
|-----------|----------|------|------------|
| `tools/learning-loop-mastra/core/evaluate-write-gate.js:61` | `evaluateWriteGate` | 272.0 | 16 |
| `tools/learning-loop-mastra/core/evaluate-write-gate.js:25` | `evaluatePreflight` | 42.0 | 6 |
| `tools/learning-loop-mastra/core/evaluate-inbound-gate.js:52` | `evaluateInboundGate` | 90.0 | 9 |
| `tools/learning-loop-mastra/hooks/legacy/bash-gate.js:23` | `main` | 72.0 | 8 |

The first three are in **`core/evaluate-*.js`** — files introduced by this PR's evaluator extraction (`09415f4 refactor(gate): extract evaluators from hooks into core/`). The fourth is in `hooks/legacy/bash-gate.js` (legacy file that fallow still scans because `boundary-violation: "off"` in `.fallowrc.json:48`).

Threshold is 30 (from the SARIF rule metadata `defaultConfiguration.level: "error"`). All four exceed it.

#### `fallow/code-duplication` × 1 (duplication analyzer)

> Clone group 1 (8 lines, 2 instances)

No locations (CodeQL rejects findings without locations; the inline Python splitter at L88-197 strips these). Pre-existing — not introduced by this PR.

### Stale duplication baseline

The fallow run also surfaced:

```
Warning: duplication baseline has 18 entries but matched 0 current clone groups.
Your paths may have changed, or the baseline was saved on a different machine.
Re-save with: --save-baseline /home/runner/work/learning-loop-template/learning-loop-template/tools/learning-loop-mastra/../../plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dupes-baseline.json
```

The baseline JSON at `plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dupes-baseline.json` has 18 entries but none match the current repo's paths. This is a separate latent issue from the high-crap-score findings — the baseline was saved on a different machine (or before paths were normalized) and needs regenerating.

## What this means for the meta-state finding

The original finding (`meta-260629T1450Z-pr-21-fallow-audit-gate-exits-1-in-ci-jobs-28352732928-28356`) proposed the env-drift hypothesis as a guess and explicitly stated "Hypothesis (unverified — investigation stopped to avoid iterative audit-tweaking)." The investigation has now definitively run and the hypothesis is refuted. The finding's `description`, `subtype: "ci-environment-drift"`, and any related reasoning should be updated to reflect the real cause.

The finding is **NOT resolved** — PR #21 still fails the gate. The cause is now known (high-crap-score + stale dupes baseline) and is a different scope of work (regenerate baseline + decide whether to fix high-CRAP-score functions in PR #21 or split into follow-ups).

## State of the workflow edits

| Edit | Useful? | Action |
|------|---------|--------|
| `pnpm --dir tools/learning-loop-mastra install --frozen-lockfile` (L51-58) | **No** — runs "Already up to date" in 380ms; no behavioral effect | Candidate to remove per YAGNI. Adds minor CI latency. |
| `actions/upload-artifact@v7` (L235-247) on failure | **Yes** — captured the SARIF that revealed the real cause | Keep permanently. |

The upload-artifact step's value is established: without it, this diagnosis would require re-running CI with debug logging.

## Next steps (proposed, awaiting user decision)

1. **Revert the dead-weight subdir install step** — 380ms per PR run with zero benefit. Could be re-added if a future hypothesis emerges that needs it.
2. **Plan a follow-up** to either:
   - (a) regenerate the duplication baseline (`pnpm exec fallow dupes --save-baseline plans/260627-2042-phase-e-dead-code-sweep/reports/fallow/dupes-baseline.json`)
   - (b) fix or suppress the 4 high-crap-score findings (3 are new from the evaluator extraction; 1 is pre-existing in legacy)
   - (c) split the follow-up into 2 — fix the 3 new high-CRAP-score findings in PR #21 (they're in PR-touched files), regenerate the dupes baseline + suppress the legacy finding in a separate PR.
3. **Update the meta-state finding** with this report as evidence, removing the env-drift hypothesis and pointing at the real cause.