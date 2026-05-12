---
phase: 3
title: "Decision Record"
status: pending
priority: P3
effort: "20m"
dependencies: [2]
---

# Phase 3: Decision Record

## Overview

Author the ledger entry for this posture shift. Mirrors structure of the parent `decision-260512T0944Z-ajv-schema-validation-adoption.yaml` — same shape, narrower scope. Required because scout report classifies Cascade 5 as a posture shift, not a refactor.

## Requirements

- Functional: a new `decision` record under `records/decisions/` documenting question, decision, rationale, alternatives, tradeoffs, decision_effect with allowed/blocked actions and required gates.
- Non-functional: filename + ID follow convention `decision-260512T1915Z-source-ref-uri-pattern-adoption`. UTC-Z timestamps. Source_refs cite the parent AJV decision and the scout report path in `notes` (since `plans/` is outside the source_refs allowlist — same pattern used by the parent AJV decision).

## Architecture

Decision YAML loaded by `pnpm check` like any other record. Schema-validated against `schemas/decision.schema.json`. Source_refs must be `record:<id>` or `local:<path>` — pattern enforced by this very plan's Phase 2 schema change applies to this record too (self-validating).

## Related Code Files

- Create: `records/decisions/decision-260512T1915Z-source-ref-uri-pattern-adoption.yaml`
- Reference (do not modify): `records/decisions/decision-260512T0944Z-ajv-schema-validation-adoption.yaml` (parent posture).

## Implementation Steps

