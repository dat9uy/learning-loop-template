# Learning Loop Rules

Use these as prompt constraints. If exact wording matters, read the source docs before drafting.

## Source Docs to Read

- `README.md` — repo lanes and standalone-operation guardrail.
- `docs/handoff.md` — first-run handoff and approval boundaries.
- `docs/operator-guide.md` — normal workflow, runtime artifact standard, validation.
- `docs/claim-verification.md` — claim verification dimensions and proof blocks.
- `docs/lab-model.md` — lab concepts and separation of concerns.
- `docs/knowledge-pack-contract.md` — pack curation contract.

## Core Philosophy

- The lab turns structured knowledge and experiment evidence into proposal-only product ideas.
- Human-edited records are source of truth; generated views are not authority.
- Evidence supports claims, but proof belongs to experiments and decisions.
- Product code appears only after an approved experiment chooses a surface and validation path.
- Historical repos are provenance only, not implementation templates.

## Repo Lanes

- `records/`: source-of-truth claims, risks, experiments, decisions, evidence.
- `records/evidence/`: durable evidence capsules.
- `records/evidence/meta/`: loop self-improvement evidence when needed.
- `knowledge-packs/`: curated consumer-facing packs.
- `docs/`: project metadata and loop policy, not domain evidence dumps.
- `product/`: empty until an approved build experiment.
- `tools/`: validators and verification helpers.

## Separation Rules

Keep separate:

- source material vs evidence capsule
- evidence vs proof
- claim status vs experiment outcome
- risk confidence vs derived verification assurance
- decision basis vs decision effect
- pack approval vs product approval
- meta evidence vs domain evidence

## Verification Rules

Claims assert independent verification dimensions:

- `static`: status `claimed`, `verified`, or `rejected`; proof comes from experiments.
- `install`: status `claimed`, `verified`, or `rejected`; scope is `sandbox` or `production`; proof comes from approved human-gated experiments.
- `runtime`: status `claimed`, `verified`, or `rejected`; scope is `sandbox` or `production`; output is `metadata-only`, `sample-output`, or `runtime-captured`; proof comes from approved human-gated experiments.
- `product`: status `claimed`, `approved`, or `rejected`; approval/rejection comes from decisions, not experiments.

Experiments prove non-product dimensions with `verification.proves`. Product approval requires an approved decision record with product scope. Do not prompt agents to mark product approval directly from an experiment.

## Evidence and Citation Rules

- Active records and packs cite local evidence or records, not old repo paths.
- Use `local:records/evidence/...` for durable evidence files.
- Use `record:<id>` for records.
- Use `pack:<id>` for packs.
- Knowledge packs cite `record_ref`, not raw evidence paths.
- Reviewed/approved packs may be consumed by experiments; unreviewed packs cannot.

## Runtime Artifact Standard

Runtime proof prompts must require:

1. OS temp directory outside repo.
2. Temp venv and temp `HOME` inside that directory.
3. Runtime output kept transient inside temp dir.
4. Curated safe metadata written to existing evidence/experiment records.
5. Temp dir deletion after metadata capture.
6. Envelope fields: `run_id`, `temp_root_class`, `approval_gate`, `command_class`, `allowed_outputs`, `blocked_outputs`, `cleanup_status`, `temp_root_deleted`, `validation_status`.
7. Cleanup fail-closed: failed cleanup blocks promotion.

Never cite temp file paths as durable evidence.

## Forbidden Captures

Prompts must forbid capture or retention of:

- credentials, API keys, tokens, private config contents
- raw external data, raw JSON payloads, row/time/identifier-level values unless explicitly approved
- private package files, install output, caches, logs, venv files
- generated product code or copied app implementation
- local home-directory state, except bounded config copy with explicit approval

## Validation

Default validation after records/packs/evidence changes:

```bash
pnpm validate:records
pnpm check
```

Verification helper work should default to dry-run unless the user explicitly approves mutation.
