---
title: "Knowledge-Pack Lane Retirement"
description: "Full retirement of the knowledge-packs/ lane as a concept. Supersedes the draft deferral decision (20260510T174640Z, status: draft, action: defer) with full retirement: delete pack-source-validation.js, publication-gate-validation.js, pack-summary.js; drop pack: from the source-ref URI pattern in all 5 record schemas; drop knowledge_pack_ids from the experiment schema; drop the field from 14 frozen experiment records (all empty arrays); delete knowledge-packs/ directory; delete 11 pack-related negative fixtures; drop pack mentions from README/charter/operator-guide/red-team-review. Absorbs Cascades 6+7 from the validate-records simplification scout report by deletion (stricter form of the proposed schematization). Two commits: ledger-only decision + evidence first, then atomic retirement bundle."
status: pending
priority: P2
branch: "main"
tags: [tooling, validator, schema, ajv, posture-shift, retirement, phase-b, ledger]
blockedBy: []
blocks: []
created: "2026-05-12T12:44:24.168Z"
createdBy: "ck:plan"
source: skill
---

# Knowledge-Pack Lane Retirement

## Overview

Retire the `knowledge-packs/` lane in full. The May-10 draft deferral decision (174640Z, never operator-approved) said "quiet but don't retire" to avoid cleanup cost; the operator has now chosen retirement. This plan delivers the supersession decision, then performs the deletion: pack-specific validator modules, the URI pattern's `pack:` alternative, the experiment schema's `knowledge_pack_ids` field, the directory itself, every pack-related negative fixture, and every doc surface mention. It also absorbs the next Phase B Cascade candidate from `plans/reports/problem-solving-260512-1714-validate-records-simplification.md` (Cascades 6 + 7 — pack-file schemas and the two-walker collapse): both become moot when the file gets deleted instead of schematized.

## Context Links

- Scout report (cascade source): `plans/reports/problem-solving-260512-1714-validate-records-simplification.md` — Phase B Tier-2 candidate "Pack-file schemas (absorbs Cascades 6 + 7 collateral)".
- Superseded decision: `records/decisions/decision-20260510T174640Z-knowledge-pack-lane-deferral.yaml` (status: draft, action: defer).
- Predecessor plan (just completed): `plans/260512-1915-source-ref-uri-pattern-schema-adoption/` — adopted the `^(local|record|pack|legacy):.+` pattern in the 5 record schemas; this plan drops the `pack` alternative.
- Predecessor plan: `plans/260512-1724-validator-simplification-pass/` (Phase A; completed).
- AJV adoption decision: `records/decisions/decision-260512T0944Z-ajv-schema-validation-adoption.yaml` (parent posture).
- Capabilities-stack-migration decision: `records/decisions/decision-20260510T160000Z-capabilities-stack-migration.yaml` — established the per-record-type local-source allowlist machinery. Its YAML text does not mention the `knowledge-packs/` allowlist token; the token lives only in validator code, so this plan removes the token from code without editing 160000Z. The deferral decision's boundary about not editing 160000Z is consequently inert.
- Deferral evidence: `records/evidence/loop/knowledge-pack-lane-deferral.md` — captures the May-10 doc-quieting pass.

## Scope