1. Create `records/decisions/decision-260512T1915Z-source-ref-uri-pattern-adoption.yaml` with these fields (all timestamps UTC-Z; values are templates, fill in:

   ```yaml
   id: decision-260512T1915Z-source-ref-uri-pattern-adoption
   schema_version: "1.0"
   type: decision
   status: approved
   created_at: "2026-05-12T19:15:00Z"
   updated_at: "2026-05-12T19:15:00Z"
   source_refs:
     - record:decision-260512T0944Z-ajv-schema-validation-adoption
   notes: "Implementation plan at plans/260512-1915-source-ref-uri-pattern-schema-adoption/plan.md; scout report at plans/reports/problem-solving-260512-1714-validate-records-simplification.md (Cascade 5); predecessor Phase A plan at plans/260512-1724-validator-simplification-pass/. plans/ is outside source_refs allowlist, cited here per the parent AJV-adoption decision's convention."
   question: Should the source-ref URI prefix grammar (local|record|pack|legacy followed by a non-empty suffix) be enforced by AJV as a pattern on source_refs.items in the 5 record schemas, with the corresponding hand-rolled branches in tools/validate-records/record-validation-rules.js validateSourceRefs removed?
   decision: Adopt AJV pattern "^(local|record|pack|legacy):.+" on source_refs.items in all 5 record schemas. Remove the unsupported-source-reference catchall and the pack: length-check branch from validateSourceRefs. Retain the legacy fixture-flag check, the local: realpath/allowlist check, and the record: cross-record existence check as hand-rolled because they encode ledger semantics, not URI grammar.
   rationale: The hand-rolled prefix grammar duplicates what JSON Schema patterns express directly. The AJV-adoption decision already established that schema grammar is solved upstream and project code should own ledger semantics. This change closes the remaining gap between declared schema and enforced schema for source_refs. Per-prefix ledger checks remain hand-rolled because they touch the filesystem, cross-record id maps, or stateful test flags — none of which a JSON pattern can express.
   alternatives:
     - Keep the hand-rolled prefix grammar. Rejected because it duplicates pattern-expressible logic and silently diverges from the schema declaration.
     - Use oneOf with per-prefix subschemas (e.g., one subschema per scheme with a different pattern). Rejected as overkill; the four prefixes share the trivial structure prefix-colon-payload and a single pattern is more readable.
     - Adopt ajv-formats and define a custom format for source-refs. Rejected for parity with the parent AJV decision which avoided ajv-formats; a literal pattern is hermetic.
     - Extend pattern further (e.g., constrain record-suffix to a record-id grammar, constrain local-suffix to a path-character class). Rejected as scope creep; deeper grammar belongs in ledger checks that already exist.
     - Bundle with pack-file schemas (Cascades 6 + 7). Rejected because scout report classifies each cascade as its own decision; bundling muddies the ledger.
   tradeoffs:
     - Validator error wording for the two affected negative fixtures changes from "unsupported source reference" / "malformed pack reference" to "/source_refs/0 pattern: must match pattern \"^(local|record|pack|legacy):.+\"". Negative fixture assertions update to match.
     - Pattern is permissive after the colon (.+) — any non-empty suffix passes. Per-prefix payload constraints continue to live in ledger checks. Acceptable because tightening pattern further would replicate ledger logic in schema.
     - source_refs uniqueness and per-record duplicate detection remain out of scope (consistent with AJV-adoption decision's boundaries).
   supersedes: []
   decision_effect:
     action: approve
     scope: schema-improvement
     affected_refs:
       - local:schemas/claim.schema.json
       - local:schemas/experiment.schema.json
       - local:schemas/decision.schema.json
       - local:schemas/risk.schema.json
       - local:schemas/capability.schema.json
       - local:tools/validate-records/record-validation-rules.js
       - local:tools/validate-records/validate-records.js
     boundaries:
       allowed_actions:
         - Add pattern "^(local|record|pack|legacy):.+" to source_refs.items in the 5 record schemas.
         - Remove the unsupported-source-reference catchall and the pack: length-check branch from validateSourceRefs.
         - Update negative fixture expected strings in validate-records.js to AJV-native pattern wording.
       blocked_actions:
         - Replacing ledger checks (record-ref existence, local-path realpath/allowlist, legacy fixture-flag, pack status) with schema-only rules.
         - Tightening the post-colon payload grammar beyond .+ in this change.
         - Bundling pack-file schemas (Cascades 6 + 7) into this decision.
         - Adding source_refs uniqueness, ID-pattern, or additionalProperties:false in this change.
       required_gates:
         - pnpm validate:records
         - pnpm check
         - All negative fixtures continue to trip (no silent passes).
   ```

2. Verify file passes schema validation by running `pnpm check`. The record itself uses `source_refs: [record:decision-260512T0944Z-...]` which is a valid `record:` prefix and references an existing decision — should pass both the new AJV pattern and the existing ledger check.

3. Stage with `git add records/decisions/decision-260512T1915Z-source-ref-uri-pattern-adoption.yaml`. Prepare commit message: `feat(validator): adopt AJV pattern for source-ref URI grammar` (covers schema, validator collapse, fixture-string updates, and ledger entry in one commit).

## Success Criteria

- [ ] Decision YAML exists at the canonical path with valid UTC-Z timestamps.
- [ ] YAML passes `pnpm check` (no schema errors, no ledger errors).
- [ ] All required fields present per `schemas/decision.schema.json`.
- [ ] References parent AJV decision via `source_refs`.
- [ ] Filename pattern matches existing decisions (`decision-YYMMDDTHHMMZ-{slug}.yaml`).

## Risk Assessment

- **Risk:** Decision YAML fails schema validation because of a required-field omission (`promotion_review` is required on experiment schema but not decision — verify exact decision schema required list).
  - **Mitigation:** Phase 1 step or Phase 3 step 1 reviews `schemas/decision.schema.json` `required` list and the parent decision YAML's field set. Mirror that field set.

- **Risk:** Filename timestamp collides with another decision created at the same minute today.
  - **Mitigation:** check `ls records/decisions/ | grep 260512T19` before writing. None expected; rename to next minute if collision.

- **Risk:** Decision is too narrow and gets superseded immediately by a Phase B follow-up plan.
  - **Mitigation:** scope is explicit. Pack-file schemas and use-case-fixture schema are separate scout-listed Phase B candidates; each gets its own decision. Stacking small decisions is the intended posture per the scout report.
