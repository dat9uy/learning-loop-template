# Charter

## Objective

Generate product proposals from structured knowledge, reviewed experiments, and explicit decisions. The lab measures what a learning loop can justify from records, not what an agent remembers from another codebase.

## Scope

The template contains:

- a small typed record ledger;
- dedicated evidence files under records;
- curated knowledge packs;
- proposal-only experiments;
- guardrails for provenance and review.

The template does not contain a product stack, application scaffold, database, UI, or runtime integration.

## Operating Rules

1. Records preserve lifecycle, proof, and evidence metadata.
2. Knowledge packs provide final curated domain truth, not product requirements.
3. Experiments may consume only reviewed or approved packs.
4. Product output is a proposal or no-build decision unless a later plan approves implementation.
5. Existing projects are provenance sources, not design sources.
6. Product stack choices remain recommendations until a build experiment is approved.

## Initial Folder Ownership

- `records/`: source YAML-profile records plus dedicated evidence files.
- `knowledge-packs/`: domain/provider pack files with approval metadata.
- `docs/`: project metadata and learning-loop policy docs.
- `product/`: empty placeholder until approved implementation.
- `tools/`: validation and lifecycle scripts.
