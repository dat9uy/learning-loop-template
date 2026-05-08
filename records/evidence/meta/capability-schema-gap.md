# Capability Schema Gap

## Observation

`capabilities.yaml` has no schema, and the current template permits an empty array.

## Evidence

The vnstock pack could not be approved because install verification failed. This prevented deriving a concrete capability shape from verified behavior, but it also showed that capabilities need room to represent blocked or pending capability candidates without publishing them as runnable facts.

Source: `records/evidence/vnstock-data/experiment-install-20260508T101723Z.md`

## Proposed Improvement

Define a capability schema only after a verified pack exists. Candidate fields should include `id`, `description`, `method`, `prerequisites`, `verified_by`, `scope`, and publication status.

## Deferral Note

Do not change canonical docs or schemas in this session. Adoption requires a future meta claim, experiment, and decision.

## Trigger

- Event class: next-pack-creation
- Threshold: N>=3 packs verified
- Action when triggered: draft capability schema candidate fields. Open meta-experiment to validate against verified packs.
