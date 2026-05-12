# Source-Ref URI Pattern Schema Adoption

Date: 2026-05-12

## Summary

Completed Cascade 5 of validator simplification: AJV now owns the source-ref URI prefix grammar for records.

## Changes

- Added `^(local|record|pack|legacy):.+` to `source_refs.items` in the 5 record schemas.
- Removed the hand-rolled unsupported-prefix catchall from `validateSourceRefs`.
- Removed the hand-rolled empty `pack:` length check from `validateSourceRefs`.
- Updated `unsupported-source-ref` and `malformed-pack-ref` negative fixtures to assert AJV pattern wording.
- Added `decision-260512T1915Z-source-ref-uri-pattern-adoption`.

## Validation

- Baseline `pnpm check`: exit 0, `Validated 35 records.`
- Final `pnpm check`: exit 0, `Validated 36 records.`
- Probe confirmed both affected fixtures emit `/source_refs/0 pattern: must match pattern "^(local|record|pack|legacy):.+"`.
- Tester agent: DONE.
- Code reviewer: DONE, no blocking issues.

## Notes

- `validateSourceRefs` still owns ledger semantics: `legacy:` gate, `local:` realpath/allowlist, and `record:` existence.
- `pack:` source refs remain no-op parity after schema grammar accepts a non-empty suffix.
- Existing timestamp warnings remain warnings only.

## Unresolved Questions

- Should `pack:` source_refs eventually get existence/status validation, or stay out of scope until pack-file schema work?
