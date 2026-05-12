---
phase: 3
title: "Record Normalization"
status: completed
priority: P1
effort: "60m"
dependencies: [2]
---

# Phase 3: Record Normalization

## Overview

Normalize 27 records to comply with the strict UTC-Z pattern and fill the 3 missing-required fields surfaced by AJV's `$ref`/nested-items recursion. Hand-rolled validator still active in this phase — these record edits land BEFORE the engine swap so Phase 4 transitions cleanly.

## Requirements

- Functional: 23 records with date-only `created_at`/`updated_at` normalized to `YYYY-MM-DDT00:00:00Z` (UTC midnight on the existing date).
- Functional: 1 record with `+07:00` form normalized to canonical UTC equivalent.
- Functional: 3 records with missing required fields filled.
- Functional: any record where `created_at` and `updated_at` were ALSO present in the filename with explicit `Thhmmss` MAY use the filename's time component for higher fidelity (e.g. filename `decision-20260509T070411Z-...` → field `2026-05-09T07:04:11Z`). Optional refinement; date-midnight is the default.
- Non-functional: no record body content edits beyond the listed fields; preserve all other metadata, notes, source_refs.

## Architecture

### Date-only normalization rule

- `"YYYY-MM-DD"` → `"YYYY-MM-DDT00:00:00Z"` by default.
- If the record's filename contains an explicit `Thhmmss[Z]` segment matching the date, use that: `"YYYY-MM-DDThh:mm:ssZ"`. Higher fidelity for the records that filename-encoded their authoring minute.

### Local-tz conversion rule

- `experiment-meta-install-template-candidate-260512T0046Z.yaml` has both `created_at` and `updated_at` as `"2026-05-12T00:46:00+07:00"`. Convert to UTC: subtract 7 hours → `"2026-05-11T17:46:00Z"`. The filename's `260512T0046Z` is wrong (the wall-clock minute, not UTC), but renaming the filename is out of scope per `decision-260512T1321Z`. Note this inconsistency in the new AJV decision's `notes` field.

### Required-field fills

| Record | Path | Action |
|---|---|---|
| `records/claims/claim-vnstock-runtime-403-root-cause.yaml` | `verification.product.decision_refs` | Add field. If product block was added speculatively without an approved decision, set `decision_refs: []` and re-evaluate whether `verification.product.status` should be `claimed` (matches empty array) or whether the block should be deleted. Authoring judgement required. |
| `records/experiments/experiment-vnstock-capabilities-20260509T174957Z.yaml` | `verification.proves[0].output_level` | Add value from the enum `["none", "docs-only", "metadata-only", "runtime-captured", "product-code"]`. Inspect the experiment's `output_level` top-level field and copy if present, else `metadata-only` as the conservative default. |
| `records/experiments/experiment-vnstock-install-20260509T071900Z-sandbox-2.yaml` | `verification.proves[0].output_level` | Same logic as above. |

### Full record list (23 datetime drift)

Captured from dry-run evidence:

