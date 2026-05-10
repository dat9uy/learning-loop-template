# Lab Model

## Record Ledger

Records are human-edited source files under `records/`. They describe claims, experiments, decisions, risks, and capability records in a small typed format. Evidence files live under `records/evidence/` and are cited by records.

## Entity Roles

| Entity | What it does | How it helps learning |
|---|---|---|
| Evidence/source material | Captures where information came from and its limits. | Preserves durable context without pretending it is verified truth. |
| Claim record | States a candidate assertion and links sources/experiments. | Gives the loop something precise to verify, reject, or qualify. |
| Risk record | States conditional caution, severity, confidence, and mitigation. | Prevents weak/ambiguous knowledge from becoming unsafe capability. |
| Experiment record | Records review, verification, runtime check, build test, or rejection. | Proves or rejects non-product verification dimensions. |
| Decision record | Records human/policy authority and scoped effects. | Separates permission from technical verification. |
| Capability record | Maps verified library surfaces (claims) to product surfaces (`route_class`, `view_class`). | Binds upstream verification to the build target without smuggling implementation detail. |
| Capability script | Standalone feasibility probe under `product/<stack>/capabilities/<scope>/`. | Tests API-return-data runtime; substrate for the runtime-verification experiment, not product code. |
| Derived claim assurance | Projects claim strength from claim dimensions and linked experiments. | Avoids duplicated assurance ladders on claims. |

## Core Hierarchy

```text
records/evidence/      -> durable source material
records ledger         -> claims + risks + experiments + decisions + capability records
capability scripts     -> product/<stack>/capabilities/ (runtime-verification substrate)
derived claim assurance -> effective assurance from verification dimensions and decisions
generated views        -> disabled until model settles
```

Short version:

```text
records/evidence -> claims + risks + experiments -> dimensions -> capability scripts (product/<stack>/capabilities/) -> capability records (records/capabilities/) -> decisions
```

Capability scripts are standalone feasibility probes that test API-return-data runtime. They live in `product/<stack>/capabilities/` before product approval because they are not product implementations. Capability records are the YAML ledger entries that bind verified library surfaces to product surfaces; they are authored only during a product-build plan.

## Philosophy Rules

1. Source/evidence supports claims and grounds risks; it is not proof by itself.
2. Proof is experiment outcome plus the `verification.proves` dimension, not a separate entity.
3. Experiments use `verification.proves`; claims store dimension status, not assurance.
4. Source-only state stays implicit from `source_refs`; verification starts at `claimed`.
5. Claim assurance is derived from valid verification dimensions; do not duplicate it elsewhere.
6. Risk confidence is not claim assurance.
7. Product approval is a decision effect, not an assurance level.
8. Decisions approve boundaries; experiments produce outputs within those boundaries.
9. Capability records cite claims and capability-script paths; they do not embed raw evidence.
10. Capability records are bound by the per-record-type allowlist: only capability records may cite `local:product/*/capabilities/...`.

## Verification Axes

Keep these axes separate:

| Axis | Applies to | Meaning |
|---|---|---|
| Record status | claims, experiments, decisions, capability records | Editorial/review state. |
| Risk status | risks | Candidate/reviewed/active/mitigated/accepted/rejected caution state. |
| Risk confidence | risks | Credibility/usefulness of a caution. |
| Experiment outcome | experiments | Supports, rejects, or inconclusive. |
| Experiment proof | experiments | Dimension and scope proved by the experiment. |
| Claim verification dimensions | claims | Independent static/install/runtime/product statuses. |
| Derived claim assurance | claims | Effective assurance from valid dimensions and linked experiments. |
| Decision basis | decisions | Evidence/records/experiments used as rationale. |
| Decision effect | decisions | Scoped approval/rejection/acceptance/mitigation/defer/supersede. |
| Capability map | capability records | Mapping of verified library surfaces to product surfaces. |

## Product Generation Loop

The loop reads the record ledger (claims, experiments, decisions, capability records) and emits a proposal or a no-build decision. Capability records are the technical bridge between a verified library claim and a product surface; they make the build target machine-checkable without committing to product implementation. The loop does not create product code in this template.
