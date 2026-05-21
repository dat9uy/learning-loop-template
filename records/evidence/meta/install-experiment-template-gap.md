---
capability: meta
dimension: install
scope: meta-tooling
validation_status: passed
---

# Install Experiment Template Gap

## Findings

- [install-template-gap] No reusable install experiment template existed for flows requiring archive wrapper, extracted entrypoint, runner deps, and env-var config.
- [template-candidate] Four vnstock install experiments accumulated; three converge on stable 7-section envelope + 11-key frontmatter.
- [legacy-outlier] Fourth experiment predates convention and classified as legacy outlier, excluded from convergence analysis.
- [resolution-path] Meta-experiment + draft template candidate gated by follow-up decision before canonization (N>=2 class).
- [trigger-consumed] Prior trigger (event class `next-install-experiment`, threshold N=2) consumed by vnstock experiments; new trigger set for next non-vnstock case.

## Observation

## Observation

No reusable install experiment template exists for installer flows that require a separate archive wrapper, extracted entrypoint, runner dependencies, and environment-variable configuration.

## Evidence

The vnstock install experiment showed that the planned command shape was too specific. The archive wrapper and embedded installer had different option behavior, and the embedded installer used environment variables instead of the prior documented config file assumption.

Source: `records/evidence/vnstock-data/experiment-install-20260508T101723Z.md`

## Proposed Improvement

Create an install experiment template that separates:

- archive wrapper inspection
- extracted entrypoint inspection
- runner dependency setup
- target venv creation
- allowed metadata capture
- cleanup confirmation

## Deferral Note

Do not adopt a canonical template from this single failed case. Validate the shape against additional install experiments first.

## Resolution

Status (2026-05-12): original trigger threshold (N=2 install experiments) has been **consumed**. Four vnstock install experiments accumulated under `records/evidence/vnstock-data/`; three of them (`experiment-install-20260508T171112Z.md`, `experiment-install-20260509T071800Z-sandbox-1.md`, `experiment-install-20260509T071900Z-sandbox-2.md`) converge on a stable 7-section body envelope plus 11-key YAML frontmatter. The fourth (`experiment-install-20260508T101723Z.md`) predates the convention and is classified as legacy outlier.

Per `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md` Gap Classification by Sample Count (N>=2 class), the resolution path is meta-experiment + draft template candidate, gated by a follow-up decision before canonization.

Artifacts produced under brainstorm `plans/reports/brainstorm-260512-0046-install-template-and-capability-schema-gap-revisit.md` and plan `plans/260512-0046-meta-evidence-gap-revisit/`:

- Template candidate: `records/evidence/meta/install-experiment-template-candidate.md` (draft; not yet canonical)
- Meta-experiment: `records/experiments/experiment-meta-install-template-candidate-260512T0046Z.yaml` (status: draft)

The candidate is not promoted to canonical in this resolution step. Promotion requires the new trigger below to fire and the meta-experiment to pass.

## Trigger

- Event class: next-non-vnstock-install-experiment
- Threshold: N=1
- Action when triggered: compare the new install experiment's envelope shape against the template candidate. If it fits without forcing new required sections, promote the candidate via a follow-up decision (possible new home: `docs/templates/install-experiment-template.md` or successor location chosen at promotion time). If it does not fit, revise the candidate to capture the new required structure and re-run the meta-experiment.
- Historical note: the prior trigger (event class `next-install-experiment`, threshold `N=2`) was consumed by the four vnstock install experiments and is preserved above as `## Resolution` rather than rewritten in-place.