- `records/claims/claim-product-fastapi-reference.yaml`
- `records/claims/claim-product-tanstack-reference-view.yaml`
- `records/claims/claim-vnstock-device-limit-mechanism.yaml`
- `records/claims/claim-vnstock-install-sandbox.yaml`
- `records/claims/claim-vnstock-runtime-403-root-cause.yaml`
- `records/experiments/experiment-meta-install-template-candidate-260512T0046Z.yaml` (also local-tz)
- `records/experiments/experiment-operator-product-shape-walkthrough-260511T1900Z.yaml`
- `records/experiments/experiment-product-build-fastapi-reference-20260511T003000Z.yaml`
- `records/experiments/experiment-product-build-tanstack-reference-20260511T003000Z.yaml`
- `records/experiments/experiment-product-dev-gate-removal-260512T0007Z.yaml`
- `records/experiments/experiment-vnstock-capabilities-20260509T174957Z.yaml`
- `records/experiments/experiment-vnstock-install-20260508T101723Z.yaml`
- `records/experiments/experiment-vnstock-install-20260508T171112Z.yaml`
- `records/experiments/experiment-vnstock-install-20260509T071800Z-sandbox-1.yaml`
- `records/experiments/experiment-vnstock-install-20260509T071900Z-sandbox-2.yaml`
- `records/experiments/experiment-vnstock-runtime-403-fix-20260511T143500Z.yaml`
- `records/decisions/decision-20260508-loop-dimension-model.yaml`
- `records/decisions/decision-20260509T070411Z-vnstock-vendor-device-limit-clearance.yaml`
- `records/decisions/decision-20260509T192448Z-experiment-result-convention.yaml`
- `records/decisions/decision-20260509T192449Z-prospective-convention-application.yaml`
- `records/decisions/decision-20260511T003000Z-product-approval-vnstock-reference-slice.yaml`
- `records/decisions/decision-260512T0046Z-loop-meta-evidence-gap-revisit.yaml`
- `records/risks/risk-20260508-loop-dimension-model-transition.yaml`
- `records/risks/risk-vnstock-external-installer.yaml`
- `records/capabilities/capability-fastapi-reference-rest.yaml`
- `records/capabilities/capability-tanstack-reference-render.yaml`

Plus claims with `approval.reviewed_at` drift: same date-only normalization rule.

## Related Code Files

- Modify: 27 record files listed above (or 26 unique — one record has both datetime drift and local-tz; one record has both datetime drift and missing-required).

## Implementation Steps

1. For each of the 23 datetime-drift records: apply date-only → `T00:00:00Z` normalization to `created_at`, `updated_at`, and `claim.approval.reviewed_at` where present. Optionally use filename-time for records with explicit `Thhmmss` in filename.
2. Convert `experiment-meta-install-template-candidate-260512T0046Z.yaml` `+07:00` timestamps to UTC equivalents.
3. Fill required fields in the 3 records per the table above. For `claim-vnstock-runtime-403-root-cause.yaml`, decide between filling `decision_refs: []` or deleting the empty `verification.product` block — read the record's full verification block before deciding.
4. Run `node tools/validate-records/ajv-dryrun.js`. Expected: all 34 records pass (exit 0).
5. Run `pnpm validate:records`. Expected: exit 0 (hand-rolled validator still active, sees no problem).
6. Run `pnpm check`. Expected: exit 0.

## Success Criteria

- [ ] All 23 datetime-drift records have `created_at`/`updated_at` in canonical `YYYY-MM-DDTHH:MM:SSZ` form.
- [ ] `experiment-meta-install-template-candidate-260512T0046Z.yaml` timestamps in UTC (no `+07:00`).
- [ ] 3 missing-required records fixed (added field or removed empty block).
- [ ] `node tools/validate-records/ajv-dryrun.js` exit 0.
- [ ] `pnpm validate:records` exit 0.
- [ ] `pnpm check` exit 0.

## Risk Assessment

- **Risk**: filename-time-match heuristic produces wrong time for records where filename is `T070411Z` UTC but field was date-only intended as "any time during 2026-05-09." **Mitigation**: default to `T00:00:00Z`. Filename-match is opt-in only when reviewer is confident.
- **Risk**: deleting an empty `verification.product` block accidentally removes intended-but-incomplete authoring intent. **Mitigation**: prefer fill-with-`[]` over delete; flag for human review in the new AJV decision's `notes`.
- **Risk**: `claim.approval.reviewed_at` drift not surfaced if `approval` block is missing entirely from a record. **Mitigation**: dry-run script already validates per record; if `reviewed_at` not present, pattern doesn't apply (it's a property keyword, not required at top level).
- **Risk**: 27 file edits is a lot of mechanical churn; risk of YAML formatting drift (quotes, spacing). **Mitigation**: use `Edit` with tight `old_string` matching only the affected line; avoid bulk sed.
- **Risk**: scope creep — reviewer wants to also normalize `notes` field timestamps or other free-form date strings. **Out of scope**: only schema-required `created_at`/`updated_at`/`approval.reviewed_at` are touched.
