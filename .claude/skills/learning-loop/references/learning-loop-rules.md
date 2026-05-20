# Learning Loop Rules

Use these as prompt constraints. If exact wording matters, read the source docs before drafting.

## Source Docs to Read

- `README.md` — repo lanes and standalone-operation guardrail.
- `docs/operator-guide.md` — first-run, normal workflow, runtime artifact standard, validation, approval boundaries.
- `docs/artifact-reference.md` — typed record schemas, claim verification dimensions, proof blocks, capability-term glossary.
- `docs/record-system-architecture.md` — entity roles, record hierarchy, state machine, verification axes.
- `references/resource-budget-rules.md` — hard constraints for external systems with irreversible state.

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
- `docs/`: project metadata and loop policy, not domain evidence dumps.
- `product/`: per-stack workspace; runtime probes may live under `product/<stack>/capabilities/`, while application code appears only after an approved build experiment.
- `tools/`: validators and verification helpers.

## Separation Rules

Keep separate:

- source material vs evidence capsule
- evidence vs proof
- claim status vs experiment outcome
- risk confidence vs derived verification assurance
- decision basis vs decision effect
- meta evidence vs domain evidence

## Observation State Rule

Before asking the user about external system state (device slots, budgets, registration status, rate limits, operational constraints), check `records/observations/` for relevant observation records. Observations are the authoritative source for factual system state — they are operator-managed and more reliable than agent memory or user recall. See `record:decision-20260517T1200Z-observation-state-check-rule`.

## Verification Rules

Claims assert independent verification dimensions:

- `static`: status `claimed`, `verified`, or `rejected`; proof comes from experiments.
- `install`: status `claimed`, `verified`, or `rejected`; scope is `sandbox` or `production`; proof comes from approved human-gated experiments.
- `runtime`: status `claimed`, `verified`, or `rejected`; scope is `sandbox` or `production`; output is `metadata-only`, `sample-output`, or `runtime-captured`; proof comes from approved human-gated experiments.
- `product`: status `claimed`, `approved`, or `rejected`; approval/rejection comes from decisions, not experiments.

Experiments prove non-product dimensions with `verification.proves`. Product approval requires an approved decision record with product scope. Do not prompt agents to mark product approval directly from an experiment.

## Evidence and Citation Rules

- Active records cite local evidence or records, not old repo paths.
- Use `local:records/evidence/...` for durable evidence files.
- Use `local:product/<stack>/capabilities/...` only for capability records.
- Use `record:<id>` for records.

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

Default validation after records and evidence changes:

```bash
pnpm validate:records
pnpm check
```

Verification helper work should default to dry-run unless the user explicitly approves mutation.
