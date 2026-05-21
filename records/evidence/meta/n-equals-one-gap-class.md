---
capability: meta
dimension: static
scope: meta-tooling
validation_status: passed
---

# N Equals One Gap Class

## Findings

- [gap-classification] Meta-evidence gaps split by sample-count requirement: N=1 closeable vs N>=2 deferred.
- [sample-count-heuristic] N=1 closeable: principle applies from single instance (e.g., process-side artifact ambiguity). N>=2 deferred: schema/template needs repeated cases before canonization.
- [classification-examples] N=1: `process-side-artifact-ambiguity`. N>=2 deferred: `capability-schema-gap`, `runtime-run-schema-deferral`, `install-experiment-template-gap`.
- [trigger-rule] Classify new meta-evidence by sample-count requirement and mirror classification in its `## Trigger` section.
- [canonized] Classification rule canonized in learning-loop skill reference `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md`.

## Observation

## Observation

Meta-evidence gaps split by sample-count requirement. Some gaps are single-instance principles; others are schemas or templates that need repeated cases before canonization.

## Evidence

- `plans/reports/brainstorm-20260508-resume-vnstock-and-meta-loop.md`
- `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md`

## Classification Examples

- N=1 closeable: `records/evidence/meta/process-side-artifact-ambiguity.md`
- N>=2 deferred: `records/evidence/meta/capability-schema-gap.md`
- N>=2 deferred: `records/evidence/meta/runtime-run-schema-deferral.md`
- N>=2 deferred: `records/evidence/meta/install-experiment-template-gap.md`

## Trigger

- Event class: next-meta-evidence-creation
- Threshold: N=1
- Action when triggered: classify the new evidence by sample-count requirement and mirror the classification in its `## Trigger` section.

## Deferral

This remains a heuristic. Promote it to a meta-claim only if a second loop iteration confirms the split holds.

## Superseded By

- `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md` "Gap Classification by Sample Count" (commit `4e42853`) - The N=1 vs N>=2 classification rule has been canonized in the learning-loop skill reference. This evidence remains as the rationale and example source. Promotion to a meta-claim is still pending second-loop confirmation per the original deferral.
