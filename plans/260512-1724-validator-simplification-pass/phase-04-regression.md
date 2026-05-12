---
phase: 4
title: "Regression"
status: complete
priority: P3
effort: "10m"
dependencies: [3]
---

# Phase 4: Regression

## Overview

Final `pnpm check`, confirm zero behavior delta vs Phase 1 baseline, single bundled commit on `main`.

## Requirements

- Functional: `pnpm check` exits 0; "Validated N records." count matches Phase 1 baseline exactly.
- Non-functional: single conventional commit on `main`; no force-push; no co-author / AI references in commit body.

## Architecture

Verification + commit. No code edits.

## Related Code Files

- None modified. Files touched in Phases 2-3 staged for commit:
  - Deleted: `tools/validate-records/generated-validation.js`
  - Deleted: `tools/validate-records/use-case-fixture-validation.js`
  - Modified: `tools/validate-records/validate-records.js`
  - Modified: `tools/validate-records/record-validation-rules.js`
  - Modified: `tools/validate-records/claim-verification-rules.js`

## Implementation Steps

1. Run `pnpm check`. Expect exit 0. Compare "Validated N records." count against Phase 1 baseline — must be identical.
2. Run `git status` to confirm exactly 5 affected paths (2 deleted, 3 modified).
3. Run `git diff --stat` to confirm net LoC delta ≈ −95 (28 + 59 + 8 + 4).
4. Stage all 5 paths: `git add tools/validate-records/`.
5. Commit with HEREDOC body:
   ```
   refactor(validator): collapse hand-rolls absorbed by AJV

   Post-AJV cleanup of tools/validate-records/. Pure internal refactor,
   no posture shift, no behavior change.

   - Delete generated-validation.js (orphan; no importers).
   - Delete use-case-fixture-validation.js + import/call from
     validate-records.js (fixtures/use-cases/ retired; validator was a
     guaranteed no-op).
   - Fold per-type description into recordLocalRoots config; delete
     allowedDescriptionFor() in record-validation-rules.js.
   - Collapse dimensionEntries() to Object.entries().filter() in
     claim-verification-rules.js.

   Net: -95 LoC across 5 files. pnpm check exit 0 pre and post,
   identical record count.

   Scout report: plans/reports/problem-solving-260512-1714-validate-records-simplification.md
   ```
6. Confirm commit lands cleanly. Do NOT push (user-driven push per CLAUDE.md commit/push protocol).

## Success Criteria

- [x] `pnpm check` exits 0
- [x] Record count matches Phase 1 baseline exactly
- [x] `git status` shows 2 deletions + 3 modifications, all under `tools/validate-records/`
- [x] Single commit on `main` with conventional `refactor(validator):` prefix
- [x] Commit body cites scout report path
- [x] No co-author / AI references in commit message

## Risk Assessment

- **Risk:** `pnpm check` regresses — most likely cause is a Phase 3 typo in description strings.
  - **Mitigation:** if `pnpm validate:records` fails on a negative-fixture substring, diff the new description against the old `allowedDescriptionFor` output and patch.
- **Risk:** stale generated docs (`records/index.generated.json` etc.) trip the validator.
  - **Analysis:** the only consumer that checked generated-doc staleness was `generated-validation.js`, which is being deleted. No new staleness risk introduced.
- **Risk:** push to `main` without user request.
  - **Mitigation:** stop at commit. Do not run `git push` unless user explicitly asks.
