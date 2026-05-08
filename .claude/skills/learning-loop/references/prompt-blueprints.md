# Prompt Blueprints

Use these as building blocks. Replace bracketed text. Remove sections that do not apply.

## Answer Format to User

When the user asks how to prompt the learning loop, answer with:

1. `Recommended prompt` — ready to paste.
2. `Required approvals` — explicit lines the user must add, if any.
3. `Why this shape` — 1-3 bullets.
4. `Unresolved questions` — only if needed.

## Clarifying Questions

Ask before drafting if any are unclear:

- What is the target scope/domain/source?
- Should the agent only plan, or may it modify records?
- Does the task require install/runtime/live access?
- What outputs are allowed and forbidden?
- Should self-improvement/meta evidence be created or only proposed?

## Generic Learning-Loop Prompt

```text
Task: [specific learning-loop task].

Work context: [absolute path to this repo]
Reports: [absolute path to this repo]/plans/reports/
Plans: [absolute path to this repo]/plans/

Read first:
- README.md
- docs/operator-guide.md
- docs/claim-verification.md
- [task-specific docs/records]

Goal:
- [desired outcome]

Allowed sources:
- [local docs, records, evidence, packs]

Forbidden sources/actions:
- Do not copy implementation from historical repos.
- Do not read secrets or private config unless separately approved.
- Do not capture raw external data, private artifacts, caches, logs, or temp files.
- Do not create product code or product approval changes unless explicitly approved.

Evidence policy:
- Capture only [metadata/classes].
- Cite durable local evidence with `local:records/evidence/...`.
- Cite records with `record:<id>`.
- Keep meta evidence under `records/evidence/meta/` if this task improves the loop itself.

Expected artifact changes:
- [files to update or create]

Validation:
- Run `pnpm validate:records`.
- Run `pnpm check`.

Report:
- What changed.
- What evidence supports it.
- What remains blocked.
- Any unresolved questions.

Stop and ask before proceeding if the task requires authority beyond this prompt, secret/config access, raw data capture, temp artifact retention, or product approval without a decision.
```

## Runtime or Install Proof Prompt

Use only when the user explicitly approves bounded execution.

```text
Run the approved [scope] runtime/install proof experiment.

Work context: [absolute path to this repo]
Reports: [absolute path to this repo]/plans/reports/
Plans: [absolute path to this repo]/plans/

I explicitly approve:
1. [approved gate or proof class]
2. Creating an OS temp directory outside the repo.
3. Creating a venv/temp HOME inside that temp directory.
4. Deleting all temp artifacts after curated metadata is recorded.

Approval boundaries:
- Do not modify repo dependencies, package manifests, lockfiles, product code, or real HOME.
- Do not retain install artifacts, venv files, private package files, caches, logs, config files, or temp dirs.
- Do not capture credentials, API keys, config contents, raw external data, row indexes, dates, periods, identifiers, or raw JSON payloads.
- Only write curated metadata to the approved experiment/evidence records.

Gate goal:
- [what to verify]

Allowed output:
- success/failure classification
- package/import/callable metadata
- result type and shape metadata if approved
- sanitized exception class/category
- temp root class, never literal path

After running:
- Update [evidence files]
- Update [experiment record]
- Capture envelope fields: `run_id`, `temp_root_class`, `approval_gate`, `command_class`, `allowed_outputs`, `blocked_outputs`, `cleanup_status`, `temp_root_deleted`, `validation_status`.
- Cleanup is part of proof success; failed cleanup blocks promotion.
- If cleanup fails or deletion cannot be confirmed, mark the proof blocked/failed and do not verify the dimension or pack capability.
- Run `pnpm validate:records` and `pnpm check`.
- Report verified items, failed items, blocked items, and deletion confirmation.

Stop and ask before reading/copying any private config file, exposing secrets, capturing raw data, retaining logs/caches/private artifacts, or continuing after cleanup failure.
```

## Experiment Planning Prompt

```text
Plan a learning-loop experiment for [goal].

Do not execute the experiment yet. Produce an experiment proposal that states:
- claim_refs, risk_refs, source_refs, pack_refs if any
- hypothesis and success criteria
- allowed inputs and forbidden captures
- verification dimension target using `verification.proves`
- required approvals
- evidence files to create/update
- validation commands
- conditions that block dimension verification or product approval

Keep product code deferred unless the experiment explicitly approves a build surface.
```

## Knowledge-Pack Prompt

```text
Curate or review a knowledge pack for [scope].

Use only reviewed/approved records and cite `record_ref`; do not cite raw evidence paths from the pack. Keep the pack slim and consumer-facing. Report excluded claims, unresolved risks, and whether the pack can be consumed by experiments.
```
