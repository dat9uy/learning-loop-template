---
phase: 2
title: "Dead Code Removal"
status: complete
priority: P3
effort: "15m"
dependencies: [1]
---

# Phase 2: Dead Code Removal

## Overview

Delete two orphan files and prune their references from the validator entry point. Covers Cascades 1 and 2 from the scout report.

## Requirements

- Functional: `generated-validation.js` and `use-case-fixture-validation.js` removed from disk; `validate-records.js` no longer references them; `pnpm validate:records` exit 0.
- Non-functional: no other tooling under `tools/` references the deleted files (verified in Phase 1).

## Architecture

Two independent removals, both pure deletion:
1. `generated-validation.js` — orphan since predecessor refactor moved doc-generation out; exports `normalizedIndex` and `validateGeneratedFiles`, neither imported anywhere.
2. `use-case-fixture-validation.js` — silent no-op because `fixtures/use-cases/` does not exist. User confirmed use-cases retired (not reviving via schema).

## Related Code Files

- Delete:
  - `tools/validate-records/generated-validation.js`
  - `tools/validate-records/use-case-fixture-validation.js`
- Modify:
  - `tools/validate-records/validate-records.js` — drop line 10 import, drop line 127 call

## Implementation Steps

1. `rm tools/validate-records/generated-validation.js`
2. `rm tools/validate-records/use-case-fixture-validation.js`
3. Edit `tools/validate-records/validate-records.js`:
   - Remove line 10: `import { validateUseCaseFixtures } from "./use-case-fixture-validation.js";`
   - Remove line 127: `errors.push(...validateUseCaseFixtures(root));`
4. Run `pnpm validate:records` standalone. Expect exit 0 + same "Validated N records." count as baseline.
5. Run `pnpm test` standalone. Expect exit 0.
6. Optional: `grep -rn "use-case-fixture\|generated-validation" tools/` returns no hits.

## Success Criteria

- [x] Both files removed from `tools/validate-records/`
- [x] `validate-records.js` no longer imports `validateUseCaseFixtures`
- [x] `validate-records.js` no longer calls `validateUseCaseFixtures(root)` in `main()`
- [x] `pnpm validate:records` exit 0; record count matches baseline
- [x] `pnpm test` exit 0

## Risk Assessment

- **Risk:** a downstream tool (e.g. `tools/generate-docs/`) imports `normalizedIndex` via a path the Phase 1 grep missed.
  - **Mitigation:** Phase 1 grep covers `--include="*.js" --include="*.json" --include="*.cjs"` at repo root. If a hit surfaces post-deletion, restore the file and re-scope.
- **Risk:** docs reference the deleted validator. Mitigation: `grep -rn "use-case-fixture\|generated-validation" docs/` — if hits, update or note in commit body.