In:
- Author `records/decisions/decision-{YYMMDDTmmZ}-knowledge-pack-retirement.yaml` (status: approved, action: supersede, scope: schema-improvement, supersedes: 174640Z). Timestamp computed at write time.
- Author evidence record `records/evidence/loop/knowledge-pack-retirement.md`.
- Leave `decision-20260510T174640Z-knowledge-pack-lane-deferral.yaml` at `status: draft`. The new decision's `supersedes` link is the authoritative disposition signal. Flipping the deferral to `rejected` would conflate "proposal rejected on merits" with "operator chose retirement instead"; the supersedes-graph carries the latter cleanly without the misread. Deferral YAML is not edited.
- Delete `tools/validate-records/pack-source-validation.js` (85 LoC).
- Delete `tools/validate-records/publication-gate-validation.js` (139 LoC).
- Delete `tools/generate-docs/pack-summary.js` (17 LoC).
- Edit `tools/validate-records/validate-records.js`: drop imports for `validatePackSources`, `validatePublicationGates`, `loadPackStatuses`; drop `runNegativePackFixtures`, `runNegativePublicationGateFixtures`; drop their calls in `main()`; drop the `unapproved-pack` and `malformed-pack-ref` cases from `runNegativeFixtures`; drop `packStatuses` plumbing.
- Edit `tools/validate-records/record-validation-rules.js`: drop the `pack:` short-circuit branch in `validateSourceRefs`; drop the `knowledge-packs` token from both entries in `recordLocalRoots` (default + capability) and update both `description` strings; delete `validateExperimentPacks` and its call site; drop `packStatuses` param from the exported `validateRecords`.
- Edit `tools/validate-records/record-loader.js`: delete `loadPackStatuses`.
- Edit `tools/generate-docs/generated-doc-content.js`: drop `loadPacks` import (line 2) and `loadPacks(root)` call (line 9); drop the `packs` parameter and the "Eligible Knowledge Packs" section from `renderOverview`; delete the entire `renderCapabilities` function and drop `"docs/generated/capabilities.md": renderCapabilities(packs)` from the returned object; in `renderProposal`, simplify the "Evidence" section to `list(experiment.source_refs || [])`. (Note: `tools/generate-docs/generate-docs.js` currently errors with "docs generation disabled until metadata structure is finalized"; these edits are hygienic — they prevent shipping a broken import when the docs pipeline is later re-enabled.)
- Edit 5 record schemas (`claim`, `experiment`, `decision`, `risk`, `capability`): change `source_refs.items.pattern` from `^(local|record|pack|legacy):.+` to `^(local|record|legacy):.+`.
- Edit `schemas/experiment.schema.json`: remove `knowledge_pack_ids` from `required`; remove it from `properties`.
- Edit 14 experiment record YAMLs to drop the `knowledge_pack_ids: []` field (all currently empty arrays).
- Delete `knowledge-packs/` directory and its contents (`_template/{manifest,facts,capabilities}.yaml`, `vnstock-data/manifest.yaml`).
- Delete 11 pack-related negative fixtures (`fixtures/negative/{unapproved-pack,malformed-pack-ref,malformed-pack-source-ref-item,malformed-pack-source-refs,nested-pack-source-allowlist,pack-low-assurance,pack-missing-record-ref,pack-rejected-claim,pack-unresolved-conflict,source-allowlist-traversal,unsupported-pack-source-ref}/`).
- Edit `README.md`: drop the `knowledge-packs/` row from the Lanes table.
- Edit `docs/charter.md`: drop the pack-latent paragraph.
- Edit `docs/operator-guide.md`: drop the two pack-mention lines.
- Edit `docs/red-team-review.md`: drop the pack-publication-failures mention.
- Edit `.claude/skills/learning-loop/SKILL.md`: drop the `pack` token from the frontmatter `description` line; drop the pack-example from the "Draft a handoff prompt for evidence / claims / experiment / pack work." line; drop "knowledge-pack curation" from the workflow list.
- Edit `.claude/skills/learning-loop/references/learning-loop-rules.md`: drop the line referencing `docs/knowledge-pack-contract.md` (file already deleted in May-10 quieting); drop the `knowledge-packs/` lane bullet; drop "pack approval vs product approval"; rewrite "Active records and packs cite local evidence or records" to "Active records cite local evidence or records"; drop "Use `pack:<id>` for packs."; drop "Knowledge packs cite `record_ref`, not raw evidence paths."; drop "Reviewed/approved packs may be consumed by experiments; unreviewed packs cannot."; rewrite "records/packs/evidence" mention to "records and evidence".

