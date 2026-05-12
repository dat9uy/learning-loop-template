---
phase: 1
title: "Baseline"
status: complete
priority: P3
effort: "10m"
dependencies: []
---

# Phase 1: Baseline

## Overview

Capture pre-state evidence: confirm `pnpm check` green, confirm zero importers of the files being deleted, record the validator's "Validated N records." line for after/before comparison.

## Requirements

- Functional: pre-state proof that nothing imports `generated-validation.js` or `use-case-fixture-validation.js` outside `validate-records.js`.
- Non-functional: artifacts are throwaway (terminal output captured to plan memory or commit message); no new files on disk.

## Architecture

Pure observation phase. Three commands, capture output.

## Related Code Files

- Read (no modification):
  - `tools/validate-records/validate-records.js`
  - `tools/validate-records/generated-validation.js`
  - `tools/validate-records/use-case-fixture-validation.js`
  - `tools/validate-records/record-validation-rules.js`
  - `tools/validate-records/claim-verification-rules.js`

## Implementation Steps

1. Run `pnpm check` from repo root. Confirm exit 0. Note the "Validated N records." line.
2. Run `grep -rn "generated-validation\|normalizedIndex\|validateGeneratedFiles" --include="*.js" --include="*.json" --include="*.cjs" .` from repo root. Expect zero hits outside `tools/validate-records/generated-validation.js` itself.
3. Run `grep -rn "use-case-fixture-validation\|validateUseCaseFixtures" --include="*.js" --include="*.json" .` from repo root. Expect hits only in `validate-records.js:10` and `validate-records.js:127` and the file itself.
4. Run `grep -rn "recordLocalRoots\|allowedDescriptionFor" tools/` to confirm both symbols are module-private. Expect hits only in `record-validation-rules.js`.
5. Confirm `fixtures/use-cases/` does not exist: `test ! -d fixtures/use-cases && echo confirmed`.

## Success Criteria

- [x] `pnpm check` exits 0; baseline "Validated 35 records." count noted
- [x] `generated-validation.js` has zero external importers (grep clean)
- [x] `use-case-fixture-validation.js` referenced only from `validate-records.js`
- [x] `recordLocalRoots` and `allowedDescriptionFor` are module-private
- [x] `fixtures/use-cases/` confirmed absent

## Risk Assessment

- Grep miss (uppercase / unusual quoting / dynamic import). Mitigation: run all three greps; if any unexpected hit, abort and re-scope before Phase 2.
