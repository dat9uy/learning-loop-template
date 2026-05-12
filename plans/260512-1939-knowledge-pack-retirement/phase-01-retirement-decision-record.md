---
phase: 1
title: "Retirement Decision Record"
status: pending
priority: P1
effort: "30m"
dependencies: []
---

# Phase 1: Retirement Decision Record

## Overview

Anchor the supersession in the ledger before any code lands. Write the new approved decision and the evidence record. Commit 1 is ledger-only and keeps `pnpm check` green because pack code/schema/fixtures are all still present. The deferral decision (174640Z) is left at `status: draft` — the new decision's `supersedes` link is the authoritative disposition signal; flipping the deferral status would conflate "rejected on merits" with "operator chose retirement instead."

## Requirements

- Functional: New decision YAML validates against `schemas/decision.schema.json`; supersedes link to 174640Z resolves via `validateRecordReferences`; evidence record file path resolves under the `local:` allowlist (`records/evidence/...`); no edit to 174640Z's YAML.
- Non-functional: Commit 1 is atomic and keeps `pnpm check` exit 0. No code, schema, fixture, or existing-decision touched in this phase.

## Architecture

Two new files, one commit, ledger-only.

- New decision file uses the short-year compact timestamp `YYMMDDTmmZ` per the artifact-timestamp-convention decision (260512T1321Z). Compute today's UTC capture at write time so the filename matches the `created_at` minute.
- The new decision's `decision_effect.action` is `supersede` (enum-valid) and `decision_effect.scope` is `schema-improvement`.
- The new decision's `supersedes` is `[record:decision-20260510T174640Z-knowledge-pack-lane-deferral]`. The cross-ref existence check in `validateRecordReferences` requires the target ID present in `ids`; the deferral record stays in place untouched, so the ref resolves.
- The deferral decision's YAML is not edited. Its `status: draft` plus the supersedes link from the new decision is the disposition pair. (`superseded` is not in the decision-schema status enum `[draft, reviewed, approved, rejected]`, so the supersedes-graph is the only first-class signal available.)
- Evidence record is a markdown file under `records/evidence/loop/`. Filename is timeless per the artifact-timestamp-convention (meta/loop evidence is descriptive-kebab, no timestamp).

## Related Code Files

- Create: `records/decisions/decision-{YYMMDDTmmZ}-knowledge-pack-retirement.yaml`
- Create: `records/evidence/loop/knowledge-pack-retirement.md`
- Read for context: `records/decisions/decision-20260510T174640Z-knowledge-pack-lane-deferral.yaml`, `records/evidence/loop/knowledge-pack-lane-deferral.md`, `records/decisions/decision-260512T1321Z-artifact-timestamp-convention.yaml`, `schemas/decision.schema.json`.

## Implementation Steps

