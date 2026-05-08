# Operator Guide

## Start Here

Run default validation before changing records:

```bash
pnpm check
```

Use `records/` for the verification/proof ledger, `records/evidence/` for evidence files, `knowledge-packs/` for final curated domain knowledge, and `docs/` for project metadata.

## Claim Verification

Before adding, verifying, rejecting, or product-approving claims, classify the claim with `docs/claim-verification.md`. Proof plans must pass verification validation before they run install, import, runtime, or product approval work.

Use `pnpm verify:claim` to validate current claim verification records without changing files. To preview a metadata-only verification block update, run:

```bash
pnpm verify:claim -- --claim <claim-id> --dimension <dimension> --status <status> --reason <text> --proof-ref <record-ref> --blocked-action <action>
```

Repeat `--proof-ref`, `--decision-ref`, and `--blocked-action` as needed. The command is a dry run unless `--apply` is explicit; apply mode writes only the selected claim `verification` block after existing records and the proposed verification pass validation. It validates existing proof records but never installs packages, imports packages, reads keys or local config, calls live services, captures raw data, mutates product code, or executes proof gates.

## Evidence Model

Put durable evidence capsules under `records/evidence/<scope>/`. Active `source_refs` should use:

- `local:records/evidence/...` for local evidence files;
- `record:<id>` for internal record evidence.

Do not use active `legacy:` refs. Historical source paths may appear only in evidence-doc prose under `Original Source Summary`.

## Adding Or Updating A Pack

1. Add or update safe local evidence under `records/evidence/<pack-id>/`.
2. Update claim, experiment, or decision records to cite local evidence and the current verification dimensions.
3. Update the knowledge-pack manifest and fact refs.
4. Run:

```bash
pnpm validate:records
pnpm check
```

## Approval Flow

Pack approval must say what scope is approved. Pack review for planning does not approve runtime access, external integration, commercial use, persistent storage, arbitrary criteria, or product code.

## Runtime Validation Request Protocol

Before running install, import, config, runtime, or live service commands, ask for human approval and include:

- what evidence is missing;
- why local evidence is insufficient;
- the exact command class proposed;
- disposable temp directory, temp venv, and temp `HOME` boundaries;
- expected metadata-only output;
- whether any local config source is needed, only if explicitly approved for this gate, with contents forbidden from capture;
- forbidden captures/actions: credentials, local config contents, install logs, private package files, raw external data, live calls, generated clients, and product app code.

Default validation must not install packages, insert keys, import private packages, call live services, retain artifacts, or mutate real home config.

## Runtime Artifact Standard

Runtime proof experiments split into two layers:

- Executable substrate is a disposable OS temp directory outside the repo, e.g. `/tmp/learning-loop-run-<run_id>`. The repo never holds executable substrate.
- Durable proof is a curated evidence envelope inside `records/evidence/<pack>/`. The envelope cites the run, not the temp files.

The repo is the evidence ledger. The OS temp directory is executable substrate. Runtime temp files are not durable proof and must never be retained, committed, or referenced as lasting evidence.

### Required Envelope Fields

Each approved runtime proof evidence file, or a gate-section inside it, must record:

- `run_id`: stable identifier for the run, e.g. `runtime-YYYYMMDD-HHMMSS-<random>`.
- `temp_root_class`: class label of the temp root, e.g. `os-temp-outside-repo`. Never the literal path.
- `approval_gate`: gate scope approved for this run, e.g. `install-import` or `runtime-method`.
- `command_class`: class label of the command, e.g. `temp-venv-install`, `temp-home-import`, `metadata-only-method-call`.
- `allowed_outputs`: classes captured into the envelope, e.g. `metadata`, `schema-shape`, `redacted-labels`, `sanitized-exception`.
- `blocked_outputs`: classes explicitly excluded from capture, e.g. `raw-external-data`, `cell-values`, `row-indexes`, `time-series-values`, `identifiers`, `credentials`, `config-contents`, `install-logs`, `private-artifacts`, `venvs`, `caches`, `temp-dirs`.
- `cleanup_status`: `succeeded` or `failed`.
- `temp_root_deleted`: `true` only when post-run deletion is confirmed by the operator.
- `validation_status`: `pending`, `passed`, or `failed` after `pnpm validate:records` and `pnpm check`.

### Cleanup Fail-Closed Rule

Cleanup is part of proof success, not best-effort housekeeping.

- If `temp_root_deleted` is not `true` and `cleanup_status` is not `succeeded`, the experiment outcome is `failed` or `blocked`.
- A failed cleanup blocks dimension verification: claims may not mark `install`, `runtime`, or `product` complete from a run with failed cleanup.
- A failed cleanup also blocks pack capability publication for the affected scope.

