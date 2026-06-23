---
phase: 1
title: "Setup and Audit"
status: pending
effort: "~15min"
---

# Phase 1: Setup and Audit

## Overview

Verify Plan 1 + Plan 2 closeout baselines + establish Plan 1a branch. Read-only audit; no code changes. Locks the starting point for Phases 2-9.

## Context Links

- `plans/260618-1911-phase-d-plan-1-workflows/plan.md` (Plan 1; D1/D2/D3 closed)
- `plans/260619-2246-phase-d-plan-2-storage/plan.md` (Plan 2; D5/D6 closed)
- `plans/reports/journal-260619-2246-phase-d-plan-2-shipped.md` (last closeout journal)
- `plans/reports/productization-260612-1530-master-tracker.md` (master tracker — Phase D section)

## Requirements

- **Functional:**
  - Confirm `pnpm test` exits 0 against current `main` (1083 pass / 0 fail / 1 skipped per Plan 2 closeout journal).
  - Confirm 8 `createWorkflow` wrappers + `createLoopWorkflow` factory exist.
  - Confirm `@mastra/libsql` 1.13.0 + `@libsql/client` are pinned in `tools/learning-loop-mastra/package.json`.
  - Confirm `data/mastra-memory.db` exists at `tools/learning-loop-mastra/data/`.
  - Branch created: `260622-1810-phase-d-plan-1a-parity-tightening` from `main`.
- **Non-functional:**
  - Audit completes in <15min; no test failures tolerated (Plan 1a is non-blocking by definition).

## Architecture

Read-only audit. Branch creation is the only state change. No design; this phase locks the starting point.

## Related Code Files

- **Modify:** none (audit only)
- **Create:** branch `260622-1810-phase-d-plan-1a-parity-tightening`
- **Delete:** none

## Implementation Steps

1. `git fetch origin && git status` — confirm clean working tree on `main`.
2. `git checkout -b 260622-1810-phase-d-plan-1a-parity-tightening` — create branch.
3. `pnpm test 2>&1 | tail -20` — confirm exit 0 baseline. (Expected: 1083 pass / 0 fail / 1 skipped.)
4. `ls tools/learning-loop-mastra/workflows/workflow-*.js | wc -l` — confirm 8 wrappers.
5. `ls tools/learning-loop-mastra/create-loop-workflow.js` — confirm factory exists.
6. `cat tools/learning-loop-mastra/package.json | jq '.dependencies | keys[] | select(. | startswith("@mastra"))'` — confirm `@mastra/libsql` pinned.
7. `ls tools/learning-loop-mastra/data/mastra-memory.db` — confirm storage file exists.
8. `cat meta-state.jsonl | jq -r 'select(.id | startswith("meta-260620T2108Z-when-code-is-modified-findings-anchored-to-file-paths-drift")) | .status'` — confirm drift finding is `active`.
9. `cat meta-state.jsonl | jq -r 'select(.id | startswith("meta-260622T1439Z")) | .id, .status'` — confirm both Plan-B-related findings are `reported` (not yet resolved).
10. If any step fails, halt; Plan 1a cannot ship on a broken baseline.

## Success Criteria

- [ ] Branch `260622-1810-phase-d-plan-1a-parity-tightening` exists.
- [ ] `pnpm test` exits 0 against `main` (1083 pass / 0 fail / 1 skipped).
- [ ] 8 `workflow-*.js` wrappers + `create-loop-workflow.js` factory exist.
- [ ] `@mastra/libsql` 1.13.0 pinned in `package.json`.
- [ ] `mastra-memory.db` exists.
- [ ] Drift finding status = `active`; Plan-B findings status = `reported`.

## Risk Assessment

- **Baseline test failure on `main`.** Risk: low (Plan 2 closeout journal reports 1083 pass / 0 fail). Mitigation: if baseline fails, halt Phase 1 and surface the regression to operator; Plan 1a does not own unrelated fixes.

## Next Steps

Phase 2: Deep-Equal Parity Tests (the first code-changing phase).