1. Capture the exact current UTC minute (e.g. `date -u +"%y%m%dT%H%MZ"`) once at the start of the phase and use it as both the new decision's filename timestamp and its `created_at`/`updated_at` minute. The remainder of the filename slug is `knowledge-pack-retirement`. Full filename: `decision-{YYMMDDTmmZ}-knowledge-pack-retirement.yaml`. Reuse the captured timestamp in commit-2's message (Phase 4).
2. Write the new decision YAML with the following fields:
   - `id`: matches the filename stem.
   - `schema_version`: `"1.0"`.
   - `type`: `decision`.
   - `status`: `approved`.
   - `created_at` / `updated_at`: full ISO `YYYY-MM-DDTHH:MM:SSZ` matching the filename minute (seconds field = `00`).
   - `source_refs`: include `record:decision-20260510T174640Z-knowledge-pack-lane-deferral`, `record:decision-20260510T160000Z-capabilities-stack-migration` (parent allowlist plumbing decision), and `local:records/evidence/loop/knowledge-pack-retirement.md`.
   - `notes`: cite the predecessor plan `plans/260512-1915-source-ref-uri-pattern-schema-adoption/` (outside the records/evidence allowlist; cite here per artifact-timestamp-convention notes-as-citation pattern), the scout report `plans/reports/problem-solving-260512-1714-validate-records-simplification.md` Cascades 6+7 absorbed-by-deletion framing, and a note that 174640Z is intentionally left at `status: draft` because the supersedes graph is the disposition signal.
   - `question`: "Should the knowledge-pack lane be retired in full, or maintained in the deferred-quiet state recorded in decision-20260510T174640Z?"
   - `decision`: full retirement; concrete enumeration of what gets deleted (3 modules; 1 dir; 11 fixtures; 1 schema alt; 1 schema field; 14 record fields; 4 operator-facing doc surfaces; 2 skill-facing doc surfaces); explicit non-impact statement that decision-20260510T160000Z stays unedited because its text does not carry the knowledge-packs/ token; explicit note that decision-20260510T174640Z stays at status: draft and is not edited.
   - `rationale`: operator preference for retirement over latent infra; audit confirms zero in-flight pack:<id> refs across records; cleanup cost now is bounded because the lane is already inert.
   - `alternatives`: (a) keep 174640Z's deferral posture and only schematize pack files (Cascade 6 from the scout) — rejected because that adds 3 schemas and validator complexity to support a lane no product line uses. (b) Hard-archive: move `knowledge-packs/` under `records/_archive/` — rejected because the post-retirement state should have zero remaining surface, not a quieted-but-present surface. (c) Status quo (re-approve deferral as 'reviewed') — rejected because the operator has chosen retirement.
   - `tradeoffs`: future product lines that want packs must rebuild infra; git history preserves the pre-retirement code; doc + skill surface now carries zero pack mentions so new agents won't reach for the concept; the AJV `pack:` alternative is removed from the URI pattern so any future revival must also re-add the schema alternative.
   - `supersedes`: `["record:decision-20260510T174640Z-knowledge-pack-lane-deferral"]`.
   - `decision_effect.action`: `supersede`.
   - `decision_effect.scope`: `schema-improvement`.
   - `decision_effect.affected_refs`: enumerate the validator modules deleted, schemas edited, knowledge-packs/ paths deleted, the four operator-facing docs edited, and the two skill-facing docs edited (`local:.claude/skills/learning-loop/SKILL.md`, `local:.claude/skills/learning-loop/references/learning-loop-rules.md`).
   - `decision_effect.boundaries.allowed_actions`: enumerate the deletions and edits authorized by this decision (delete pack-source-validation.js, delete publication-gate-validation.js, delete pack-summary.js, drop knowledge-packs/ token from validator allowlist, drop pack: alternative from URI pattern, drop knowledge_pack_ids from experiment schema, delete knowledge-packs/ directory, delete 11 pack-related negative fixtures, drop pack-mention lines from README/charter/operator-guide/red-team-review, drop pack-as-active-concept guidance from .claude/skills/learning-loop/SKILL.md and .claude/skills/learning-loop/references/learning-loop-rules.md).
   - `decision_effect.boundaries.blocked_actions`: editing decision-20260510T160000Z YAML text (not required); editing decision-20260510T174640Z YAML text (deferral stays at draft, supersedes graph carries the disposition); editing historical journals or historical evidence MDs; deleting decision-20260510T174640Z (kept for supersedes-graph integrity); reactivating any pack concept without a new approved decision succeeding this one.
   - `decision_effect.boundaries.required_gates`: `pnpm validate:records`, `pnpm check`.
