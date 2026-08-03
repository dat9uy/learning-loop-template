---
phase: 4
title: "Verify timings, parity, and CI independence"
status: completed
priority: P1
effort: "1h"
dependencies: [2, 3]
---

# Phase 4: Verify timings, parity, and CI independence

## Overview

Prove the hybrid gate works end-to-end and is side-effect-free: pre-commit is fast, pre-push runs the full gate, the test set is unchanged, CI is independent, and no `--no-verify` incentive remains. This is the iron-law verification — no claims without fresh evidence.

## Requirements

- Functional: timed measurements of `pnpm test:unit` (pre-commit) and `pnpm test` (pre-push full).
- Functional: test-count parity — `vitest run` (no filter) passes the same count as pre-split.
- Functional: e2e membership guard passes; a deliberate misclassification fails it.
- Non-functional: no public contract change (response shapes, schemas, CLI surface) — this plan only touches test config + git hooks.

## Architecture

Verification is three lanes, run in order:
1. **Timing lane:** `time pnpm test:unit` (cold + warm), `time pnpm test` (cold + warm). Compare to Phase 1 baselines. Confirm pre-commit target (seconds) met.
2. **Parity lane:** `vitest run` (no filter) test count == pre-split count; `cli-read-parity`, `cli-write-parity`, `agent-direct-parity`, `runtime-agnostic` all pass under both projects and unfiltered.
3. **Gate lane:** a real `git commit` fires the unit gate; a real `git push` (to a throwaway branch) fires the full gate; a deliberate failure aborts the push; `--no-verify` skips locally and CI still runs on the PR.

## Related Code Files

- Read: `vitest.config.mjs` (projects), `package.json` (scripts + hook block), Phase 1 measurement report, Phase 2 guard test
- Modify: none (verification-only; revert any deliberate-failure probes)
- Create: `plans/260803-1314-hybrid-test-tiering-and-pre-push-gate/reports/phase-04-verification.md` (the before/after evidence record)

## Implementation Steps

1. **Timing:** `time pnpm test:unit` (cold), then immediately `time pnpm test:unit` (warm). Record both. `time pnpm test` (the pre-push gate). Compare to Phase 1's 153s cold baseline.
2. **Test-count parity:** run `vitest run` (no filter), record total tests passed. Diff against the pre-split count from Phase 1's baseline run. Must be equal.
3. **Blast-radius tests:** run `cli-read-parity`, `cli-write-parity`, `agent-direct-parity`, `runtime-agnostic`, `cli-context-savings-script` (snapshot), `meta-state-list-*` — all pass. Run them via `--project unit` where they belong and unfiltered; confirm identical results.
4. **Guard test:** run `test-tier-e2e-membership.test.js` — passes. Temporarily misclassify one e2e file into `unit` (edit config) — confirm the guard fails. Revert.
5. **Pre-commit gate (live):** make a trivial change, `git commit` — confirm `pnpm test:unit` fires and completes in the timed seconds. Capture the hook output.
6. **Pre-push gate (live):** create a throwaway branch, `git push -u origin <throwaway>` — confirm `pnpm test && pnpm fallow:gate` fires. Then introduce a deliberate temporary test failure, `git commit` (fast unit may still pass if the failure is e2e-only) + `git push` — confirm the push is aborted. Revert the failure.
7. **`--no-verify` + CI backstop:** `git push --no-verify` on a PR branch — confirm the local pre-push is skipped and CI's `test` check runs on the PR (verify via `gh pr checks`).
8. **No public-contract regression:** confirm no schema, CLI tool surface, MCP residue, or response shape changed (this plan is config-only; assert by the parity tests in step 3).
9. Write `phase-04-verification.md` with the before/after table and the gate-lane evidence.

## Success Criteria

- [ ] `pnpm test:unit` (warm) completes in seconds — measured, not assumed.
- [ ] `vitest run` (no filter) test count == pre-split count.
- [ ] All blast-radius parity tests pass under unit + unfiltered.
- [ ] e2e membership guard passes; deliberate misclassification fails it.
- [ ] Live `git commit` fires the unit gate (seconds); live `git push` fires the full gate and aborts on failure.
- [ ] `git push --no-verify` skips locally; CI still runs on the PR.
- [ ] No public contract changed (parity tests confirm).
- [ ] Verification report written with fresh evidence.

## Risk Assessment

- **Risk:** `pnpm test:unit` is still slow because a "unit" file secretly spawns a server (misclassified). **Mitigation:** step 4 guard + step 1 timing surface it; reclassify and re-measure.
- **Risk:** coverage-final.json is no longer produced (because `unit` is coverage-off and pre-push runs `pnpm test` which IS coverage-on — but verify). **Mitigation:** step 3 / step 6 confirm `pnpm test` still emits coverage for fallow; the `fallow:gate` step in pre-push consumes it.
- **Risk:** the live pre-push test (step 6) pushes a throwaway branch to the remote — unwanted remote noise. **Mitigation:** use a clearly-throwaway branch name, delete the remote branch immediately after (`git push origin --delete <branch>`), and never run it against `main`.
- **Risk:** CI parity drift — local `pnpm test` and CI `pnpm test` diverge because of the projects split. **Mitigation:** `pnpm test` (unfiltered) runs the union of both projects == the pre-split flat set; CI runs `pnpm test` unchanged. Verify the union count in step 2.