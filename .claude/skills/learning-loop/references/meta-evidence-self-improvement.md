# Meta Evidence and Self-Improvement

Use this reference when the user wants the loop to improve itself or when prompt drafting reveals a policy/schema/tooling gap.

## When to Use Meta Flow

Use meta flow for:

- repeated prompt ambiguity
- missing or weak loop policy
- validator gaps
- schema drift or deferred schema decisions
- runtime envelope pattern changes
- documentation boundaries for the learning loop itself
- agent handoff/prompt standards

Do not use meta flow for domain evidence. Domain facts stay under their domain evidence scope, e.g. `records/evidence/<domain-or-source>/`.

## Meta Governance Rule

Self-improvement evidence category is `meta` and must stay apart from other evidence.

Preferred durable evidence path:

```text
records/evidence/meta/<descriptive-kebab-slug>.md
```

Meta evidence must say it documents loop architecture or operating policy, not domain facts. It must not contain credentials, raw external data, private config, raw domain outputs, or product code.

Create or review meta risk and decision records when the gap has durable governance impact:

- Risk records: use `records/risks/risk-<date>-loop-<slug>.yaml` when residual exposure persists.
- Decision records: use `records/decisions/decision-<date>-loop-<slug>.yaml` when a loop-level policy choice, deferral, approval, or revisit trigger must be pinned.
- Link them with `source_refs` to `local:records/evidence/meta/...` and `record:` refs.
- State in `notes` that the record is meta/loop architecture, not domain evidence.
- Do not invent a new schema field just to mark `meta`; follow existing risk/decision schemas.

## Meta Prompt Template

```text
Analyze this learning-loop gap: [gap].

Work context: [absolute path to this repo]
Reports: [absolute path to this repo]/plans/reports/
Plans: [absolute path to this repo]/plans/

Read first:
- README.md
- docs/operator-guide.md
- docs/lab-model.md
- [specific files that show the gap]

Goal:
- Improve prompt/rule clarity for future agents without mixing meta evidence into domain evidence.

Allowed actions:
- Propose or update meta evidence under `records/evidence/meta/`.
- Review existing loop risks and decisions before creating new ones.
- Create or update meta risk records when residual exposure persists.
- Create or update meta decision records when a loop-level policy choice, deferral, approval, or revisit trigger must be pinned.
- Update docs only if the rule is stable and belongs in docs/ rather than a temporary evidence note.

Forbidden actions:
- Do not edit domain evidence.
- Do not capture raw external data, secrets, config contents, logs, or temp files.
- Do not add schemas or validators unless explicitly approved.
- Do not promote domain claims or product work.

Evidence policy:
- Category: `meta`.
- Capture rationale, current state, deferred questions, revisit triggers, residual exposure.
- Link existing `record:` risks/decisions when available.
- If creating risk/decision records, link them back to the meta evidence and to each other where relevant.
- Do not create risk/decision records for minor wording tweaks with no persistent exposure or policy choice.

Validation:
- Run `pnpm validate:records`.
- Run `pnpm check`.

Report:
- Gap analyzed.
- Meta evidence changed or proposed.
- Meta risks reviewed, created, or updated.
- Meta decisions reviewed, created, or updated.
- Decisions deferred vs made.
- Revisit triggers.
- Unresolved questions.
```

## Self-Improvement Decision Rules

- Prefer documenting a gap before adding a schema or validator.
- Add tooling only after repeated evidence shows review burden or drift.
- Create or update a risk when residual exposure remains after the current change.
- Create or update a decision when the loop needs an explicit policy choice, deferral, approval, boundary, or revisit trigger.
- Review existing loop risks and decisions first; update/link them instead of creating duplicates.
- Record deferred questions with clear revisit triggers.
- Fail closed for privacy, cleanup, authority, and lifecycle promotion uncertainty.
- Keep docs domain-neutral; store domain evidence in records/evidence and packs.
