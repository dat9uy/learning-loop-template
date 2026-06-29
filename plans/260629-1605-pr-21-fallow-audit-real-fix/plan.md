---
title: "Fix PR #21 fallow audit gate real cause: high-crap-score + stale dupes baseline"
description: "Three-phase fix for the real cause of PR #21's gate failure (env-drift was a red herring per the diagnostic at plans/reports/diagnostic-260629-pr-21-fallow-audit-gate-root-cause.md). Phase 1: revert the dead-weight subdir install step and regenerate the stale dupes baseline. Phase 2: refactor or suppress the 4 high-crap-score findings (3 in PR-touched core/evaluate-*.js files, 1 in pre-existing hooks/legacy/bash-gate.js). Phase 3: verify gate exits 0 on a fresh PR run."
status: pending
priority: P1
issue: 21
branch: "260628-2008-phase-e-evaluator-refactor"
tags: [ci, fallow, pr-21, refactor, audit-gate]
blockedBy: ["260629-1538-fallow-ci-env-drift-diagnostic"]
blocks: []
created: "2026-06-29T08:51:06.267Z"
createdBy: "ck:plan"
source: skill
---

# Fix PR #21 fallow audit gate real cause: high-crap-score + stale dupes baseline

> **Scope:** This plan addresses the real root cause of PR #21's fallow audit gate failure. The env-drift hypothesis from the original meta-state finding has been **refuted** (see `plans/reports/diagnostic-260629-pr-21-fallow-audit-gate-root-cause.md`); the actual gate failures are 4 `fallow/high-crap-score` findings + 1 `fallow/code-duplication` finding + a stale `dupes-baseline.json`. The SARIF upload-artifact step at `.github/workflows/test.yml:235-247` is intentionally **preserved** (high-value diagnostic capability).
>
> **Out of scope (deferred):** Evaluating the `fallow-rs/fallow@v2` action swap. That swap is orthogonal to the gate fix and is tracked as a separate follow-up plan.

## Overview

The CI SARIF from run 28358847609 revealed 5 distinct findings the gate correctly catches:

| # | Rule | Location | CRAP | Cyclomatic | Source |
|---|------|----------|------|------------|--------|
| 1 | `fallow/high-crap-score` | `core/evaluate-write-gate.js:61` `evaluateWriteGate` | 272.0 | 16 | **New in PR #21** (extracted from hooks) |
| 2 | `fallow/high-crap-score` | `core/evaluate-write-gate.js:25` `evaluatePreflight` | 42.0 | 6 | **New in PR #21** |
| 3 | `fallow/high-crap-score` | `core/evaluate-inbound-gate.js:52` `evaluateInboundGate` | 90.0 | 9 | **New in PR #21** |
| 4 | `fallow/high-crap-score` | `hooks/legacy/bash-gate.js:23` `main` | 72.0 | 8 | Pre-existing in legacy (but file touched by PR #21) |
| 5 | `fallow/code-duplication` | 8 lines, 2 instances (clone group) | — | — | Pre-existing |

Plus a stale `dupes-baseline.json` (18 entries, 0 matched current paths) that causes fallow to flag every current clone group as "new."

This plan fixes all 5 plus the stale baseline through 3 phases.

## Phases

| Phase | Name | Status | TDD Gate |
|-------|------|--------|----------|
| 1 | [Revert dead-weight step and regenerate dupes baseline](./phase-01-revert-dead-weight-step-and-regenerate-dupes-baseline.md) | Pending | YAML parses; regenerated baseline file matches current repo paths (sanity-check via `jq 'length' plans/.../dupes-baseline.json` returning a non-zero count and `jq -r '.[0]' plans/.../dupes-baseline.json` returning a path that exists) |
| 2 | [Fix or suppress high-crap-score findings in PR-touched files](./phase-02-fix-or-suppress-high-crap-score-findings-in-pr-touched-files.md) | Pending | Local `pnpm exec fallow audit --root tools/learning-loop-mastra --gate all --format sarif --output-file /tmp/audit.sarif` reports 0 high-crap-score findings in `core/evaluate-*.js`; per-file decision documented for the legacy file |
| 3 | [Verify gate exits 0 on fresh PR run](./phase-03-verify-gate-exits-0-on-fresh-pr-run.md) | Pending | PR #21 CI run completes with the `test` check passing (green); meta-state finding resolved with the green-run URL |

## Dependencies

- **Upstream:** `260629-1538-fallow-ci-env-drift-diagnostic` (completed; provides the SARIF upload-artifact step that surfaces the real cause).
- **Resolves:** `meta-260629T1450Z-pr-21-fallow-audit-gate-exits-1-in-ci-jobs-28352732928-28356` (currently `status=reported`, `subtype=audit-gate-stale-baseline` after the diagnostic patch).
- **Independent of:** `260628-1337-fallow-tool-integration-rule-encoding` (rule-encoding work, no shared files).
- **Downstream (deferred, separate plan):** Evaluating `fallow-rs/fallow@v2` action swap. Orthogonal to the gate fix.
- **Rules touched:** `rule-tool-integration-same-commit-dep` item 1 (same-commit-dependency) — verified N/A: no new `pnpm exec <tool>` is added; `pnpm exec fallow dupes --save-baseline` uses fallow which is already in devDependencies at `package.json:33`. Item 3 (baseline-storage) — N/A: regenerated baseline stays at the same `plans/.../reports/fallow/` path that already inherits plan gitignore.

## Acceptance Criteria

- [ ] `.github/workflows/test.yml` no longer contains the `pnpm --dir tools/learning-loop-mastra install --frozen-lockfile` step; the SARIF upload-artifact step is preserved
- [ ] `dupes-baseline.json` regenerated; file contains paths matching the current repo (sanity-check passes)
- [ ] 3 high-crap-score findings in PR-touched `core/evaluate-*.js` files are eliminated (via refactor OR a documented suppression with justification)
- [ ] The 1 high-crap-score finding in `hooks/legacy/bash-gate.js` is decided on: refactored, deleted, or excluded via `.fallowrc.json` ignorePatterns — with rationale documented in this plan or a follow-up journal
- [ ] PR #21 CI run `test` check passes (green)
- [ ] Meta-state finding `meta-260629T1450Z-...` resolves with the green-run URL as evidence
- [ ] Local test suite passes (`pnpm test`, currently 1369 tests)