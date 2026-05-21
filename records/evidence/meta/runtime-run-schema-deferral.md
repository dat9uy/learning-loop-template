---
capability: meta
dimension: runtime
scope: meta-tooling
validation_status: draft
---

# Runtime Run Schema Deferral

## Findings

- [runtime-schema-deferral] Generic `runtime_run` YAML schema deferred until repeated runtime proof cases demonstrate stable pattern.
- [envelope-formalization] Envelope fields currently live as markdown sections inside evidence, protocol, or experiment files.
- [trigger-threshold] Revisit trigger: N=3 total runtime cases; current count below threshold.
- [update-protocol] Update this file when additional runtime experiments run; canonical adoption requires decision record.
- [deferred-tooling] Automated in-repo temp scanner also deferred alongside schema formalization.

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
