---
title: "Meta Self-Improvement: Conventions And Skill Helper"
description: "Codify the experiment.result convention, prospective-application rule, evidence-MD to experiment-YAML conversion workflow, learning-loop skill migration helper, and phase success-criteria template. Pair the convention with two decision YAMLs."
status: completed
priority: P2
branch: "main"
tags: [meta, conventions, skill, self-improvement, learning-loop]
blockedBy: []
blocks: []
created: "2026-05-09T19:24:00+0700"
createdBy: "ck:plan"
source: skill
---

# Meta Self-Improvement: Conventions And Skill Helper

## Overview

This plan implements the deferred Step-10 self-improvement work surfaced by the vnstock review (`plans/reports/review-20260509-vnstock-resume-record-layer-gaps.md`) and scoped by the next-steps report's "Meta Plan Scoping" section (`plans/reports/next-steps-20260509-vnstock-product-and-meta.md`).

Scope is docs + skill + paired decision YAMLs only. No record/evidence/experiment/claim/pack edits. No code/schema/validator changes.

The plan covers M2 (conversion workflow), M3 (skill helper), M5 (phase success criteria template), and M6 (operator-guide convention + paired decisions). M4 (external operator actions doc) is deferred per the unset-scope rule. M7 (validator/schema deferral) is absorbed into Phase 1's first decision YAML as a no-op marker.

## Phases

| Phase | Name | Status | Effort | Priority |
|-------|------|--------|--------|----------|
| 1 | [Operator-Guide Convention And Decision Records](./phase-01-operator-guide-convention-and-decision-records.md) | Completed | 2h | P1 |
| 2 | [Evidence To Experiment Conversion Workflow](./phase-02-evidence-to-experiment-conversion-workflow.md) | Completed | 1h | P2 |
| 3 | [Learning-Loop Skill Helper](./phase-03-learning-loop-skill-helper.md) | Completed | 1.5h | P2 |
| 4 | [Phase Success Criteria Template](./phase-04-phase-success-criteria-template.md) | Completed | 1h | P2 |

## Dependencies

```
Phase 1 (M6: convention + decisions)
  └──→ Phase 4 (M5: phase success criteria references `inconclusive` semantics)

Phase 2 (M2: conversion workflow doc)
  └──→ Phase 3 (M3: skill helper references workflow modes)

Phases 1 and 2 are independent and may run in parallel.
Phases 3 and 4 are independent of each other but depend on different ancestors.
```

Cross-plan dependencies: none. The vnstock plans (`260508-2030-vnstock-install-resume`, `260509-1353-vnstock-device-limit-investigation`) closed before this plan opens. The dimension-rewrite plan (`20260508-dimension-based-lifecycle-rewrite`) is `completed`. No overlapping file ownership.

## Approval Surfaces

Declared upfront so the operator can scope approval once:

- `docs/operator-guide.md` — Phases 1, 2, 4.
- `.claude/skills/learning-loop/` — Phase 3 (`SKILL.md`, `references/prompt-blueprints.md`, `references/meta-evidence-self-improvement.md`).
- `records/decisions/` — Phase 1 paired decisions (two YAMLs).

No edits to: `records/claims/`, `records/evidence/`, `records/experiments/`, `records/risks/`, `records/observations/`, `records/capabilities/`, `records/backlog-items/`, `records/validation-gates/`, `knowledge-packs/`, `tools/`, `schemas/`, `package.json`, `pnpm-lock.yaml`.

## Decision Records (Phase 1 Paired Output)

Two decision YAMLs are authored alongside the operator-guide convention:

