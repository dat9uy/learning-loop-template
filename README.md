# Learning Loop Template

A blank, product-agnostic template for turning structured evidence, records, decisions, and curated knowledge packs into proposal-only product ideas.

The template starts empty. Add domain evidence, records, and packs only after review. Product code appears only after an approved experiment chooses a surface and validation path.

## Lanes

- `records/`: claim, risk, experiment, decision, and evidence ledger.
- `knowledge-packs/`: curated packs that experiments may consume after review.
- `docs/`: project metadata and learning-loop policy.
- `product/`: intentionally empty until an approved build experiment.
- `tools/`: validators, lifecycle helpers, and optional doc generation.

## Commands

```bash
pnpm check
pnpm validate:records
```

## First Run

1. Read `docs/handoff.md`.
2. Review `docs/operator-guide.md` and `docs/claim-proof-lifecycle.md`.
3. Add local evidence under `records/evidence/<scope>/`.
4. Add records that cite local evidence or other records.
5. Promote only through reviewed experiments and explicit decisions.

## Guardrails

Do not copy application code, generated files, raw data, secrets, local config, private artifacts, or historical repo state into this template. External execution, package installation, live calls, lifecycle promotion, and product code all require explicit scoped approval.
