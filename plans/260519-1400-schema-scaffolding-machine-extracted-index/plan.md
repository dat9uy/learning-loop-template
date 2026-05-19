---
title: "Schema + Scaffolding: Machine-Extracted Index"
description: "Mechanical foundation for machine-extracted index: deprecation decision, index-entry schema, records/index/ directory, validator plumbing, and architecture doc updates."
status: pending
priority: P1
branch: "main"
tags: ["machine-extracted-index", "schema", "records", "validation"]
blockedBy: []
blocks: []
created: "2026-05-19T10:10:35.612Z"
createdBy: "ck:plan"
source: skill
---

# Schema + Scaffolding: Machine-Extracted Index

## Overview

Plan 1 of 4 from the machine-extracted index redesign. Creates the mechanical foundation: deprecates claims for new entries, introduces the `extracted-assertion` record type and schema, establishes `records/index/` as the live assertion store, and extends the validator to recognize index entries. No runtime behavior changes. One commit, one review round.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Decision and Schema](./phase-01-decision-and-schema.md) | Pending |
| 2 | [Validator Plumbing](./phase-02-validator-plumbing.md) | Pending |
| 3 | [Documentation Update](./phase-03-documentation-update.md) | Pending |
| 4 | [Acceptance Validation](./phase-04-acceptance-validation.md) | Pending |

## Key Decisions

- Schema file name: `schemas/index-entry.schema.json` (per brainstorm), mapped to type `extracted-assertion` in validator via explicit mapping object.
- `source_refs` in index entries are structured objects (not strings); validator gets type-specific handling for `source_refs.*.file` to preserve file-existence and path-root checks.
- `superseded_by` and `experiment_refs` are added to generic record-reference validation.
- No changes to `claim-verification-rules.js` or `derived-claim-assurance.js` — both are already type-gated.

## Acceptance Criteria

- `pnpm check` passes on all unchanged files + new schema loads without errors.
- `records/index/` exists and is empty (entries come in Plan 3).
- `schemas/claim.schema.json` carries `deprecated: true` with pointer to decision record.

## Dependencies

- None. Ready to start immediately.
- Plan 2 (Extraction Tool) is blocked by this plan.

## Red Team Review

### Session — 2026-05-19
**Findings:** 10 (10 accepted, 0 rejected)
**Severity breakdown:** 3 Critical, 4 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | `decision_effect.action: deprecate` invalid in schema | Critical | Accept | Phase 1 — changed to `supersede` |
| 2 | `decision_effect.scope: records` invalid in schema | Critical | Accept | Phase 1 — changed to `schema-improvement` |
| 3 | Decision `source_refs` to `plans/reports/` fails local-path validation | Critical | Accept | Phase 1 — moved to `affected_refs` |
| 4 | `verify-claim.js` hardcodes schema loading, will break | Critical | Accept | Phase 2 — added as required modification |
| 5 | `superseded_by` bare IDs not validated by generic checker | High | Accept | Phase 1/2 — documented as by-design limitation |
| 6 | `superseded_by` typed as string only rejects null | High | Accept | Phase 1 — schema changed to `["string", "null"]` |
| 7 | `experiment_refs` schema lacks pattern, dangling refs silent | High | Accept | Phase 1 — added `pattern: "^record:.+"` |
| 8 | No unit tests cover validation tooling | High | Accept | Phase 4 — reworded acceptance criteria |
| 9 | Decision filename uses deprecated full-year timestamp | Medium | Accept | Phase 1 — renamed to short-year format |
| 10 | Generated docs ignore `extracted-assertion` records | Medium | Accept | Phase 3 — documented as known gap deferred to Plan 4 |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01, phase-02, phase-03, phase-04
- Decision deltas checked: 4 (decision ID format, schema type for superseded_by, experiment_refs pattern, verify-claim.js inclusion)
- Reconciled stale references: 2 (old decision ID in claim schema description, old filename in Related Code Files)
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-05-19
**Trigger:** Post-red-team validation interview
**Questions asked:** 3

#### Questions & Answers

1. **[Architecture]** Schema file `index-entry.schema.json` vs type `extracted-assertion` requires mapping in both `validate-records.js` and `verify-claim.js`. Extract shared loader or duplicate?
   - Options: Extract shared schema loader module | Duplicate in both files
   - **Answer:** Extract shared schema loader module
   - **Rationale:** DRY; future schema additions edit one place.

2. **[Assumptions]** `superseded_by`/`supersedes` use bare IDs (no `record:` prefix), consistent with existing decisions and claims. Validator only checks `record:` prefixed refs. Accept or enforce prefix?
   - Options: Accept bare IDs as by-design | Enforce `record:` prefix on index entries
   - **Answer:** Accept bare IDs as by-design
   - **Rationale:** Consistent with existing convention across all record types.

3. **[Scope]** Red-team found zero unit tests for `validate-records`. Add minimal test now or defer to Plan 2?
   - Options: Add minimal test now | Defer to Plan 2
   - **Answer:** Add minimal test now
   - **Rationale:** Catches regressions on the new `extracted-assertion` path before Plan 3 populates real entries.

#### Confirmed Decisions
- Shared schema loader: extract module — avoids duplication across `validate-records.js` and `verify-claim.js`
- Bare ID convention: keep — consistent with existing decision/claim `supersedes`
- Unit test: add in Plan 1 — minimal test for `extracted-assertion` schema loading + validation

#### Action Items
- [ ] Create `tools/validate-records/schema-loader.js`
- [ ] Update `validate-records.js` and `verify-claim.js` to import from shared loader
- [ ] Write minimal test for `extracted-assertion` validation path

#### Impact on Phases
- Phase 2: Add schema-loader extraction step and minimal test step
- Phase 4: Add brainstorm report update step so Plans 2–4 read updated context

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01, phase-02, phase-03, phase-04
- Decision deltas checked: 3 (shared schema loader, bare ID convention, minimal test)
- Reconciled stale references: 0
- Unresolved contradictions: 0
