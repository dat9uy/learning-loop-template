# Runtime Run Schema Deferral

## Observation

The Runtime Artifact Standard currently keeps runtime envelopes as markdown evidence until repeated cases prove a stable schema.

## Evidence

The vnstock install experiment produced useful fields, but the failed result also added fields that were not in the planned envelope, such as archive entrypoint class and option-behavior mismatch.

Source: `records/evidence/vnstock-data/experiment-install-20260508T101723Z.md`

## Proposed Improvement

Track runtime experiment count and formalize a schema after at least three install or runtime experiments demonstrate repeated envelope fields.

## Deferral Note

Update this file when additional runtime experiments run. Canonical adoption requires a decision record.

## Trigger

- Event class: next-runtime-experiment
- Threshold: N=3 total runtime cases
- Action when triggered: formalize envelope schema candidate. Open meta-experiment.
