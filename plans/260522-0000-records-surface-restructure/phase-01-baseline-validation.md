---
phase: 1
title: "Baseline & Pre-Migration Validation"
status: pending
priority: P1
effort: "15m"
dependencies: []
---

# Phase 1: Baseline & Pre-Migration Validation

## Overview

Establish a clean baseline by running all validation and test commands on current `main`. Capture output for comparison post-migration. Any failures at baseline must be fixed before migration starts. Also perform pre-flight cleanup.

## Requirements

- Functional: All checks pass before any files are touched.
- Non-functional: Baseline output saved for diff comparison.
- Non-functional: Placeholder dirs removed before phase 3 tool updates.

## Related Code Files

- Read: `package.json` (scripts)
- Read: `tools/validate-records/validate-records.js`
- Read: `tools/extract-index/extract-index.js`
- Delete: `records/backlog-items/`, `records/validation-gates/` (remove in this phase to prevent surface discovery from ingesting them)

## Implementation Steps

1. **Pre-flight cleanup**:
   ```bash
   git rm -r records/backlog-items/ records/validation-gates/
   ```

2. Run `pnpm check` (runs `generate:capabilities --dry-run`, `validate:records`, AND full test suite). Capture stdout/stderr.
3. Run `pnpm extract:index`. Capture stdout/stderr. Note any existing index entries.
4. Run full test suite: `npm test` or `pnpm test`. Capture results.
5. Run `git status` to confirm clean working tree.
6. Save baseline outputs to `plans/260522-0000-records-surface-restructure/baseline/`.
7. **Pre-flight inventory**:
   ```bash
   find records -type f -not -name '.gitkeep' | sort > plans/260522-0000-records-surface-restructure/baseline/pre-migration-manifest.txt
   wc -l plans/260522-0000-records-surface-restructure/baseline/pre-migration-manifest.txt
   ```

## Tests Before

- Baseline IS the test. If any command fails, stop and fix.

## Refactor

- None. This phase is read-only except for placeholder dir deletion.

## Tests After

- All baseline commands pass.
- Placeholder dirs no longer exist.

## Success Criteria

- [ ] `pnpm check` exits 0
- [ ] `pnpm extract:index` exits 0 (or produces expected output)
- [ ] Full test suite passes (0 failures)
- [ ] `git status` shows no uncommitted changes on main (except deleted placeholder dirs)
- [ ] Baseline outputs saved for post-migration comparison
- [ ] Pre-migration manifest saved with accurate file count
- [ ] `records/backlog-items/` and `records/validation-gates/` removed

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Baseline already has failing tests | Fix before migration. Do not proceed with broken baseline. |

## Regression Gate

```bash
pnpm check && pnpm extract:index && npm test
```
