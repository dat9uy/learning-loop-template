# Knowledge Pack Contract

A knowledge pack is a curated, reviewable bundle of domain knowledge.

## Required Files

- `manifest.yaml`: id, domain, status, version, approval metadata, publication gates.
- `facts.yaml`: gate-qualified domain facts.
- `capabilities.yaml`: capabilities the domain can support.

## Required Metadata

```yaml
id: example-pack
domain: neutral-example
status: draft
version: 0.1.0
approval:
  reviewer: ""
  reviewed_at: ""
  status: draft
pack_ref: pack:example-pack
files:
  - manifest.yaml
  - facts.yaml
  - capabilities.yaml
publication_gate:
  claims:
    min_assurance: static
    required_outcome: supports
    scope: planning
    reject_on:
      - rejected
      - unresolved-conflict
      - expired
  risks:
    exposure: reviewed-actionable-scope-relevant
  decisions:
    required_effect: approve
    scope: planning
```

## Rules

- Core docs stay provider-neutral.
- Pack files cite `record_ref` for provenance, not direct evidence refs.
- Experiments may consume only reviewed or approved packs.
- Raw data, secrets, local config, and application source code are forbidden.
- Pack facts must have `record_ref` back to the ledger.
- `manifest.yaml` owns pack id, domain, status, version, consumption scope, refs, and publication gates.
- `facts.yaml` contains gate-qualified pack-facing truth.
- `capabilities.yaml` describes what consumers may do within approved scope.

## Reference Rules

- Evidence refs use `local:records/evidence/...`.
- Ledger records use `record:<id>`.
- Pack-level targets use `pack:<id>`.
- Knowledge packs route provenance through `record_ref`, not evidence refs.
- Pack files should not contain direct `source_refs`, `evidence_refs`, `source_allowlist`, or `records/evidence/...` paths.

## Derived Views

Generated docs/views remain disabled until derived-view contracts are stable.

Validation loop for now:

```bash
pnpm validate:records
pnpm check
```
