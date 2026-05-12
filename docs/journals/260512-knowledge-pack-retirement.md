# Knowledge-Pack Lane Retirement

## Summary

Retired the `knowledge-packs/` lane as an active concept. The work landed as a superseding ledger decision plus an atomic cleanup bundle covering validator code, schemas, records, fixtures, operator docs, and project-local learning-loop skill guidance.

## Decisions

- Added `decision-260512T1316Z-knowledge-pack-retirement`, which supersedes `decision-20260510T174640Z-knowledge-pack-lane-deferral`.
- Left the May-10 deferral decision at `status: draft`; the supersedes link is the disposition signal.
- Preserved historical records, evidence, journals, and plan text that mention packs as audit trail.

## Implementation Notes

- Deleted pack-specific validator/docgen modules and removed pack plumbing from record validation and claim verification.
- Dropped `pack:` from all `source_refs` schema patterns.
- Removed `knowledge_pack_ids` from the experiment schema, active experiment records, and remaining non-pack negative fixtures.
- Deleted `knowledge-packs/` and pack-only negative fixtures.
- Added `fixtures/negative/retired-pack-source-ref/` so `pack:` rejection stays explicitly covered.
- Removed active pack guidance from README, operator docs, red-team docs, and learning-loop skill references.

## Validation

- `pnpm validate:records` passed with 37 records.
- `pnpm check` passed with 37 records and the existing timestamp warnings.
- Tester agent reported `DONE_WITH_CONCERNS`; concern was non-blocking timestamp cleanup debt.
- Code reviewer reported `DONE_WITH_CONCERNS`; the retirement-specific fixture gap was fixed.

## Follow-Up

- Historical record prose still contains pack mentions where it documents past decisions or experiment outcomes. Leave as audit trail unless a future approved historical-normalization plan says otherwise.
