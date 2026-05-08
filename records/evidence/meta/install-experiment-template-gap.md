# Install Experiment Template Gap

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

## Trigger

- Event class: next-install-experiment
- Threshold: N=2
- Action when triggered: compare envelope shapes. If repeated fields appear, draft template candidate.
