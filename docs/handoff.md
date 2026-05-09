# Handoff

## Current State

This learning-loop template is active with vnstock_data as the first domain. It has reusable docs, schemas, validators, verification helpers, a knowledge-pack template, and populated record folders with evidence, claims, experiments, decisions, and risks.

## Start Here

1. Run validation:

```bash
pnpm check
```

2. Read the core docs:
   - `docs/lab-model.md`
   - `docs/operator-guide.md`
   - `docs/claim-verification.md`
   - `docs/knowledge-pack-contract.md`
3. Create evidence under `records/evidence/<scope>/` before adding claims or packs.
4. Create or update claim, risk, experiment, and decision records that cite durable local evidence or `record:` refs.
5. Curate `knowledge-packs/<pack-id>/` only after the supporting records are reviewed.

## Capability Runtime Experiments

To test whether a library's API returns usable data before product implementation, create standalone feasibility scripts under `product/capabilities/<scope>/`. These scripts are runtime experiment substrate. See `docs/operator-guide.md` → "Capability Runtime Experiment" for the full protocol.

## Active Content

| Directory | State |
|-----------|-------|
| `records/claims/` | Active claims (install sandbox, device limit mechanism) |
| `records/experiments/` | Approved experiments (install, capabilities runtime) |
| `records/decisions/` | Active decisions (convention adoption, device clearance) |
| `records/risks/` | Active risks (external installer) |
| `records/evidence/vnstock-data/` | Evidence capsules for vnstock domain |
| `knowledge-packs/vnstock-data/` | Draft pack manifest |
| `product/capabilities/vnstock-data/` | Capability feasibility scripts |
| `plans/` | Active plans including capability runtime execution |
| `docs/journals/` | Session journal entries |

## Empty By Design

- `records/backlog-items/` contains only directory keepers.
- `records/capabilities/` contains only directory keepers.
- `records/observations/` contains only directory keepers.
- `records/validation-gates/` contains only directory keepers.
- `knowledge-packs/_template/` is the blank pack template.
- `plans/templates/` is empty.

## Approval Boundaries

Default work is read-only or metadata-only. Ask before any external command, package installation, live service call, secret/config access, raw output capture, product approval, or product implementation.

## Validation Commands

```bash
pnpm validate:records
pnpm check
```
