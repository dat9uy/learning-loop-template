# Knowledge Pack Contract

A knowledge pack is a curated, reviewable bundle of domain knowledge.

## Required Files

- `manifest.yaml`: id, domain, status, version, approval metadata, publication gates.
- `facts.yaml` (optional): gate-qualified domain facts.
- `capabilities.yaml` (optional): capabilities the domain can support.

Packs may start with only `manifest.yaml` while evidence and records are being built. Facts and capabilities are added after claim verification reaches the pack's publication gate.

## Required Metadata

```yaml
id: vnstock-data
domain: vnstock
status: draft
version: 0.1.0
summary: Curated domain knowledge for vnstock_data library.
approval:
  reviewer: ""
  reviewed_at: ""
  status: draft
pack_ref: pack:vnstock-data
files:
  - manifest.yaml
publication_gate:
  claims:
    min_assurance: install
    required_outcome: supports
    scope: sandbox
    reject_on:
      - rejected
      - unresolved-conflict
      - expired
  risks:
    exposure: reviewed-actionable-scope-relevant
  decisions:
    required_effect: approve
    scope: install
```

## Rules

- Core docs stay provider-neutral.
- Pack files cite `record_ref` for provenance, not direct evidence refs.
- Experiments may consume only reviewed or approved packs.
- Raw data, secrets, local config, and application source code are forbidden in packs.
- Pack facts must have `record_ref` back to the ledger.
- `manifest.yaml` owns pack id, domain, status, version, consumption scope, refs, and publication gates.
- `facts.yaml` contains gate-qualified pack-facing truth.
- `capabilities.yaml` describes what consumers may do within approved scope.
- Capability Runtime Experiments (`product/<stack>/capabilities/<scope>/`) test pack feasibility before product build. They are not pack files but may inform pack capability declarations.

## Reference Rules

- Evidence refs use `local:records/evidence/...`.
- Ledger records use `record:<id>`.
- Pack-level targets use `pack:<id>`.
- Knowledge packs route provenance through `record_ref`, not evidence refs.
- Pack files should not contain direct `source_refs`, `evidence_refs`, `source_allowlist`, or `records/evidence/...` paths.

## Validation

```bash
pnpm validate:records
pnpm check
```
