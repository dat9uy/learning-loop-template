---
phase: 5
title: "Regression"
status: completed
priority: P1
effort: "30m"
dependencies: [4]
---

# Phase 5: Regression

## Overview

Verify end-to-end green state post-swap: all 35 records validate after decision promotion, full `pnpm check` passes, negative fixtures in `validate-records.js` still detect the bad shapes they were designed to catch (their error-substring assertions updated to AJV-native text), and a smoke-test artifact proves the new UTC-Z pattern rejects `+07:00` form. Smoke artifact deleted after capture.

## Requirements

- Functional: `pnpm validate:records` exit 0, prints `Validated 35 records.` after decision promotion
- Functional: `pnpm check` exit 0 (validator + tests + any lint hooks the script chains).
- Functional: `runNegativeFixtures` (in `validate-records.js`) continues to detect every bad fixture it was designed for; assertions updated where AJV phrases the same problem differently.
- Functional: smoke-test — a hand-crafted record with `created_at: "2026-05-12T00:46:00+07:00"` is rejected by AJV with a `pattern` keyword error. Captured to terminal output only; artifact file deleted post-capture.
- Non-functional: zero record changes in this phase (Phase 3 normalized all 27). Zero engine changes (Phase 4 already swapped). This phase is purely verification + test-assertion updates.

## Architecture

### Negative-fixture assertion updates

`tools/validate-records/validate-records.js` runs `runNegativeFixtures` against `tools/validate-records/fixtures/` — directories named `missing-id`, `bad-type`, etc. Each expects a specific error substring. Hand-rolled output `"id is required"` becomes AJV `"must have required property 'id'"`. Map old → new per fixture:

| Fixture | Legacy substring | AJV substring |
|---|---|---|
| `missing-id` | `id is required` | `must have required property 'id'` |
| `bad-type` | `type must be one of` | `must be equal to one of the allowed values` |
| `missing-created-at` | `created_at is required` | `must have required property 'created_at'` |
| `bad-timestamp` (new) | n/a | `must match pattern` |

If `validate-records.js` doesn't currently have a `bad-timestamp` fixture, optionally add one (a record with `created_at: "2026-05-08"`) as a guard against future regression of the pattern enforcement. **Out of scope if there's no existing fixture-add helper** — Phase 5 is verification, not new test infrastructure.

### Smoke-test workflow

1. Create `/tmp/ajv-smoke-record.yaml` with shape matching `experiment.schema.json` minimum-required fields, but with `created_at: "2026-05-12T00:46:00+07:00"`.
2. Temporarily place it in `records/experiments/` OR pass a CLI flag if `validate-records.js` supports a single-file mode (it doesn't — uses `loadRecords` over the full tree).
3. Simpler: copy `/tmp/ajv-smoke-record.yaml` into `records/experiments/experiment-smoke-tz-rejection.yaml`, run `pnpm validate:records`, observe AJV error mentioning `pattern`, then `rm records/experiments/experiment-smoke-tz-rejection.yaml`. No commit. Net diff zero.

### Test-suite scan

```bash
grep -rn "is required" tools/**/*.test.js tools/**/*.js 2>/dev/null
```

Update any test assertions that bake in legacy error format. Likely zero hits outside the fixture-runner code path, since the codebase is small.

## Related Code Files

- Modify: `tools/validate-records/validate-records.js` — update `runNegativeFixtures` expected-error substrings if any exist.
- Modify (transient): create + delete `records/experiments/experiment-smoke-tz-rejection.yaml`.
- No schema or production-record changes in this phase.

## Implementation Steps

1. Run `pnpm validate:records`. Expected: exit 0. If failing, diagnose: was Phase 3 missed for any record? Is a schema pattern typo'd? Is a record's `recordForValidation` shape different from what AJV expects?
2. Run `pnpm check`. Expected: exit 0. If failing, inspect: test assertion mismatch on error strings → update per the substring table.
3. `grep -rn "is required" tools/` to find any test or code path asserting legacy text. Update assertions to AJV-native phrasing.
4. Create smoke-test file `records/experiments/experiment-smoke-tz-rejection.yaml` with minimum experiment schema + `created_at: "2026-05-12T00:46:00+07:00"` + `updated_at: "2026-05-12T00:46:00Z"` (only the field-under-test should be bad).
5. Run `pnpm validate:records`. Expected: exit 1, error message contains `pattern` and the smoke filename.
6. `rm records/experiments/experiment-smoke-tz-rejection.yaml`. Confirm with `git status` that no untracked files remain from smoke test.
7. Run `pnpm validate:records` one final time. Expected: exit 0, `Validated 35 records.` after decision promotion.
8. Run `pnpm check` one final time. Expected: exit 0. Phase 5 green.

## Success Criteria

- [ ] `pnpm validate:records` exit 0 with `Validated 35 records.` before the new decision is promoted.
- [ ] `pnpm check` exit 0.
- [ ] Smoke-test record produced AJV `pattern` rejection (captured in terminal; file deleted).
- [ ] No legacy `is required` substring assertions remain in test code.
- [ ] `git status` clean of smoke artifacts (no new files, no modifications to records/).
- [ ] Phase 1 baseline diff: expected record count increase from 34 to 35 after decision promotion, same orchestrator wiring, expected error-format change only.

## Risk Assessment

- **Risk**: `runNegativeFixtures` not actually run by `pnpm check` (only by `pnpm validate:records` or a separate command). **Mitigation**: read `validate-records.js` to confirm the fixture loop is in the default entrypoint; if not, ensure both commands exit 0.
- **Risk**: smoke-test record is accidentally committed. **Mitigation**: explicit step 6 `rm` + `git status` check before phase completion.
- **Risk**: a record passes AJV but fails one of the retained hand-rolled helpers (`validateClaimVerification`, etc.) due to subtle interaction. **Mitigation**: the retained helpers operate on raw record objects post-AJV-success; if any fail, the issue exists today and is unrelated to the swap — investigate separately.
- **Risk**: `pnpm check` runs a TypeScript or lint step that flags `validator.errors` typing. **Mitigation**: AJV ships its own `.d.ts`; `validator.errors` is typed as `ErrorObject[] | null`. If lint complains, narrow with `if (validator.errors)` before iterating.
- **Risk**: scope creep — reviewer wants to add a `bad-timestamp` fixture directory. **Out of scope**: only update existing fixture assertions; new fixtures are a separate hardening task.
