---
title: 'Verify and capture env drift behind PR #21 fallow audit gate exit 1'
description: >-
  Two surgical edits to .github/workflows/test.yml to test the env-drift
  hypothesis from meta-state finding
  meta-260629T1450Z-pr-21-fallow-audit-gate-exits-1-in-ci-jobs-28352732928-28356
  and preserve CI SARIF output for any future drift regardless of root cause.
status: pending
priority: P2
issue: 21
branch: 260628-2008-phase-e-evaluator-refactor
tags:
  - ci
  - fallow
  - pr-21
  - meta-state-followup
  - diagnostic
blockedBy: []
blocks: []
created: '2026-06-29T08:09:11.020Z'
createdBy: 'ck:plan'
source: skill
---

# Verify and capture env drift behind PR #21 fallow audit gate exit 1

> **Scope:** This plan only covers the 2 minimal CI edits. The fallow-rs/fallow@v2 action swap discussed in the meta-state finding's session is explicitly out of scope and deferred to a separate follow-up plan — the swap would not address the env-drift root cause and bundling the two concerns obscures bisection.

## Overview

The meta-state finding (`meta-260629T1450Z-pr-21-fallow-audit-gate-exits-1-in-ci-jobs-28352732928-28356`) records that `fallow audit` exits 1 in PR #21's CI (jobs 28352732928, 28356182770) but exits 0 locally with the same flags. The visible CI log shows `"WARN node_modules directory not found. Run npm install / pnpm install first for accurate results."` twice (once for dead-code, once for duplication) — a warning that does NOT appear in local runs. Local SARIF has 0 results; the code fix in commit `c94f1ea` is locally clean (1369 tests pass).

The finding's author proposed 2 next-session investigation paths; this plan executes both:

| # | Change | Purpose |
|---|--------|---------|
| (a) | Add `pnpm --dir tools/learning-loop-mastra install --frozen-lockfile` before the fallow step | Verify the env-drift hypothesis (missing subdir `node_modules` symlink in CI). If correct, gate flips to 0 on the next PR run. |
| (b) | Add `actions/upload-artifact@v7` step that preserves `reports/fallow/audit.sarif` on failure | Capture the actual CI SARIF output regardless of outcome. Without this, only the truncated public log is available; the SARIF has full rule IDs and locations needed for diagnosis. |

Total diff: ~6 lines added, 0 removed, in a single file (`.github/workflows/test.yml`).

## Phases

| Phase | Name | Status | TDD Gate |
|-------|------|--------|----------|
| 1 | [Add subdir install + SARIF upload-artifact](./phase-01-add-subdir-install-sarif-upload-artifact.md) | Pending | Completed |

## Dependencies

- **Upstream:** PR #21 (current branch `260628-2008-phase-e-evaluator-refactor`).
- **Resolves:** `meta-260629T1450Z-pr-21-fallow-audit-gate-exits-1-in-ci-jobs-28352732928-28356` (status `reported`, expires 2026-06-30T07:50Z; on a successful gate flip, resolve with evidence-based note; on failure, update description with SARIF findings).
- **Independent of:** `260628-1337-fallow-tool-integration-rule-encoding` (rule encoding work, no shared files). `260627-2042-phase-e-dead-code-sweep` (shipped; provides baseline JSON files referenced by the fallow CLI flags).
- **Downstream (deferred, separate plan):** Evaluating `fallow-rs/fallow@v2` action swap — orthogonal to env drift; this plan's outcome does not depend on it.
- **Rules touched:** `rule-tool-integration-same-commit-dep` item 1 (same-commit-dependency) — verified N/A: `fallow` is already in root `package.json:33` devDependencies; no new `pnpm exec <tool>` is added in this change.

## Acceptance Criteria

- [ ] `.github/workflows/test.yml` has exactly 2 new steps and 0 modifications to existing steps
- [ ] `pnpm test` passes locally with no syntax error in the workflow YAML
- [ ] PR #21 CI run completes
- [ ] If gate exits 0: meta-state finding resolved via `meta_state_resolve` with the PR run URL as evidence
- [ ] If gate exits 1: SARIF artifact downloaded; finding description updated with the rule IDs that fired
- [ ] The SARIF upload step remains in the workflow regardless of outcome (proves future diagnostic capability)
