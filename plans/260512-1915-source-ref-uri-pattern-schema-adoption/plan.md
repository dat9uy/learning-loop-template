---
title: "Source-Ref URI Pattern Schema Adoption"
description: "Phase B Cascade 5 of the validator simplification cascade. Move source_refs prefix grammar from hand-rolled validateSourceRefs into AJV schema pattern across the 5 record schemas. Removes the unsupported-prefix catchall and the pack: length check from record-validation-rules.js. Ledger checks (record:<id> exists, local:<path> realpath, legacy: fixture flag, pack: status lookup) stay hand-rolled because they encode learning-loop ledger semantics, not URI grammar. Posture shift: AJV now owns the source-ref URI scheme. One decision record + one commit."
status: pending
priority: P3
branch: "main"
tags: [tooling, validator, schema, ajv, posture-shift, phase-b]
blockedBy: []
blocks: []
created: "2026-05-12T12:19:21.698Z"
createdBy: "ck:plan"
source: skill
---

# Source-Ref URI Pattern Schema Adoption

## Overview

Adopt the source-ref URI prefix grammar (`local|record|pack|legacy:.+`) into the 5 record schemas as an AJV `pattern` on `source_refs.items`, then collapse the now-redundant hand-rolled prefix checks in `record-validation-rules.js:74-95`. Each ledger check (record-ref existence, local-path realpath/allowlist, legacy fixture flag, pack status) stays hand-rolled — those encode learning-loop semantics that no schema can express. One decision record under `records/decisions/` because this is a posture shift, not a refactor.

## Context Links

- Scout report: `plans/reports/problem-solving-260512-1714-validate-records-simplification.md` (Cascade 5)
- Predecessor plan: `plans/260512-1724-validator-simplification-pass/` (Phase A; completed)
- AJV adoption decision: `records/decisions/decision-260512T0944Z-ajv-schema-validation-adoption.yaml` (parent posture this extends)

## Scope

In:
- Add `"pattern": "^(local|record|pack|legacy):.+"` to `source_refs.items` in all 5 record schemas: `claim`, `experiment`, `decision`, `risk`, `capability`.
- Remove the final `errors.push(...unsupported source reference)` catchall in `validateSourceRefs` at `record-validation-rules.js:93`.
- Remove the `pack:` length check at `record-validation-rules.js:90-92` (subsumed by `.+`).
- Update `runNegativeFixtures` expected strings for `unsupported-source-ref` and `malformed-pack-ref` cases in `validate-records.js:32, 46` from hand-rolled wording to AJV pattern wording.
- Author `records/decisions/decision-260512T1915Z-source-ref-uri-pattern-adoption.yaml` documenting the posture shift.

Out (each its own future plan if pursued):
- Pack-file schemas (Cascades 6+7 — separate Phase B candidate, separate decision).
- `additionalProperties: false` on record schemas.
- `oneOf` per-prefix grammar splitting (rejected alternative; see decision record).
- Source-ref uniqueness check (still hand-rolled by design from AJV-adoption decision).
- ID-pattern (still hand-rolled by design from AJV-adoption decision).
- Per-prefix path/ID format enforcement beyond `:.+`.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Baseline](./phase-01-baseline.md) | Pending |
| 2 | [Schema + Collapse](./phase-02-schema-collapse.md) | Pending |
| 3 | [Decision Record](./phase-03-decision-record.md) | Pending |
| 4 | [Regression](./phase-04-regression.md) | Pending |

## Dependencies

Same-scope predecessor (completed): `260512-1724-validator-simplification-pass`. AJV pipeline + UTC-Z pattern precedent from `decision-260512T0944Z-ajv-schema-validation-adoption` already in place; this plan reuses that machinery.

## Success Criteria (Plan-Level)

- `pnpm check` exit 0 before and after (same `Validated N records.` count).
- All 5 record schemas carry `pattern: "^(local|record|pack|legacy):.+"` on `source_refs.items`.
- `validateSourceRefs` no longer contains the `unsupported source reference` catchall or the `malformed pack reference` length-check branch.
- `runNegativeFixtures` updated expected strings: `unsupported-source-ref` → AJV pattern error wording; `malformed-pack-ref` → AJV pattern error wording.
- All 30+ negative fixtures still trip (no false-positive passes); both updated cases produce an error message containing the new expected substring.
- One decision record under `records/decisions/` with `status: approved`, `decision_effect.action: approve`, scope = schema-improvement, referenced from the schema change commit.
- Tester agent status DONE; code-reviewer agent status DONE; no blocking issues.
- Single commit on `main`: `feat(validator): adopt AJV pattern for source-ref URI grammar` (or similar conventional message). Decision-record YAML may land in same commit or a preceding ledger-only commit per ledger convention.

## Risk Assessment

- **Risk:** AJV pattern wording change breaks an external CI consumer that greps for `"unsupported source reference"` or `"malformed pack reference"`.
  - **Mitigation:** grep repo for those exact strings outside `tools/validate-records/` and `fixtures/negative/`. Update or note breakage.

- **Risk:** Pattern `.+` allows arbitrary single-char suffixes (e.g., `record:x`) where downstream ledger check then fails with `missing record reference`. Net error count per bad input stays 1 (either schema or ledger), but the *message* shifts.
  - **Mitigation:** acceptable. Per AJV-adoption decision, error wording change is expected when a hand-roll moves to schema.

- **Risk:** Fixture `unsupported-source-ref` already trips other AJV errors (missing `verification`); test passes today only via `.some(includes(expected))` semantics. After change, the new expected substring must also be present. Reverify the `.some` semantics survive.
  - **Mitigation:** Phase 4 reruns full `runNegativeFixtures` and asserts every case still trips. If unsupported-source-ref accidentally relies on hand-roll error ordering, fix fixture rather than pattern.

- **Risk:** Hand-roll `validateSourceRefs` retains a defensive `typeof sourceRef !== "string"` continue after the AJV pattern check is in place. Dead but harmless. Avoid the temptation to delete it — schema validation collects errors and continues; downstream hand-roll still iterates source_refs and `pattern` does not block non-string entries when items type is `string` (those fall under `items.type`).
  - **Mitigation:** keep the typeof guard; document in code comment that the schema pattern is anchored at validateRecordSchemas, hand-roll handles ledger.

- **Risk:** Pattern allows `pack:_template` (length 1 suffix). Downstream `validateSourceRefs` `pack:` branch had no further check after length, so behavior is unchanged for nominal pack refs. Lookup against `packStatuses` happens elsewhere (`validateExperimentPacks`) only for `knowledge_pack_ids`. Source-ref `pack:` strings are never verified for pack existence today — that gap stays open.
  - **Mitigation:** noted as out-of-scope; not introduced by this change. Could be future work but not part of this posture shift.

- **Risk:** Decision record commit ordering with schema change. If schema change lands before decision YAML, history shows posture shift without ledger anchor.
  - **Mitigation:** land decision YAML in the same commit, or land ledger-only commit first then schema commit citing it.
