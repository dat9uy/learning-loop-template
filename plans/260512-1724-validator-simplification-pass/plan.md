---
title: "Validator Simplification Pass"
description: "Phase A cleanup of tools/validate-records/ after AJV adoption: delete orphan generated-validation.js, delete retired use-case-fixture-validation.js + its import/caller, fold recordLocalRoots description into config and remove allowedDescriptionFor, collapse dimensionEntries to Object.entries.filter. Pure internal refactor, no posture shift, no schema changes, no new dependencies. Single bundled commit. Zero behavior change expected; pnpm check stays green."
status: complete
priority: P3
branch: "main"
tags: [tooling, validator, cleanup, post-ajv]
blockedBy: []
blocks: []
created: "2026-05-12T11:43:21.698Z"
createdBy: "ck:plan"
source: skill
---

# Validator Simplification Pass

## Overview

Internal refactor of `tools/validate-records/` to remove dead code and collapse local invention that the AJV swap rendered redundant. Strictly Tier-1 (Phase A) of the scout report — pure deletion and idiom collapse, no schema edits, no posture shift, no new decision record. One commit.

## Context Links

- Scout report: `plans/reports/problem-solving-260512-1714-validate-records-simplification.md`
- Predecessor plan (drove the AJV adoption this builds on): `plans/260512-1534-ajv-schema-validation-swap/`
- AJV decision (ledger anchor): existing `decision-260512TNNNNZ-ajv-schema-validation-adoption.yaml` from predecessor plan

## Scope

In:
- Delete `tools/validate-records/generated-validation.js` (orphan; zero importers).
- Delete `tools/validate-records/use-case-fixture-validation.js` + its import in `validate-records.js:10` + its call in `main()` at `validate-records.js:127`. `fixtures/use-cases/` is retired (user-confirmed).
- Fold per-type description string into `recordLocalRoots` config in `record-validation-rules.js:63-66`. Delete `allowedDescriptionFor()` (lines 143-148). Update `validateLocalRef` (lines 150-160) to read `.description` directly.
- Collapse `dimensionEntries()` in `claim-verification-rules.js:122-127` to one-liner over `Object.entries(...).filter(([k]) => verificationDimensions.has(k))`.

Out (deferred to Phase B / separate decisions per scout report):
- Source-ref URI prefix `pattern` on schemas.
- Pack-file schemas (`manifest.yaml` / `facts.yaml` / `capabilities.yaml`).
- Schema-promotion of use-case fixtures (use-cases are retired, not reviving).
- `experimentSupportsClaim` ↔ `experimentProvesDimension` unification.
- `additionalProperties: false` on record schemas.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Baseline](./phase-01-baseline.md) | Complete |
| 2 | [Dead Code Removal](./phase-02-dead-code-removal.md) | Complete |
| 3 | [Idiom Collapse](./phase-03-idiom-collapse.md) | Complete |
| 4 | [Regression](./phase-04-regression.md) | Complete |

## Dependencies

None. Predecessor (`260512-1534-ajv-schema-validation-swap`) completed; this builds on its posture without altering it.

## Success Criteria (Plan-Level)

- `pnpm check` exit 0 before and after the pass (identical output count: "Validated N records.").
- `tools/validate-records/generated-validation.js` deleted; no broken imports.
- `tools/validate-records/use-case-fixture-validation.js` deleted; `validate-records.js` no longer imports `validateUseCaseFixtures` or calls it.
- `record-validation-rules.js` no longer contains `allowedDescriptionFor`; `recordLocalRoots` values are `{ roots, description }` objects.
- `claim-verification-rules.js` `dimensionEntries` is a single `return Object.entries(...).filter(...)` line.
- Tester agent status DONE.
- Code reviewer status DONE; no blocking issues.
- Net LoC delta: approximately −95 across 4 files (28 + 59 + 8 + 4 ≈ 99).
- Single focused commit on `main` with conventional message `refactor(validator): collapse hand-rolls absorbed by AJV`.
- No decision record (user-confirmed; pure refactor).

## Risk Assessment

- **Risk:** `generated-validation.js` is imported by a path the grep missed (alias, dynamic import, build script).
  - **Mitigation:** before deletion, re-grep including `*.json`, `*.cjs`, `scripts/`, `tools/`, top-level config. Confirm zero hits.
- **Risk:** `use-case-fixture-validation.js` removal breaks a fixture roundtrip referenced by docs.
  - **Mitigation:** grep `docs/` for "use-case-fixture" or "use-cases" references; update or delete refs.
- **Risk:** `dimensionEntries` collapse changes iteration order. Original used `[...verificationDimensions]` (Set insertion order: static, install, runtime, product). `Object.entries` follows insertion order of the YAML data — order may differ per record.
  - **Mitigation:** confirm no downstream code depends on dimension iteration order. Inspect `validateClaimDimensions` — it pushes errors per-dimension, so order affects error message order only. Acceptable; `pnpm check` exit code unaffected.
- **Risk:** `recordLocalRoots` shape change breaks an external consumer (none expected; the constant is module-private).
  - **Mitigation:** grep for `recordLocalRoots` import — should be zero outside the file.
