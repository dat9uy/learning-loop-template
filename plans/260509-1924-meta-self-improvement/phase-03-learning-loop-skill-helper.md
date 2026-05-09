---
phase: 3
title: "Learning-Loop Skill Helper"
status: completed
priority: P2
effort: "1.5h"
dependencies: ["phase-02"]
---

# Phase 3: Learning-Loop Skill Helper

## Overview

Add a non-mutating migration helper to the local `learning-loop` skill so future agents can produce a safe migration prompt/checklist when an explicit evidence-to-experiment migration is approved. This phase implements M3 from the next-steps report.

The helper does not mutate records. It produces a bounded prompt/checklist that the operator can hand off to a fresh agent for review.

## Context Links

- `plans/reports/next-steps-20260509-vnstock-product-and-meta.md` (Meta Plan Scoping > Phases > M3).
- `plans/reports/review-20260509-vnstock-resume-record-layer-gaps.md` (O7).
- Phase 2 of this plan (Evidence-MD to Experiment-YAML Conversion).
- Skill files:
  - `.claude/skills/learning-loop/SKILL.md`
  - `.claude/skills/learning-loop/references/prompt-blueprints.md`
  - `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md`

## Requirements

- Functional: SKILL.md classifies "evidence-to-experiment migration" as a self-improvement/helper task. `prompt-blueprints.md` has a reusable migration prompt blueprint. `meta-evidence-self-improvement.md` documents Migration / Structuring rules and the non-mutating constraint.
- Non-functional: Helper must be non-mutating (prompt/checklist output only). Defer any executable script. No edits to records, evidence, experiments, claims, packs, or schemas. No edits to global skills at `~/.claude/skills/`.

## Architecture

Three skill files updated:

1. **SKILL.md** — augments the workflow classification list to include the migration task. Adds a When-to-Use trigger.
2. **references/prompt-blueprints.md** — adds a new "Evidence-to-Experiment Migration Prompt" blueprint that an agent can copy and parameterize.
3. **references/meta-evidence-self-improvement.md** — adds a new "Evidence-to-Experiment Migration Rules" section explaining the non-mutating constraint and the link to operator-guide modes.

All three updates reference the operator-guide section landed in Phase 2.

## Related Code Files

- Modify: `.claude/skills/learning-loop/SKILL.md`
- Modify: `.claude/skills/learning-loop/references/prompt-blueprints.md`
- Modify: `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md`

## Implementation Steps

1. Confirm Phase 2 has landed (operator-guide has the "Evidence-MD to Experiment-YAML Conversion" section).
2. Update `.claude/skills/learning-loop/SKILL.md`:
   - In the "Workflow" section, step 1 (classify), add a new bullet: `- evidence-to-experiment migration`.
   - In the "When to Use" section, add a new trigger line: `- "Migrate evidence MDs to per-run experiment YAMLs."` after the existing self-improvement trigger.
3. Update `.claude/skills/learning-loop/references/prompt-blueprints.md`:
   - Add a new H2 section after "Knowledge-Pack Prompt" titled `## Evidence-to-Experiment Migration Prompt` with body:
     ````
     Use when an explicit migration of one or more evidence MDs to per-run experiment YAMLs is approved by the operator.

     ```text
     Migrate the following evidence MD(s) to per-run experiment YAML(s):

     [list of evidence MD paths, one per line]

     Work context: [absolute path to this repo]
     Reports: [absolute path to this repo]/plans/reports/
     Plans: [absolute path to this repo]/plans/

     Read first:
     - docs/operator-guide.md (Evidence-MD to Experiment-YAML Conversion).
     - docs/operator-guide.md (Experiment Result Convention).
     - The evidence MD(s) listed above.
     - Existing per-run experiment YAMLs in records/experiments/ for reference.

     For each evidence MD:

     1. Classify mode:
        - Migration: original captured a hypothesis + success metrics + decisive outcome.
        - Structuring: original lacked a clean hypothesis; post-hoc reconstruction required.
        - No migration: evidence is not experimental in nature; do not produce a YAML.

     2. Output a YAML that:
        - Preserves the original evidence MD unchanged.
        - Links source_refs back to local:records/evidence/...
        - Uses status: reviewed for Migration mode (if operator-reviewed) or draft for Structuring mode.
        - Sets `result` per the operator-guide convention (`supports`, `does-not-support`, or `inconclusive`).
        - Pairs `result_reason` (free text) when ambiguous.
        - Notes "post-hoc structuring" in `notes` for Structuring mode.

     3. Do not commit the YAML; surface for operator review.

     Forbidden:
     - Do not modify the original evidence MD.
     - Do not invent hypothesis content for Structuring mode without flagging post-hoc.
     - Do not skip operator review for Structuring outputs.
     - Do not create new schema fields.
     - Do not edit records other than the new experiment YAMLs (and only with operator approval).

     Validation:
     - Run pnpm validate:records.
     - Run pnpm check.

     Report:
     - For each evidence MD: classified mode, proposed YAML path, key fields, any unresolved questions.
     ```
     ````
