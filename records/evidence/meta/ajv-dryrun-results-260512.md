---
record_type: evidence
capability: meta
dimension: static
scope: meta-tooling
validation_status: passed
claim_support: supports
created: "2026-05-12T00:00:00Z"
id: evidence-meta-ajv-dryrun-results-260512
title: AJV strict dry-run results against current schemas and records
date: "2026-05-12"
summary: Empirical results of running AJV 2020 strict:true allErrors:true against 5 schemas + 34 records with proposed datetime UTC-Z pattern injected on created_at/updated_at/reviewed_at. Surfaces both expected datetime drift and three previously-silent-pass required-property gaps.
source_refs:
  - local:plans/reports/brainstorm-260512-1534-ajv-schema-validation-scope.md
  - local:plans/reports/brainstorm-260512-1357-parser-swap-ajv-deferral.md
  - record:decision-260512T1321Z-artifact-timestamp-convention
---

# AJV Dry-Run Results

## Findings

- [ajv-validation] AJV strict mode found 26 failures across 34 records: 23 date-only timestamps, 1 local-timezone form, 3 missing required fields.
- [datetime-format] Historical date-only `created_at` forms are valid per prospective-application principle; only local-timezone forms are the drift trigger.
- [silent-pass-gap] Three real data-quality gaps surfaced: missing `decision_refs` in product verification, missing `output_level` in two experiment `verification.proves` blocks.
- [recommendation] Loose datetime pattern `^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}Z)?$` + fix 4 affected records is minimum-blast-radius change.
- [prospective-only] New records should use strict UTC-Z; historical records preserved per artifact-timestamp-convention decision.

## Method

Throwaway `tools/validate-records/ajv-dryrun.js` (deleted after evidence captured). Loaded the 5 production schemas; injected `pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$"` on `created_at`, `updated_at`, and `claim.approval.reviewed_at` in-memory. Compiled with `Ajv2020({ strict: true, allErrors: true })`. Validated all 34 records via existing loader.

## Headline Numbers

- Total records: 34
- Passed: 8
- Failed: 26

## Failure Categorization

### Category 1: Datetime drift (23 records)

Most records use ISO date-only form `"2026-05-08"` or `"2026-05-11"` for `created_at`/`updated_at`. This is NOT what the prior brainstorm assumed. The artifact-timestamp-convention decision (`decision-260512T1321Z-artifact-timestamp-convention`) governs FILENAME format only; it explicitly says "Retroactively rename existing pre-convention artifacts" is a `blocked_action`. The YAML field `created_at` has never had an explicit format rule, so date-only forms are the historical norm.

Examples:
- `decision-20260508-loop-dimension-model.yaml`: `created_at: "2026-05-08"`
- `claim-product-fastapi-reference.yaml`: `created_at: "2026-05-11"`, `reviewed_at: "2026-05-11"`
- `risk-vnstock-external-installer.yaml`: `created_at: "2026-05-08"`

### Category 2: Local-timezone form (1 record)

Exactly the drift the trigger was meant to prevent.

- `experiment-meta-install-template-candidate-260512T0046Z.yaml`: `created_at: "2026-05-12T00:46:00+07:00"`

### Category 3: Silent-pass closing — missing required fields (3 records)

AJV honoring `$ref` and nested `items.required` (which the hand-rolled validator silently skips) surfaces three real data-quality gaps:

- `claim-vnstock-runtime-403-root-cause.yaml`: `/verification/product` missing required `decision_refs` (per `claim.schema.json` $defs.product_dimension).
- `experiment-vnstock-capabilities-20260509T174957Z.yaml`: `/verification/proves/0` missing required `output_level`.
- `experiment-vnstock-install-20260509T071900Z-sandbox-2.yaml`: `/verification/proves/0` missing required `output_level`.

### Passing records (8)

The 8 records that pass clean already use canonical UTC-Z timestamps (e.g. `decision-20260510T174640Z-knowledge-pack-lane-deferral.yaml` with `"2026-05-10T17:46:40Z"`) AND have complete required-property fills. Mostly recent records authored after operator convention tightened.

## Implications For Plan

The original brainstorm assumed `e2a82d6` had normalized all timestamps. Reality: `e2a82d6` only touched 2 specific records. The corpus has 23 records with date-only `created_at`/`updated_at`, governed by the prospective-application principle in the artifact-timestamp-convention decision.

Strict UTC-Z pattern as originally drafted would require retro-rewriting 23 records, which the convention's `blocked_actions` forbids. This argues for one of:

1. **Loosen pattern to accept date-only OR UTC-Z, reject local-timezone**: `^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}Z)?$`. Captures the actual drift trigger (local-tz form) while honoring historical date-only records. Reduces post-swap fix scope to 4 records (1 local-tz + 3 required-fields).

2. **Strict pattern + retro-normalize 23 records**: Violates the timestamp-convention's prospective spirit; ~25-line diff per record front-matter; large commit.

3. **Schema-version discriminator**: Bump `schema_version` to "1.1" with strict pattern; old records remain on "1.0" with no pattern. AJV `if/then/else` keyword needed. Adds complexity for marginal benefit.

The 3 missing-required-field failures (Category 3) are real data bugs and should be fixed regardless of which datetime path is chosen.

## Recommendation

Loose pattern (Option 1) + fix the 4 affected records in the swap commit:
- Update `experiment-meta-install-template-candidate-260512T0046Z.yaml` timestamps to UTC-Z.
- Add `decision_refs` to `claim-vnstock-runtime-403-root-cause.yaml` `verification.product` (or drop the empty `product` block).
- Add `output_level` to `experiment-vnstock-capabilities-*` and `experiment-vnstock-install-...-sandbox-2.yaml` `verification.proves[0]`.

Rationale: minimum-blast-radius change. The trigger (`commit e2a82d6` motivating "no more +07:00 forms") is still met. Historical date-only records are preserved per convention. The silent-pass-gap fixes are unavoidable regardless.

## Unresolved Questions

- Should we ALSO prevent date-only forms in new records (forward-looking discriminator)? Would require schema versioning or a separate "new-record" check. Defer to a follow-up evidence MD if drift recurs.
- For the 3 records with missing required fields: are those records correct-but-incomplete (fill in), or were the verification blocks added by mistake (delete the block)? Authoring judgement needed before plan finalizes.
