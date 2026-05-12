---
phase: 6
title: "Decision Promotion And Cleanup"
status: completed
priority: P1
effort: "30m"
dependencies: [5]
---

# Phase 6: Decision Promotion And Cleanup

## Overview

Draft and approve `decision-260512TNNNNZ-ajv-schema-validation-adoption.yaml` capturing the posture shift (project no longer owns JSON Schema validation grammar). Delete the throwaway `tools/validate-records/ajv-dryrun.js`. Single focused commit on `main`. Run `/ck:journal` for technical journal entry per skill workflow.

## Requirements

- Functional: new decision record drafted with status `draft`, validated by AJV, then status flipped to `approved` after final green regression.
- Functional: decision explicitly notes the YAML-field-content vs filename scoping nuance relative to `decision-260512T1321Z-artifact-timestamp-convention`.
- Functional: decision cites brainstorm, dry-run evidence, predecessor decision `20260510T172056Z-yaml-parser-library-swap`, motivating commit `e2a82d6`, predecessor plan `260512-1410-yaml-parser-library-swap`.
- Functional: `tools/validate-records/ajv-dryrun.js` deleted.
- Functional: single conventional-format commit on `main` (e.g. `feat(validator): swap JSON Schema engine to AJV 2020`). Body cites the new decision id and brainstorm path.
- Non-functional: no force-push, no rebase, no PR — this project lives on `main` per recent commit history.

## Architecture

### New decision record

Path: `records/decisions/decision-260512TNNNNZ-ajv-schema-validation-adoption.yaml`. Pick `NNNN` as the wall-clock UTC time at draft authoring (e.g. `1620` for 16:20Z). Schema-required fields (per `schemas/decision.schema.json`):

```yaml
id: decision-260512TNNNNZ-ajv-schema-validation-adoption
type: decision
created_at: "2026-05-12TNN:NN:00Z"
updated_at: "2026-05-12TNN:NN:00Z"
title: "Adopt AJV 2020 for JSON Schema validation"
status: approved  # promoted post-regression from draft
problem: |
  Hand-rolled validateSchema in tools/validate-records/record-validation-rules.js
  silently passed records with date-only timestamps, missing $ref-resolved required
  fields, and missing items.required fields. Dry-run with AJV 2020 strict surfaced
  26 silent-pass records across 34 (76% silent miss rate on schemas the project
  thought it was enforcing).
decision: |
  Replace validatePrimitive + validateSchema with AJV 2020 (strict:true, allErrors:true).
  Add UTC-Z pattern enforcement to 11 timestamp fields. Keep validateClaimVerification,
  validateSourceRefs, validateExperimentPacks, validateRecordReferences hand-rolled
  (ledger/cross-record rules, not JSON Schema concerns).
rationale: |
  Three rules the hand-rolled validator could not express now matter:
  1. Datetime UTC-Z enforcement (motivated by commit e2a82d6 fix retroactively).
  2. $ref-resolved required field detection (3 records had missing fields surface).
  3. items.required nested enforcement (2 experiment records had missing output_level).
  AJV 2020 supports all three natively. Native error format chosen over a translator
  to avoid an adapter that grows linearly with new AJV keywords.
scope_note: |
  This decision governs YAML FIELD CONTENT validation only. Filename conventions
  (created_at-as-prefix, T-suffix-Z forms, etc.) remain governed by
  decision-260512T1321Z-artifact-timestamp-convention. The two decisions are
  orthogonal: AJV checks the value INSIDE the YAML, the convention checks the
  filename ON disk. A file named experiment-260512T0046Z-... can still have
  a YAML field created_at: "2026-05-11T17:46:00Z" — the offset between filename
  wall-clock and UTC field is acceptable and noted in records that hit it.
notes: |
  experiment-meta-install-template-candidate-260512T0046Z.yaml has a filename
  timestamp (260512T0046Z) that does not match its UTC created_at field
  (2026-05-11T17:46:00Z). Filename rename out of scope per decision-260512T1321Z.
source_refs:
  - kind: brainstorm
    ref: plans/reports/brainstorm-260512-1534-ajv-schema-validation-scope.md
  - kind: brainstorm
    ref: plans/reports/brainstorm-260512-1357-parser-swap-ajv-deferral.md
  - kind: evidence
    ref: records/evidence/meta/ajv-dryrun-results-260512.md
  - kind: plan
    ref: plans/260512-1534-ajv-schema-validation-swap/plan.md
  - kind: predecessor_plan
    ref: plans/260512-1410-yaml-parser-library-swap/plan.md
  - kind: predecessor_decision
    ref: records/decisions/decision-20260510T172056Z-yaml-parser-library-swap.yaml
  - kind: predecessor_decision
    ref: records/decisions/decision-260512T1321Z-artifact-timestamp-convention.yaml
  - kind: commit
    ref: e2a82d6
```