### Schema Deferral

A generic `runtime_run` YAML schema and an automated in-repo temp scanner are deferred until repeated runtime proof cases prove the pattern. Until then, envelope fields live as markdown sections inside the relevant evidence, protocol, or experiment files.

## Agent Intake Flow

When the user asks for learning-loop work, the agent should:

1. Classify the prompt:
   - evidence capture;
   - claim/risk setup;
   - verification experiment;
   - product/build request;
   - intentional skip of required knowledge;
   - external/user-provided decision;
   - self-improvement request.
2. Locate relevant evidence, records, decisions, experiments, and pack files.
3. Extract candidate claims and risks.
4. Classify required verification:
   - source review;
   - static inspection;
   - install/import check;
   - runtime check with output capture;
   - product/build experiment;
   - schema/operator self-improvement.
5. Identify missing decisions or approvals before risky work.
6. Ask follow-up questions when authority, scope, output, storage, or blocked actions are unclear.
7. Create/update records before pack changes.
8. Plan experiments with explicit `claim_refs`, `risk_refs`, `source_refs`, `verification.proves`, output policy, and approval status.
9. Run only approved work.
10. Link experiment results back to claims/risks.
11. Derive claim assurance and pack eligibility from verification dimensions.
12. Publish only gate-qualified facts/capabilities.
13. Validate records with `pnpm validate:records` and `pnpm check`.

## Operator Cards

### Product Build Request

When user asks to build product/API/tool from a pack or library:

- Do not jump directly to implementation.
- Expand request into claims, risks, experiments, and decisions.
- Required claims usually include identity, allowed use, entitlement/scope, install/import substrate, callable surface, output/storage boundary.
- Required risks usually include entitlement ambiguity, scope creep, data capture, false assurance, operational limits.
- Required experiments usually include evidence review, static verification, approved install verification, approved runtime/output verification.
- Required decisions approve product/build scope, output policy, and blocked actions.
- Pack capabilities must say what consumers may design, generate, run, call, store, and deploy.

### Intentional Skip Pattern

When user wants to skip a required claim:

- Do not let skipped knowledge disappear.
- Convert skipped required knowledge into:
  - records-side status/claim;
  - active blocking risk;
  - narrowed decision boundary;
  - capability text showing blocked execution/deployment.
- Allow only safe work that does not depend on the skipped claim.

### Evidence Doc Execution Verification

When user asks whether everything in an evidence doc can execute technically:

- Treat as verification request, not direct execution.
- Build a claim extraction matrix: `doc section -> claim -> verification class -> experiment -> pack eligibility`.
- Separate execution classes: symbol exists, import succeeds, method callable, sample call returns output, output schema matches expectation, business behavior is correct.
- Classify snippets as illustrative-only, static-verifiable, import-verifiable, runtime-verifiable with sample output, or blocked pending approval.
- Ask approval before install/runtime/live execution.
- Runtime experiment may capture metadata + sample output + code output only under approved output policy.

### External/User-Provided Decision Input

When user provides outside confirmation:

- Accept it as possible decision/evidence input.
- Not treat it as complete proof or unlimited approval.
- Ask: who confirmed it, what authority, what exact scope, what remains blocked, durable evidence, covered rights.
- Recommend: evidence note, scoped claims, active risks for authority/scope/durability/expiry, `decision_effect`, capability boundaries.

Principle: external confirmation can seed a decision, but the loop still records scope, basis, risks, and boundaries.

### Self-Improvement Flow

The loop can improve itself.

- Hard-test failures can become evidence.
- The agent can create claims/risks/experiments about workflow gaps.
- Runtime output should not become a decision.
- A decision approves what runtime output may be captured.
- An experiment produces runtime output under that decision boundary.
- Self-improvement experiments may propose schema/doc changes.
- Canonical adoption requires explicit decision approval.

## Agent Anti-Confusion Checklist

Before answering or editing, verify:

- Am I treating evidence as source, not proof?
- Am I using `verification.proves` on experiments?
- Am I deriving claim assurance from dimensions instead of storing it?
- Am I using risks for cautions, not negative claims?
- Am I requiring decisions for approval/acceptance/product permission?
- Am I keeping pack files slim?
- Am I blocking runtime/product/live/output actions until approved?
- Am I preserving unresolved knowledge as risk instead of ignoring it?

## Generated Docs

Generated docs are optional derived views. Records, evidence, and decisions remain source of truth. After record or pack changes, run `pnpm check`.

## Current Next Step

Choose the first domain/source and create a scoped evidence or experiment request before adding pack facts or product code.
