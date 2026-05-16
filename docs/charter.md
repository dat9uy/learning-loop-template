# Charter

## Objective

Generate product proposals from structured knowledge, reviewed experiments, and explicit decisions. The lab measures what a learning loop can justify from records, not what an agent remembers from another codebase.

## Scope

The template contains:

- a small typed record ledger (claims, risks, experiments, decisions, capability records, observations);
- dedicated evidence files under `records/evidence/`;
- per-stack scaffolding under `product/<stack>/` (stack manifest + capability scripts + bootstrap helpers) for runtime-verification work;
- proposal-only experiments;
- guardrails for provenance and review.

The template does not contain product application code (no FastAPI source, no UI source, no database, no live runtime integration). Capability scripts under `product/<stack>/capabilities/` are feasibility probes, not product code.

## Operating Rules

1. Records preserve verification, proof, and evidence metadata.
2. Experiments may consume only reviewed evidence and approved upstream records.
3. Product output is a proposal or no-build decision unless a later plan approves implementation.
4. Existing projects are provenance sources, not design sources.
5. Product stack choices remain recommendations until a build experiment is approved.

## Initial Folder Ownership

- `records/`: source YAML records (claims, risks, experiments, decisions, capability records, observations) plus dedicated evidence files.
- `docs/`: project metadata and learning-loop policy docs.
- `product/<stack>/`: per-stack home for capability scripts, stack manifest, and stack-specific bootstrap helpers. No product application code until an approved build experiment.
- `tools/`: validation and verification scripts.
- `plans/`: active and historical plans + brainstorm reports.
