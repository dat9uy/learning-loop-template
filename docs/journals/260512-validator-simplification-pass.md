# Validator Simplification Pass

Date: 2026-05-12

## Summary

Completed post-AJV cleanup for `tools/validate-records/`.

## Changes

- Deleted orphan `generated-validation.js`.
- Deleted retired `use-case-fixture-validation.js` and removed its entry-point import/call.
- Folded local-source allowlist descriptions into `recordLocalRoots`.
- Removed `allowedDescriptionFor()`.
- Collapsed `dimensionEntries()` to `Object.entries(...).filter(...)`.

## Validation

- Baseline `pnpm check`: exit 0, `Validated 35 records.`
- Final `pnpm check`: exit 0, `Validated 35 records.`
- Tester agent: DONE.
- Code reviewer: DONE, no blocking issues.

## Notes

- Existing timestamp warnings remain warnings only.
- Historical `decision_effect.affected_refs` still mentions a deleted validator path; left as archival ledger context.

## Unresolved Questions

- Should `decision_effect.affected_refs` eventually validate local path existence, or stay historical-only?
