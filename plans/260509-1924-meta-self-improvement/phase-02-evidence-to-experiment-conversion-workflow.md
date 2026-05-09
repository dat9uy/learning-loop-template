---
phase: 2
title: "Evidence To Experiment Conversion Workflow"
status: completed
priority: P2
effort: "1h"
dependencies: []
---

# Phase 2: Evidence To Experiment Conversion Workflow

## Overview

Document the one-workflow-two-modes pattern for converting evidence MDs into structured experiment YAMLs. This phase implements M2 from the next-steps report and is the docs-side companion to Phase 3's skill helper.

## Context Links

- `plans/reports/next-steps-20260509-vnstock-product-and-meta.md` (Meta Plan Scoping > Phases > M2).
- `plans/reports/review-20260509-vnstock-resume-record-layer-gaps.md` (R-Q3 resolution, O7).
- The vnstock evidence MDs that motivated this workflow:
  - `records/evidence/vnstock-data/experiment-install-20260508T101723Z.md` (run-1, decisive outcome — Migration mode example).
  - `records/evidence/vnstock-data/experiment-install-20260508T171112Z.md` (run-2, blocked at vendor gate — Structuring mode might apply if hypothesis was reconstructed; in this case Migration was used because hypothesis was clear).

## Requirements

- Functional: `docs/operator-guide.md` documents one workflow with two named modes (Migration and Structuring) for evidence-MD-to-experiment-YAML conversion. The workflow is referenced by Phase 3's skill helper. The doc text matches the spec in the next-steps report's Meta Plan Scoping section.
- Non-functional: No edits to existing records or evidence files. No conversion executed inside this phase. No schema or validator changes.

## Architecture

The workflow doc lives as a new H2 section in `docs/operator-guide.md`, placed immediately after Phase 1's "Experiment Result Convention" section. The section explains:

1. Up-front mode classification on the source evidence MD.
2. Migration mode: verbatim copy when the source had hypothesis + success metrics + decisive outcome.
3. Structuring mode: post-hoc reconstruction when the source lacked a clean hypothesis; output pinned at `status: draft` until operator review.
4. Shared rules: original evidence preserved unchanged, `source_refs` linkage, validation requirements.

The doc text references Phase 1's `experiment.result` convention so Migration mode produces convention-compliant YAMLs.

## Related Code Files

- Modify: `docs/operator-guide.md`

## Implementation Steps

1. Confirm Phase 1 has landed (or the section is a forward reference; either is acceptable since these phases may run in parallel).
2. Add a new H2 section to `docs/operator-guide.md` titled `## Evidence-MD to Experiment-YAML Conversion`, placed immediately after `## Experiment Result Convention` (or at the equivalent insertion point if Phase 1 is concurrent), with body:
   ```
   When converting an evidence MD into a structured experiment YAML, classify the source MD up front. Both modes share the experiment YAML output schema and the audit linkage (`source_refs` -> the original evidence MD); modes differ in whether `hypothesis` and `success_metrics` are reconstructed verbatim or marked post-hoc.

   ### Mode: Migration

   The original evidence MD captured a hypothesis, success metrics, and a decisive outcome. The conversion is verbatim:

   - `hypothesis`, `success_metrics`, and `result` carry over without reinterpretation.
   - `source_refs` lists the original evidence MD using `local:records/evidence/...`.
   - `result_reason` (if needed) cites the same passage that justified the original outcome.
   - The output YAML status is `reviewed` if the original was operator-reviewed; otherwise `draft`.
   - `result` follows the convention from "Experiment Result Convention".

   ### Mode: Structuring

   The original evidence MD lacked a clean hypothesis or success metrics. Reconstruction is post-hoc:

   - `hypothesis` and `success_metrics` are reconstructed from the evidence narrative; mark them as post-hoc in `notes`.
   - `result` is `inconclusive` unless the evidence is decisive on its own; never `supports` or `does-not-support` without operator confirmation.
   - The output YAML is pinned at `status: draft` until operator review.

   ### Shared Rules

   - Both modes preserve the original evidence MD unchanged.
   - Both modes link `source_refs` back to the original evidence MD.
   - Conversion runs only after the operator approves an explicit migration plan; no ad-hoc conversion.
   - Run `pnpm validate:records` and `pnpm check` after each approved batch.
   - For prompt/checklist support, see the `learning-loop` skill (`evidence-to-experiment migration` task class) at `.claude/skills/learning-loop/`.
   ```
3. Verify the new section flows correctly with surrounding text. Check that the link to the skill is accurate (skill lives at `.claude/skills/learning-loop/`).
4. Operator sanity-read; no validator gate fires for docs edits.
5. Stop. Report process and outcome.

## Todo List

- [x] Confirm/coordinate Phase 1 insertion point.
- [x] Add "Evidence-MD to Experiment-YAML Conversion" section with Migration, Structuring, and Shared Rules subsections.
- [x] Verify cross-references to "Experiment Result Convention" (Phase 1) and the learning-loop skill (Phase 3 surface).
- [x] Operator sanity-read.
- [x] Report process completion.

## Success Criteria

- [x] `docs/operator-guide.md` contains the "Evidence-MD to Experiment-YAML Conversion" section with Migration, Structuring, and Shared Rules subsections.
- [x] The section references the "Experiment Result Convention" from Phase 1.
- [x] The section references the `learning-loop` skill at `.claude/skills/learning-loop/`.
- [x] No edits to records, evidence, experiments, schemas, or skill files beyond the Phase 1 decision records.

## Risk Assessment

- **Risk:** Section insertion conflicts with Phase 1 if both phases edit the same area concurrently.
  - **Mitigation:** Sequence the edits if running in parallel; one phase per editor at a time on `docs/operator-guide.md`. If conflict, retry the edit with a re-read of the file.
- **Risk:** Forward reference to a skill task class that Phase 3 has not yet renamed.
  - **Mitigation:** The reference is to a stable path (`.claude/skills/learning-loop/`) and a stable task name (`evidence-to-experiment migration`). Phase 3 implements that name; Phase 2 just references it.

## Security Considerations

- Docs edit only; no code, runtime, secrets, or external calls.

## Next Steps

- Phase 3 depends on this phase: the skill helper references the workflow modes documented here.