4. Update `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md`:
   - Add a new H2 section after "Self-Improvement Decision Rules" titled `## Evidence-to-Experiment Migration Rules` with body:
     ```
     When the loop has an evidence-MD that should have been an experiment-YAML, defer ad-hoc conversion. Author or join an explicit migration plan that uses the Migration / Structuring modes documented in `docs/operator-guide.md` ("Evidence-MD to Experiment-YAML Conversion").

     - Migration mode: verbatim conversion when the original evidence captured a hypothesis + success metrics + decisive outcome.
     - Structuring mode: post-hoc reconstruction; pinned at `status: draft` until operator review.
     - Either mode preserves the original evidence MD.
     - The skill produces a prompt/checklist (see `references/prompt-blueprints.md` -> "Evidence-to-Experiment Migration Prompt"); it does not mutate records autonomously.
     - Defer any executable migration script until repeated migrations prove the need (N >= 3 distinct migrations).
     ```
5. Sanity-check that the three files cross-reference each other and operator-guide consistently.
6. Operator sanity-read; no validator gate fires.
7. Stop. Report process and outcome.

## Todo List

- [x] Confirm Phase 2 has landed (operator-guide has the conversion workflow section).
- [x] Update SKILL.md classification + When-to-Use trigger.
- [x] Add migration prompt blueprint to prompt-blueprints.md.
- [x] Add Migration Rules section to meta-evidence-self-improvement.md.
- [x] Verify cross-references.
- [x] Operator sanity-read.
- [x] Report process completion.

## Success Criteria

- [x] `.claude/skills/learning-loop/SKILL.md` lists "evidence-to-experiment migration" in the Workflow classify step.
- [x] `.claude/skills/learning-loop/SKILL.md` includes a When-to-Use trigger line for migration.
- [x] `.claude/skills/learning-loop/references/prompt-blueprints.md` has a complete "Evidence-to-Experiment Migration Prompt" blueprint.
- [x] `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md` has an "Evidence-to-Experiment Migration Rules" section.
- [x] All three files cross-reference operator-guide's conversion workflow (Phase 2 output).
- [x] No autonomous record mutation; helper produces prompt/checklist only.
- [x] No edits to global skills at `~/.claude/skills/`.

## Risk Assessment

- **Risk:** Skill drift with operator-guide. If Phase 2's section name or wording changes after Phase 3 lands, the cross-reference goes stale.
  - **Mitigation:** Use stable, exact section titles ("Evidence-MD to Experiment-YAML Conversion", "Experiment Result Convention"). Phase 2 must use these titles verbatim.
- **Risk:** Skill helper accidentally encourages mutation by phrasing.
  - **Mitigation:** Explicit "Forbidden" clauses in the prompt blueprint and a dedicated non-mutating note in meta-evidence rules.
- **Risk:** Operator confuses skill helper output with actual record changes.
  - **Mitigation:** Prompt blueprint says "Do not commit the YAML; surface for operator review." Skill description already says it does not modify records by itself.
- **Risk:** Editing `~/.claude/skills/learning-loop/` instead of the local `.claude/skills/learning-loop/`.
  - **Mitigation:** Use the project-local path in all Read/Edit calls. Per CLAUDE.md global rule, modify only project-local skills.

## Security Considerations

- No secrets, credentials, raw data, runtime calls, or external interactions.
- Skill helper output is text-only; never executed automatically.

## Next Steps

- This phase has no downstream phases inside this plan.
- Future trigger: N >= 3 distinct migrations executed via this helper -> consider an executable migration script in a follow-up plan.
