---
title: "AJV Schema Validation Swap"
description: "Replace hand-rolled validateSchema in tools/validate-records/record-validation-rules.js with AJV 2020 (strict:true, allErrors:true). Add UTC-Z pattern enforcement to 11 timestamp fields across 5 schemas. Normalize 27 records (23 datetime drift + 1 local-tz + 3 missing-required). Single posture shift: project stops owning JSON Schema validation grammar; ledger/claim-verification/source-ref rules remain hand-rolled."
status: completed
priority: P2
branch: "main"
tags: [tooling, posture-shift, validator, ajv, schema]
blockedBy: []
blocks: []
created: "2026-05-12T08:57:29.660Z"
createdBy: "ck:plan"
source: skill
---

# AJV Schema Validation Swap

## Overview

Single posture shift: project no longer owns a JSON Schema 2020-12 validator. Replaces hand-rolled `validateSchema` in `tools/validate-records/record-validation-rules.js` with AJV 2020 strict mode. Adds datetime UTC-Z pattern enforcement (`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$`) to 11 timestamp fields across all 5 schemas. Normalizes 27 records to comply: 23 with date-only `created_at`/`updated_at`, 1 with `+07:00` local-timezone form, 3 with missing required fields hidden by hand-rolled validator's `$ref` and nested-items silent-pass gaps.

Scope is hard-bound by `plans/reports/brainstorm-260512-1534-ajv-schema-validation-scope.md` and informed by `records/evidence/meta/ajv-dryrun-results-260512.md`. ID-pattern enforcement, source-ref uniqueness, `ajv-formats` add-on, and `additionalProperties:false` policy are explicitly out of scope.

## Context Links

- Brainstorm: `plans/reports/brainstorm-260512-1534-ajv-schema-validation-scope.md`
- Predecessor brainstorm: `plans/reports/brainstorm-260512-1357-parser-swap-ajv-deferral.md`
- Dry-run evidence: `records/evidence/meta/ajv-dryrun-results-260512.md`
- Predecessor plan (completed): `plans/260512-1410-yaml-parser-library-swap/`
- Filename convention decision (cited for scoping): `records/decisions/decision-260512T1321Z-artifact-timestamp-convention.yaml`
- Motivating drift event: commit `e2a82d6` (`feat(records): fix datetime format to UTC and add parser-swap evidence`)
- Hand-rolled validator (to be replaced): `tools/validate-records/record-validation-rules.js:5-30` (`validatePrimitive` + `validateSchema`)
- Throwaway dry-run (to be deleted in Phase 6): `tools/validate-records/ajv-dryrun.js`

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Baseline](./phase-01-baseline.md) | Completed |
| 2 | [Schema Edits](./phase-02-schema-edits.md) | Completed |
| 3 | [Record Normalization](./phase-03-record-normalization.md) | Completed |
| 4 | [Engine Swap](./phase-04-engine-swap.md) | Completed |
| 5 | [Regression](./phase-05-regression.md) | Completed |
| 6 | [Decision Promotion And Cleanup](./phase-06-decision-promotion-and-cleanup.md) | Completed |

## Dependencies

None blocking. `260512-1321-artifact-timestamp-convention` is functionally complete (all 4 phases done; plan-level status stale at `pending`) and is filename-scoped only — does not conflict with this plan's YAML-field-content edits. New AJV decision must explicitly note the scoping distinction.

## Out of Scope (Reaffirmed)

- ID-pattern enforcement on record `id` fields (no trigger met; existing filenames mix `YYYYMMDD` and `YYMMDDT` shapes; would require a separate ID-grammar decision).
- Source-ref uniqueness rules (`uniqueItems`, `minItems`).
- `ajv-formats` add-on (`format: date-time`); `pattern` regex chosen for hermeticity.
- `additionalProperties: false` across schemas (strict AJV mode is about schema-keyword cleanliness, not data extra-key rejection).
- Renaming any record filenames (governed by `decision-260512T1321Z-artifact-timestamp-convention`).
- Replacing `validateClaimVerification`, `validateSourceRefs`, `validateExperimentPacks`, `validateRecordReferences` — those remain hand-rolled (ledger/cross-record rules, not schema rules).

## Success Criteria (Plan-Level)

- `pnpm validate:records` exit 0 against all 35 records post-swap. Pre-swap exit 0 also expected; the swap is a no-op for records that already pass (8/34) and a normalization for 26/34.
- `pnpm check` exit 0 (validate + test suite).
- `tools/validate-records/record-validation-rules.js` no longer contains `validatePrimitive` or hand-rolled `validateSchema`. The `validateRecords` orchestrator + ledger/cross-ref helpers retained.
- `tools/validate-records/ajv-dryrun.js` deleted.
- Smoke-test artifact: hand-crafted temp record with `+07:00` timestamp is rejected by AJV (proves the new enforcement). Smoke artifact deleted after capture.
- New `decision-260512TNNNNZ-ajv-schema-validation-adoption.yaml` (status: approved) cites brainstorm, dry-run evidence, predecessor decision `20260510T172056Z-yaml-parser-library-swap`, motivating commit `e2a82d6`, and explicitly notes the YAML-field-content vs filename scoping nuance.
- Single focused commit on `main`.
