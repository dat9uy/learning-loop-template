# YAML Parser Wording Decoupling

**Date**: 2026-05-12 15:01
**Severity**: Medium
**Component**: YAML validation and claim verification
**Status**: Resolved

## Summary

We finished the follow-up to the YAML parser swap by killing the last wording leak. Negative fixture checks now key off project-owned parse kinds instead of `yaml@2.x` text, and `verify-claim` scalar rules have a real regression test instead of a manual smoke.

## Changes

- Wrapped YAML parse failures in `RecordParseError` with `kind: "yaml-syntax"` in `tools/validate-records/yaml-parse-wrapper.js`.
- Updated negative fixture validation in `tools/validate-records/validate-records.js` to assert parse kind, not upstream error phrasing.
- Added `node --test` coverage for `assertWritablePlainString` in `tools/claim-verification/verify-claim-scalar-rules.test.js`.
- Updated `package.json` so `pnpm check` runs both record validation and the test suite.

## Validation

- `pnpm check` passed.
- Existing timestamp warnings from filename validation remained warnings; they did not block the run.
- The scalar test covers accepted plain strings and rejects YAML-special syntax with project-owned wording.

## Review Notes

Code review was right to call out the wording leak in `verify-claim`. Letting parser phrasing escape through validation would have made the CLI depend on upstream text again, which is exactly the mess we were trying to remove. The wrapper is the cleaner choice: project owns the contract, YAML owns the parse.

## Unresolved Questions

None.