Out (each its own future plan if pursued):
- Cascade 8 from the scout report (`experimentSupportsClaim` vs `experimentProvesDimension` semantic unification).
- Use-case-fixture schema work (still listed as Tier-2 candidate in the scout report).
- Renaming or rewriting historical journal `docs/journals/260512-source-ref-uri-pattern-schema-adoption.md` (historical record; do not edit).
- Renaming or rewriting historical evidence `records/evidence/loop/knowledge-pack-lane-deferral.md` (historical record; do not edit).
- Editing the capabilities-stack-migration decision (20260510T160000Z) YAML — not required because its text does not carry the `knowledge-packs/` token; only validator code does.
- Adopting `additionalProperties: false` on record schemas.
- Source-ref uniqueness check (still hand-rolled by design from AJV-adoption decision).
- ID-pattern enforcement (still hand-rolled by design from AJV-adoption decision).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Retirement Decision Record](./phase-01-retirement-decision-record.md) | Pending |
| 2 | [Validator Code Retirement](./phase-02-validator-code-retirement.md) | Pending |
| 3 | [Schemas + Records + Fixtures + Tree Removal](./phase-03-schemas-records-fixtures-tree-removal.md) | Pending |
| 4 | [Operator Docs + Regression](./phase-04-operator-docs-regression.md) | Pending |

## Dependencies

Predecessor (completed): `260512-1915-source-ref-uri-pattern-schema-adoption` — established the source-ref URI pattern this plan now narrows. Predecessor (completed): `260512-1724-validator-simplification-pass` (Phase A). No blocking same-scope or cross-scope plans.

## Success Criteria (Plan-Level)

- `pnpm check` exit 0 after each commit (commit 1 ledger-only; commit 2 atomic retirement bundle). Validated record count drops by zero relative to commit-1 baseline (no records are deleted, only one schema field and one source-ref alternative removed).
- One new approved decision under `records/decisions/`: `decision-{YYMMDDTmmZ}-knowledge-pack-retirement.yaml` with `status: approved`, `decision_effect.action: supersede`, `decision_effect.scope: schema-improvement`, `supersedes: [record:decision-20260510T174640Z-knowledge-pack-lane-deferral]`. Filename minute substituted live at Phase-1 write time and reused in the commit-2 message.
- Deferral decision left at `status: draft`. No edit to its YAML; supersedes link from the new decision carries the disposition.
- One new evidence record: `records/evidence/loop/knowledge-pack-retirement.md`.
- 3 validator/doc-gen modules deleted; 4 validator/doc-gen modules edited (one of them — `generated-doc-content.js` — gets both the import drop and a structural edit removing the `renderCapabilities` function entirely).
- 5 record schemas drop `pack` from the URI pattern alternative list.
- Experiment schema drops `knowledge_pack_ids` from required + properties.
- 14 experiment records drop the `knowledge_pack_ids: []` field.
- `knowledge-packs/` directory absent from the working tree and from git.
- 11 pack-related negative fixtures absent from the working tree and from git.
- 4 operator-facing docs (README, charter, operator-guide, red-team-review) drop pack-related lines/paragraphs.
- 2 skill-facing docs (`.claude/skills/learning-loop/SKILL.md`, `.claude/skills/learning-loop/references/learning-loop-rules.md`) drop pack-as-active-concept guidance so future Claude sessions don't reach for `pack:<id>` post-retirement.
- Negative-fixture suite reduces from ~30 cases to ~24 cases (pack-related cases removed); every remaining case still trips.
- Tester agent status DONE; code-reviewer agent status DONE; no blocking issues.
- Two commits on `main`:
  1. `feat(ledger): record knowledge-pack lane retirement decision` (decision YAML + evidence MD; no edit to the deferral YAML).
  2. `refactor(validator): retire knowledge-pack lane per decision-{YYMMDDTmmZ}` (all code + schema + fixture + doc + dir + skill-doc deletions/edits).

## Risk Assessment

- **Risk:** A record cites a `pack:<id>` source_ref and silently breaks after the pattern alternative is removed.
  - **Mitigation:** Audited; `grep -rEn "pack:[a-zA-Z0-9_-]+" records/` returns no hits. All current experiment records have `knowledge_pack_ids: []` empty. The retirement decision documents the audit.

