# AJV Schema Validation Swap

Date: 2026-05-12

## Summary

We stopped owning JSON Schema grammar in `tools/validate-records/record-validation-rules.js`. The hand-rolled `validatePrimitive` / `validateSchema` path was replaced with AJV 2020 in strict mode, while source-ref, pack, claim-verification, and cross-record rules stayed project-owned.

## Changes

- Added AJV 2020 as the schema validator dependency.
- Added UTC-Z timestamp patterns to all record schemas for `created_at`, `updated_at`, and claim `approval.reviewed_at`.
- Normalized existing timestamp field values to `YYYY-MM-DDTHH:MM:SSZ`.
- Fixed AJV-surfaced missing required fields in one claim product block and two experiment proof entries.
- Updated negative fixture expectations to AJV-native path/keyword messages.
- Added a permanent bad-timestamp negative fixture for UTC-Z regression coverage.
- Promoted `decision-260512T0944Z-ajv-schema-validation-adoption`.
- Deleted the throwaway AJV dry-run script after adoption.

## Validation

- `pnpm validate:records` passes with 35 records.
- `pnpm check` passes.
- Temporary `+07:00` smoke record failed with `/created_at pattern`, then was removed.
- Code review found a process-global validator-cache bug; fixed with a `WeakMap` keyed by schema object identity.
- Code review found broad negative-fixture assertions; fixed with path-specific AJV substrings and normalized fixture timestamps.

## Notes

Filename timestamp conventions remain separate from YAML field-content validation. Some historical filenames still trigger non-blocking convention warnings; this change intentionally did not rename records.

Docs impact: none. Operator commands unchanged.