- `decision-20260509T192448Z-experiment-result-convention.yaml` — codifies `experiment.result: supports | does-not-support | inconclusive` plus `result_reason`. It uses validator-allowed evidence refs and cites the next-steps/review reports in `notes`. Schema-enum hardening is explicitly blocked until N >= 3 distinct experiments use the convention without strain (M7's deferral folded in).
- `decision-20260509T192449Z-prospective-convention-application.yaml` — codifies the rule that new conventions apply prospectively unless an explicit migration is approved. It uses validator-allowed evidence refs and cites the run-1 vnstock install YAML drift as the precipitating case.

These are authored as part of Phase 1, not as separate phases. If Phase 4 (M5) needs its own decision when codified, that is added inside Phase 4.

## Out of Scope (Explicit; Do Not Re-Open Inside This Plan)

- **M4** (External Operator Actions doc) — deferred per the unset-scope rule. The device-clearance case is N=1 of "External Operator Actions Between Reruns"; the sandbox falsification observed the *effect* of that action, not a second instance of the action class. Re-open trigger: a second concrete operator-side mutation between reruns is recorded.
- **M7** (Validator/Schema deferral) — absorbed into Phase 1's first decision YAML as a `blocked_actions` clause. No separate work.
- **O9** (Durable-fact extraction + pack promotion queue) — gated on R-Q5 scope decision (foundational fact/capability layer not yet decided).
- **O11** (Abandoned/parked status pathway) — only fires if a future rerun also fails.
- **P1-P5** (All product track work, including the brainstorm tier/cap supersede sweep) — separate plan.
- **Item D** (Recurring-clearance vs subscription class) — only fires when a concrete rerun is scheduled.
- **Item E** (Container-substrate dependency record class) — only fires at N >= 2 or scope decision.
- **R-Q5** (Knowledge-pack publication preconditions and grade split) — foundational scope decision still unset.
- **Schema enum constraint on `experiment.result`** — convention only; schema waits for N >= 3.
- **Modifications to global rules** at `~/.claude/rules/` — project-local conventions only.
- **Vnstock experiment reruns or pack publication** — meta plan, not domain work.

## Validation

- Phase 1: `pnpm validate:records` (decision YAMLs) and `pnpm check` after each YAML lands.
- Phases 2 and 4: docs edits only; no validator gates fire. Operator sanity-read.
- Phase 3: skill edits only; no validator gates fire. Operator sanity-read of generated prompt/blueprint shape.

## Inputs

- `plans/reports/next-steps-20260509-vnstock-product-and-meta.md` (Meta Plan Scoping section is the authoritative spec).
- `plans/reports/review-20260509-vnstock-resume-record-layer-gaps.md` (R-Q3, R-Q4, O7, O8, O10, O15 origins).
- `docs/operator-guide.md` (current edit surface).
- `.claude/skills/learning-loop/` (current edit surface).
- `records/decisions/decision-20260508-loop-dimension-model.yaml` (decision schema reference).
- `records/decisions/decision-20260509T070411Z-vnstock-vendor-device-limit-clearance.yaml` (decision schema reference).
- `schemas/experiment.schema.json` (confirms `result` is unconstrained `string`; convention-only is the right fit).

## Key Decisions

- **Convention before schema.** `experiment.result` lands as docs convention; schema enum waits for N >= 3 distinct experiments.
- **Prospective application.** Historical records (notably run-1 vnstock install YAML at `result: does-not-support`) are not rewritten; the convention's `Convention Application` clause governs interpretation.
- **One workflow with two modes for evidence-to-experiment conversion.** Migration (verbatim) and Structuring (post-hoc; `status: draft` until operator review).
- **Skill helper is non-mutating.** Produces a prompt/checklist; never edits records autonomously.
- **M5 lives in `docs/operator-guide.md`** as a project-local subsection, not in the global rules file.
- **M4 deferred** per N=1 and the unset-scope memory rule.

## Success Criteria

- [x] `docs/operator-guide.md` has new sections: "Experiment Result Convention" (with "Convention Application" subsection), "Evidence-MD to Experiment-YAML Conversion", "Phase Success Criteria".
- [x] `records/decisions/decision-20260509T192448Z-experiment-result-convention.yaml` exists and validates.
- [x] `records/decisions/decision-20260509T192449Z-prospective-convention-application.yaml` exists and validates.
- [x] `.claude/skills/learning-loop/SKILL.md` recognizes "evidence-to-experiment migration" as a task class.
- [x] `.claude/skills/learning-loop/references/prompt-blueprints.md` has an "Evidence-to-Experiment Migration Prompt" blueprint.
- [x] `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md` has Migration / Structuring mode rules.
- [x] `pnpm validate:records` passes after Phase 1.
- [x] `pnpm check` passes after Phase 1.
- [x] Out-of-scope items remain untouched (no record/evidence/schema/pack edits).

## Completion Notes

- Completed on 2026-05-09.
- Validation passed: `pnpm validate:records` (`Validated 12 records.`) and `pnpm check`.
- Implementation adjusted the planned decision `source_refs` because the validator disallows `local:plans/reports/...`; report citations were preserved in `notes`, while `source_refs` point to durable evidence records.

## Risk Assessment

- **Convention drift on historical records.** Mitigated by the prospective-application decision YAML.
- **Skill helper mutating records autonomously.** Mitigated by Phase 3's non-mutating constraint and the skill's existing security policy.
- **Operator-guide bloat.** Three new subsections; current file is 215 lines, manageable. If the file exceeds 400 lines after edits, split into sub-docs in a follow-up plan.
- **Decision YAMLs pointing to records that change later.** Mitigated by `source_refs` to reports and the convention's prospective-application clause.

## Re-Open Triggers

- **M4**: a second operator-side mutation between reruns is recorded.
- **M7 (schema enum on `experiment.result`)**: N >= 3 distinct experiments use the convention without strain.
- **O9 / R-Q5**: foundational fact/capability scope decision lands.
- **O11**: a future rerun also fails permanently.

## Next Steps After Plan Completion

- Pass to `ck:cook` for execution.
- After completion, return to the next-steps report's Recommended Sequence: step 2 (P4 supersede sweep, product track) and step 3 (operator product-target decision).
