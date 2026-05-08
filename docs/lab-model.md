# Lab Model

## Record Ledger

Records are human-edited source files under `records/`. They describe claims, experiments, decisions, and risks in a small typed format. Evidence files live under `records/evidence/` and are cited by records and packs.

## Entity Roles

| Entity | What it does | How it helps learning |
|---|---|---|
| Evidence/source material | Captures where information came from and its limits. | Preserves durable context without pretending it is verified truth. |
| Claim record | States a candidate assertion and links sources/experiments. | Gives the loop something precise to verify, reject, or qualify. |
| Risk record | States conditional caution, severity, confidence, and mitigation. | Prevents weak/ambiguous knowledge from becoming unsafe capability. |
| Experiment record | Records review, verification, runtime check, build test, or rejection. | Produces assurance and outcome; this is proof in the system. |
| Decision record | Records human/policy authority and scoped effects. | Separates permission from technical verification. |
| Derived claim assurance | Projects claim strength from linked experiments. | Avoids duplicated assurance ladders on claims. |
| Publication gate | Defines what is enough for a pack scope. | Keeps low-trust workbench material out of consumer packs. |
| Knowledge pack | Exposes final facts and capabilities. | Gives consumers a clean interface without internal evidence clutter. |

## Core Hierarchy

```text
records/evidence/ -> durable source material
records ledger -> claims + risks + experiments + decisions
derived claim assurance -> effective assurance from linked experiments and decisions
publication gates -> policy for pack scope and minimum assurance
knowledge packs -> manifest + facts + capabilities
generated views -> disabled until model settles
```

Short version:

```text
records/evidence -> claims + risks + experiments -> derived assurance -> decisions/gates -> pack facts/capabilities
```

## Philosophy Rules

1. Source/evidence supports claims and grounds risks; it is not proof by itself.
2. Proof is experiment outcome plus experiment assurance, not a separate entity.
3. `assurance_level` belongs on experiments only.
4. Source-only state stays implicit from `source_refs`; assurance starts at `evidence-reviewed`.
5. Claim assurance is derived from `experiment_refs`; do not duplicate it on claims.
6. Risk confidence is not claim assurance.
7. Product approval is a decision effect, not an assurance level.
8. Decisions approve boundaries; experiments produce outputs within those boundaries.
9. Packs are final consumable truth/capabilities, not the workbench.
10. Pack approval is scope-limited; it does not erase blocked actions.

## Lifecycle Axes

Keep these axes separate:

| Axis | Applies to | Meaning |
|---|---|---|
| Record status | claims, experiments, decisions | Editorial/review state. |
| Risk status | risks | Candidate/reviewed/active/mitigated/accepted/rejected caution state. |
| Risk confidence | risks | Credibility/usefulness of a caution. |
| Experiment outcome | experiments | Supports, rejects, or inconclusive. |
| Experiment assurance | experiments | Canonical assurance reached by experiment. |
| Derived claim assurance | claims | Effective assurance from valid linked experiments. |
| Pack publication gate | knowledge packs | Required assurance/scope for publishing facts/capabilities. |
| Decision basis | decisions | Evidence/records/experiments/packs used as rationale. |
| Decision effect | decisions | Scoped approval/rejection/acceptance/mitigation/defer/supersede. |
| Pack approval | decisions + manifest | Whether consumers may use pack for approved scope. |

## Knowledge Packs

Knowledge packs are curated bundles of domain facts and capabilities. They can be consumed by experiments only after review or approval.

## Product Generation Loop

The loop reads the record ledger and eligible knowledge packs, then emits a proposal or no-build decision. It does not create product code in this template.