Fill any remaining schema-required fields by inspecting `schemas/decision.schema.json` at draft time (the above is illustrative — actual required keys may include `decided_at`, `decided_by`, etc.).

### Cleanup

`tools/validate-records/ajv-dryrun.js` was a throwaway research artifact (referenced from `records/evidence/meta/ajv-dryrun-results-260512.md` and the plan's Context Links). Delete it.

The evidence record `records/evidence/meta/ajv-dryrun-results-260512.md` is retained as historical evidence — it captures the dry-run findings that drove this plan.

### Commit

Single commit on `main`, conventional format:

```
feat(validator): swap JSON Schema engine to AJV 2020

Replaces hand-rolled validateSchema with AJV 2020 (strict:true, allErrors:true).
Adds UTC-Z pattern enforcement to 11 timestamp fields. Normalizes 27 records
(23 datetime drift, 1 local-tz, 3 missing-required). Native AJV error format
adopted; ledger/cross-record helpers retained.

See decision-260512TNNNNZ-ajv-schema-validation-adoption.yaml.
```

Files in the commit:
- 5 schema files (Phase 2 pattern additions)
- 27 record files (Phase 3 normalizations)
- 1 validator source file (Phase 4 engine swap)
- 0–N test assertion updates (Phase 5)
- 1 new decision record (this phase)
- 1 deleted dryrun script (this phase)
- 0 changes to evidence record (retained as-is)
- package.json + pnpm-lock.yaml (the ajv install — committed for the first time here since brainstorm noted it was uncommitted)

## Related Code Files

- Create: `records/decisions/decision-260512TNNNNZ-ajv-schema-validation-adoption.yaml`.
- Delete: `tools/validate-records/ajv-dryrun.js`.
- No other file edits in this phase.

## Implementation Steps

1. Inspect `schemas/decision.schema.json` to confirm all required fields for the new decision record. Note any required fields not in the illustrative template above.
2. Draft `records/decisions/decision-260512TNNNNZ-ajv-schema-validation-adoption.yaml` with status `draft`. Use UTC wall-clock time of authoring as `NNNN`.
3. Run `pnpm validate:records`. Expected: exit 0, count rises to 35 records. If AJV rejects the draft, fix the YAML.
4. Flip `status: draft` → `status: approved`. Add a `decided_at` or equivalent approval timestamp per the schema.
5. Run `pnpm validate:records` again. Expected: exit 0.
6. `rm tools/validate-records/ajv-dryrun.js`.
7. Run `pnpm validate:records` and `pnpm check` once more. Expected: both exit 0.
8. Stage: `git add schemas/ records/ tools/validate-records/record-validation-rules.js tools/validate-records/validate-records.js package.json pnpm-lock.yaml`. Also `git rm tools/validate-records/ajv-dryrun.js`.
9. Confirm `git status` shows ONLY the expected files (no smoke artifacts from Phase 5, no stray edits).
10. Commit with the message above (HEREDOC for multi-line body).
11. Update plan.md frontmatter `status: pending` → `status: completed`.
12. Run `/ck:journal` to write a technical journal entry covering the swap.

## Success Criteria

- [ ] `records/decisions/decision-260512TNNNNZ-ajv-schema-validation-adoption.yaml` exists, status: approved, validates clean under AJV.
- [ ] `tools/validate-records/ajv-dryrun.js` deleted.
- [ ] Single commit on `main` containing all phase changes.
- [ ] `pnpm validate:records` exit 0 with 35 records (was 34, +1 for the new decision).
- [ ] `pnpm check` exit 0.
- [ ] `git status` clean post-commit.
- [ ] Plan-level `plan.md` status flipped to `completed`.
- [ ] `/ck:journal` entry written.

## Risk Assessment

- **Risk**: collision on `NNNN` time slug with an existing decision file. **Mitigation**: `ls records/decisions/decision-260512T*` to check before drafting; bump minute if collision.
- **Risk**: new decision fails AJV because the schema requires fields not in the illustrative template (e.g. `decided_by`, `approval` block). **Mitigation**: step 1 explicitly reads the schema to enumerate required fields.
- **Risk**: commit accidentally includes Phase 5 smoke artifact or uncommitted edits from another in-progress task. **Mitigation**: step 9 explicit `git status` review before commit.
- **Risk**: scope creep — reviewer wants to also delete `records/evidence/meta/ajv-dryrun-results-260512.md`. **Out of scope**: evidence records are historical; retain. The plan's Context Links cite it; deleting would break the audit trail.
- **Risk**: predecessor decision id `20260510T172056Z-yaml-parser-library-swap` doesn't actually exist (id might be slightly different). **Mitigation**: `ls records/decisions/ | grep yaml-parser` before citing; correct the id in source_refs if drift detected.
- **Risk**: `/ck:journal` fails or is unavailable. **Mitigation**: skill is optional per workflow step 10; if it errors, commit succeeds and journal can be added in a follow-up. Don't block the phase on journal.
