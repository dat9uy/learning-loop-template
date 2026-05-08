# Handoff

## Current State

This is a blank learning-loop template. It has reusable docs, schemas, validators, lifecycle helpers, a blank knowledge-pack template, empty record folders, and no inherited evidence or history.

## Start Here

1. Run validation:

```bash
pnpm check
```

2. Read the core docs:
   - `docs/lab-model.md`
   - `docs/operator-guide.md`
   - `docs/claim-proof-lifecycle.md`
   - `docs/knowledge-pack-contract.md`
3. Create evidence under `records/evidence/<scope>/` before adding claims or packs.
4. Create or update claim, risk, experiment, and decision records that cite durable local evidence or `record:` refs.
5. Curate `knowledge-packs/_template/` into a real pack only after the supporting records are reviewed.

## Empty By Design

- `records/` contains only directory keepers.
- `records/evidence/meta/` exists for loop self-improvement evidence but contains no evidence files.
- `knowledge-packs/` contains only `_template`.
- `product/` contains only a placeholder README.
- `plans/`, `plans/reports/`, and `docs/journals/` are empty workflow folders.

## Approval Boundaries

Default work is read-only or metadata-only. Ask before any external command, package installation, live service call, secret/config access, raw output capture, lifecycle promotion, or product implementation.

## Validation Commands

```bash
pnpm validate:records
pnpm check
```

## Unresolved Questions

- Which first domain or source should seed the blank ledger?
- What approval scope applies to the first evidence or experiment run?
