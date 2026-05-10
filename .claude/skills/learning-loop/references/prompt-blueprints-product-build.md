# Product Build Prompt Blueprints

## Pre-Build Record Authoring

```text
Task: Prepare records for a product-build experiment.

Work context: /home/datguy/codingProjects/learning-loop-template

Read first:
- docs/operator-guide.md
- docs/claim-verification.md
- relevant records and knowledge packs

Goal:
- Author claims, risks, experiments, and decisions needed before application code exists.
- Identify any capability records that cite `local:product/<stack>/capabilities/...`.

Constraints:
- Do not create application code.
- Do not cite `local:product/<stack>/capabilities/...` from non-capability records.
- Use qualified terms: capability script, capability record, Capability Runtime Experiment.

Validation:
- Run pnpm validate:records.
- Run pnpm check.
```

## Skill-Phase Constraint Prompt

```text
Task: Implement only the approved product-build phase.

Work context: /home/datguy/codingProjects/learning-loop-template

Allowed scope:
- Approved stack and surface from the decision record.
- Existing capability scripts under `product/<stack>/capabilities/` as reference substrate only.

Forbidden actions:
- Do not expand product scope beyond the approved decision.
- Do not capture raw external data, credentials, private config, or local vendor metadata.
- Do not edit frozen historical records.

Validation:
- Run stack validators and repo validators.
```

## Post-Build Verification Prompt

```text
Task: Close the product-build verification loop.

Work context: /home/datguy/codingProjects/learning-loop-template

Goal:
- Capture safe metadata-only results.
- Update experiment observations and claim verification proof refs.
- Keep capability-record source refs locked to `local:product/<stack>/capabilities/...`.

Validation:
- Run pnpm validate:records.
- Run pnpm check.
- Report unresolved questions last.
```