3. Write the evidence record `records/evidence/loop/knowledge-pack-retirement.md`. Sections: Context (cite 174640Z + the brainstorm reports it referenced + the scout simplification report); Disposition Pair (note that 174640Z stays at status: draft and the supersedes link is the disposition signal; forward-point to the deferral evidence MD which remains historical); Session Actions (commit 1 ledger-only; commit 2 atomic retirement); Files Touched (the same enumeration as the decision's affected_refs but in MD form); Audit Trail (record:pack-ref grep clean across `records/`; `knowledge_pack_ids` empty in all 14 experiments); Outcome (this evidence anchors the retirement decision; no raw pack data captured here).
4. Run `pnpm check`. Confirm exit 0. Confirm the new decision validates, the deferral decision still validates unchanged, and no new errors appear. Expected count: previous-validated-count + 1 (new decision).
5. Stage the two new files (decision YAML + evidence MD) and commit with message `feat(ledger): record knowledge-pack lane retirement decision`. Do not include any other staged changes in this commit. Do not stage any modification to the deferral YAML — it is intentionally not edited.

## Todo List

- [ ] Compute current UTC `YYMMDDTmmZ` once and reuse for filename + `created_at` + `updated_at` + commit-2 message.
- [ ] Author `records/decisions/decision-{YYMMDDTmmZ}-knowledge-pack-retirement.yaml` (status approved, action supersede, supersedes 174640Z, full enumeration in decision_effect including skill-docs in affected_refs + allowed_actions, explicit blocked_action for editing 174640Z).
- [ ] Author `records/evidence/loop/knowledge-pack-retirement.md` (Context, Disposition Pair, Session Actions, Files Touched, Audit Trail, Outcome).
- [ ] Run `pnpm check`; confirm exit 0 and validated-record count +1.
- [ ] Stage exactly the two new files and commit `feat(ledger): record knowledge-pack lane retirement decision`.
- [ ] Confirm git diff for commit 1 contains exactly two new files and zero modifications.

## Success Criteria

- [ ] New decision file present with correct timestamp filename matching the `created_at` minute.
- [ ] New decision has `status: approved`, `decision_effect.action: supersede`, `decision_effect.scope: schema-improvement`.
- [ ] New decision `supersedes` resolves via `validateRecordReferences` (no missing-record-reference error).
- [ ] New evidence MD path is under `records/evidence/loop/` and matches the `local:` allowlist for non-capability records.
- [ ] Deferral decision YAML unchanged; `git diff records/decisions/decision-20260510T174640Z-knowledge-pack-lane-deferral.yaml` returns empty.
- [ ] `pnpm check` exit 0 after the change; validated-record count is previous + 1; no warnings introduced.
- [ ] One commit on `main`: `feat(ledger): record knowledge-pack lane retirement decision`. Diff contains exactly two new files; no other paths.

## Risk Assessment

- **Risk:** New decision filename minute lags the actual write minute (e.g. minute rolls over between filename computation and the YAML write).
  - **Mitigation:** Compute timestamp once at the start of the step and reuse for both filename and `created_at`/`updated_at`. Acceptable to be a minute behind wall-clock; the timestamp is for identity, not millisecond-accurate audit. Reuse the captured timestamp in Phase 4's commit-2 message so both sides agree.

- **Risk:** Leaving 174640Z at `status: draft` may read in a future audit as an unresolved proposal that fell through the cracks.
  - **Mitigation:** The new decision's `supersedes: [record:decision-20260510T174640Z-...]` field carries the relationship semantics; the new retirement evidence MD includes a "Disposition Pair" section explicitly explaining that 174640Z stays at draft because the supersedes graph is the disposition signal; the new decision's `notes` field calls this out as intentional. Audit-trail clarity is preserved without conflating "rejected on merits" with "operator chose retirement instead".

- **Risk:** The new decision cites `record:decision-20260510T160000Z-capabilities-stack-migration` as a source_ref but does not authorize editing that decision; an auditor may read the citation as implicit edit-authorization.
  - **Mitigation:** The new decision's `decision_effect.boundaries.blocked_actions` explicitly lists "editing decision-20260510T160000Z YAML text". Citation is for context only. Similarly for 174640Z — blocked_action makes the no-edit posture explicit.