- **Risk:** Dropping `knowledge_pack_ids` from the experiment schema's `required` invalidates frozen historical experiments.
  - **Mitigation:** Same commit drops the field from the 14 frozen experiments. Frozen-record immutability is preserved by deleting the field cleanly (not editing semantics). Per the prospective-convention-application precedent, mechanical schema-driven field drop is treated as ledger maintenance, not semantic edit.

- **Risk:** External consumers of `pnpm check` output grep for the strings `"experiment consumes unreviewed pack"`, `"unknown knowledge pack"`, `"knowledge pack source_refs must use record references"`, or `"source_allowlist is not allowed in knowledge packs"`.
  - **Mitigation:** Audit repo for those exact strings outside `tools/validate-records/`, `fixtures/negative/`, and `records/decisions/`; remove or note breakage. Acceptable per AJV-adoption decision's "error wording change is expected when a hand-roll moves to schema" precedent — extended here to "error wording change is expected when a hand-roll is retired".

- **Risk:** A future product line wants to revive the pack lane and has to rebuild the infra from scratch.
  - **Mitigation:** Documented in the retirement decision's `tradeoffs` and `notes` blocks. Reactivation requires a new approved decision that explicitly restores the schema alternative, the validator modules, and any fixtures it needs. Pre-retirement code is recoverable from `git log` if needed. This is the operator's stated cost preference.

- **Risk:** Decision 20260510T160000Z (capabilities-stack-migration) is approved and references the per-record-type allowlist. Removing the `knowledge-packs/` token from validator code is technically a behavior change for that decision's scope.
  - **Mitigation:** 160000Z's YAML text does not mention `knowledge-packs/` — only the validator's default plumbing did. The retirement decision explicitly authorizes the code removal under `supersedes` of 174640Z and within `decision_effect.boundaries.allowed_actions`. No edit to 160000Z required.

- **Risk:** Splitting the change across two commits leaves the ledger-only commit (commit 1) in a state where the retirement decision exists but the code/schema/fixtures still reference packs. `pnpm check` must still pass at that point.
  - **Mitigation:** Commit 1 leaves all pack-related code, schemas, fixtures, the `knowledge-packs/` directory, the four operator-facing docs, and the two skill-facing docs intact; only adds the new decision + evidence. Verified by running `pnpm check` after commit 1 before proceeding to commit 2.

- **Risk:** Leaving the deferral decision (174640Z) at `status: draft` may read in a future audit as "an unresolved proposal that someone forgot about." A status flip would be more visible.
  - **Mitigation:** The new decision's `supersedes: [record:decision-20260510T174640Z-...]` field carries the disposition authoritatively; the new retirement evidence MD forward-points to the deferral evidence MD; future audits navigating the supersedes graph land on the approved retirement decision and see the full chain. A status flip to `rejected` was considered and rejected because it would conflate "proposal rejected on merits" with "operator chose retirement instead" — the supersedes-graph encodes the latter cleanly.

- **Risk:** Generated-doc tooling (`generate-docs`) silently breaks if `loadPacks` is removed but the rendering pipeline still expects pack data.
  - **Mitigation:** Only one consumer (`generated-doc-content.js`) imports `loadPacks`; the import + the `loadPacks(root)` call + the `packs` parameter + the "Eligible Knowledge Packs" section in `renderOverview` + the entire `renderCapabilities` function + the `(experiment.knowledge_pack_ids || [])` spread in `renderProposal` are all dropped in lockstep with the validator code. Note: `tools/generate-docs/generate-docs.js` currently errors with "docs generation disabled until metadata structure is finalized", so the rendering pipeline never runs today; the edits are hygienic to prevent shipping a broken static import when the pipeline is later re-enabled.

- **Risk:** Future Claude sessions in this repo read `.claude/skills/learning-loop/` and reach for `pack:<id>` source refs or pack-curation workflows, then hit validator errors after retirement lands.
  - **Mitigation:** Phase 4 explicitly quiets SKILL.md and learning-loop-rules.md so the skill no longer instructs agents to use packs. Stale guidance is the same risk the May-10 doc-quieting pass mitigated for operator-facing docs; this plan extends that quieting to the skill-facing surface.
