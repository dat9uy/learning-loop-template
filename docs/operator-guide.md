# Operator Guide

## Start Here

Run default validation before changing records:

```bash
pnpm check
```

Use `records/` for the verification/proof ledger, `records/evidence/` for evidence files, and `docs/` for project metadata.

## Record Naming Conventions

Artifact filenames use a unified timestamp convention.

### Timestamp Format

```
YYMMDDTmmZ
```

- `YY` = 2-digit year (26 for 2026)
- `MM` = 2-digit month
- `DD` = 2-digit day
- `T` = literal separator
- `HH` = 2-digit hour UTC
- `MM` = 2-digit minute UTC
- `Z` = literal Z for UTC

Total: 13 characters, fixed length, lexicographically sortable.

### Artifact Patterns

| Artifact | Directory | Pattern | Timestamped? |
|---|---|---|---|
| Decision | `records/decisions/` | `decision-YYMMDDTmmZ-<slug>.yaml` | Yes |
| Experiment | `records/experiments/` | `experiment-<scope>-YYMMDDTmmZ-<slug>.yaml` | Yes |
| Risk | `records/risks/` | `risk-YYMMDDTmmZ-<slug>.yaml` | Yes |
| Domain Evidence (run) | `records/evidence/<domain>/` | `<type>-YYMMDDTmmZ[-<variant>].md` | Yes |
| Claim | `records/claims/` | `claim-<scope>-<slug>.yaml` | No |
| Capability | `records/capabilities/` | `capability-<stack>-<slug>.yaml` | No |
| Observation | `records/observations/` | `observation-<scope>-<slug>.yaml` | No |
| Meta Evidence | `records/evidence/meta/` | `<descriptive-kebab-slug>.md` | No |

The `id` field inside every YAML record must match the filename stem (filename without extension).
New conventions apply prospectively; historical records keep their original names.

## Claim Verification

Before adding, verifying, rejecting, or product-approving claims, classify the claim with `docs/artifact-reference.md`. Proof plans must pass verification validation before they run install, import, runtime, or product approval work.

Use `pnpm verify:claim` to validate current claim verification records without changing files. To preview a metadata-only verification block update, run:

```bash
pnpm verify:claim -- --claim <claim-id> --dimension <dimension> --status <status> --reason <text> [--scope <scope>] [--output <level>] [--proof-ref <record-ref>] [--decision-ref <record-ref>] [--blocked-action <action>] [--apply]
```

`--dimension` accepts `static`, `install`, `runtime`, or `product`. `--status` accepts `claimed`, `verified`, or `rejected` for non-product dimensions, and `claimed`, `approved`, or `rejected` for `product`. `--scope` (`sandbox` or `production`) applies to `install` and `runtime`. `--output` (`metadata-only`, `sample-output`, or `runtime-captured`) applies to `runtime`. The `product` dimension uses `--decision-ref`; non-product dimensions use `--proof-ref`. Repeat `--proof-ref`, `--decision-ref`, and `--blocked-action` as needed. The command is a dry run unless `--apply` is explicit; apply mode writes only the selected claim `verification` block after existing records and the proposed verification pass validation. It validates existing proof records but never installs packages, imports packages, reads keys or local config, calls live services, captures raw data, mutates product code, or executes proof gates.

## Evidence Model

Put durable evidence capsules under `records/evidence/<scope>/`. Active `source_refs` should use:

- `local:records/evidence/...` for local evidence files;
- `local:product/<stack>/capabilities/...` for capability records only;
- `record:<id>` for internal record evidence.

Do not use active `legacy:` refs. Historical source paths may appear only in evidence-doc prose under `Original Source Summary`.

## Adding Or Updating Records

1. Add or update safe local evidence under `records/evidence/<scope>/`.
2. Update claim, experiment, or decision records to cite local evidence and the current verification dimensions.
3. For product-build plans, author capability records under `records/capabilities/` per `schemas/capability.schema.json` (fields: `stack`, `surface`, `maps[]`).
4. For factual state captures (device ledgers, resource budgets, behavioral findings), author observation records under `records/observations/` per `schemas/observation.schema.json` (fields: `id`, `schema_version`, `type`, `status`, `created_at`, `updated_at`, `source_refs`).
5. Run:

```bash
pnpm validate:records
pnpm check
```

## Approval Flow

Decisions approve scope explicitly. A decision record's `decision_effect` names the action, scope, affected refs, allowed actions, blocked actions, and required gates. Review for planning does not approve runtime access, external integration, commercial use, persistent storage, arbitrary criteria, or product code; those require their own scoped decisions.

## Resource Budget & State-Machine

External systems with irreversible operations (vendor APIs with device slots, production databases, rate-limited endpoints) need structural enforcement — not just agent memory. The learning-loop skill acts as gatekeeper: before producing a prompt for a budget-consuming action, it checks resource state and blocks when budget is exhausted.

### When This Applies

- Task involves an external system where actions cannot be undone (e.g., vendor device registration, production writes)
- A resource budget observation exists under `records/observations/*-resource-budget.yaml`

### How It Works

1. **Budget observation** — `records/observations/<scope>-resource-budget.yaml` tracks `budget` (max), `current` (used), `last_verified`, and `validation_window`
2. **Check tool** — `pnpm check:budget -- --system {system} --resource {resource}` returns JSON with current state
3. **Skill gating** — learning-loop skill calls the tool before prompt generation:
   - Budget exhausted → BLOCKED signal (no prompt produced)
   - Validation window active → DEFERRED signal (no state-changing actions)
   - Stale data (>7 days) → WARNING (ask operator to confirm)
   - Budget available → constrained prompt with budget context embedded
4. **Operator-only writes** — agent never mutates budget YAML; operator updates after each action

### Key Rules

- Plans with irreversible operations MUST declare a resource budget
- ANY check failure on a budget-consuming action = STOP (not fix-and-retry)
- After a budget-consuming action, agent reports result and waits for operator confirmation
- Validation window: no state-changing actions between clearance and final report
- When a guard/gate blocks an action, trace the full dependency chain back to resource budgets before attempting workarounds. If the chain ends at an exhausted budget, report the constraint to the operator immediately — do not burn cycles on bypasses

### Detailed References

- Rules: `.claude/skills/learning-loop/references/resource-budget-rules.md`
- Prompt templates: `.claude/skills/learning-loop/references/prompt-blueprints-state-gated.md`
- Schema: `schemas/resource-budget.schema.json`

## Skill Coordination

Write-capable external skills are gated by a PreToolUse hook. Registered skills cannot be invoked directly — they must go through the learning-loop coordinator.

### Registered Skills

Skills in `.claude/coordination/skill-registry.json` are blocked by the hook. Unregistered skills bypass coordination.

| Skill | Profile |
|---|---|
| backend-development | code-generation |
| frontend-development | code-generation |
| tanstack | code-generation |
| cook | plan-execution |
| fix | code-generation |
| mcp-builder | code-generation |
| web-frameworks | code-generation |
| mobile-development | code-generation |

### Coordination Flow

1. Claude invokes a registered skill → hook blocks with exit 2 + JSON message
2. Claude routes to `/ck:learning-loop` with `target=<skill>` and original intent
3. Coordinator reads skill-registry.json + coordination-config.json for the profile
4. Coordinator runs gate checks (budget, validation window) per profile's `gate_signals`
5. Coordinator builds a constraint prompt with write allowlist/forbidlist
6. Coordinator writes `.claude/coordination/.bypass-next` (one-shot bypass)
7. Claude invokes the target skill directly (hook allows via bypass)
8. After skill completes, `pnpm check` validates records

### Profiles

Profiles define write boundaries per skill category:

- **code-generation**: may write to `product/**`, `tools/**`; must not write to `records/**`, `evidence/**`, `docs/**`, `plans/**`, `schemas/**`
- **plan-execution**: may write to `product/**`, `tools/**`, `records/**`, `evidence/**`; must not write to `schemas/**`
- **external-system**: defined but not used in v1

### Adding a Skill to the Registry

1. Add entry to `.claude/coordination/skill-registry.json` under `registered_skills`
2. Assign a profile from `.claude/coordination/coordination-config.json`
3. Run `node .claude/coordination/__tests__/coordination-config.test.cjs` to validate
4. Run `bash .claude/coordination/__tests__/integration-test.sh` to verify hook behavior

### Detailed References

- Hook: `.claude/coordination/hooks/skill-coordination-gate.cjs`
- Coordination rules: `.claude/skills/learning-loop/references/coordination-rules.md`
- Tests: `.claude/coordination/__tests__/`

## Runtime Validation Request Protocol

Before running install, import, config, runtime, or live service commands, ask for human approval and include:

- which dimension is being proved (`install` or `runtime`) and the scope (`sandbox` or `production`);
- for runtime, the requested output level (`metadata-only`, `sample-output`, or `runtime-captured`);
- what evidence is missing;
- why local evidence is insufficient;
- the exact command class proposed;
- disposable temp directory, temp venv, and temp `HOME` boundaries;
- expected metadata-only output;
- whether any local config source is needed, only if explicitly approved for this gate, with contents forbidden from capture;
- forbidden captures/actions: credentials, local config contents, install logs, private package files, raw external data, live calls, generated clients, and product app code.

Sandbox scope is the default for install and runtime gates; production scope requires a separate decision and stricter output policy.

Default validation must not install packages, insert keys, import private packages, call live services, retain artifacts, or mutate real home config.

## Runtime Artifact Standard

Runtime proof experiments split into two layers:

- Executable substrate is a disposable OS temp directory outside the repo, e.g. `/tmp/learning-loop-run-<run_id>`. The repo never holds executable substrate.
- Durable proof is a curated evidence envelope inside `records/evidence/<scope>/`. The envelope cites the run, not the temp files.

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
- A failed cleanup blocks dimension verification: claims may not mark the `install` or `runtime` dimension `verified`, or the `product` dimension `approved`, from a run with failed cleanup.
- A failed cleanup also blocks downstream capability-record publication for the affected scope.

### Schema Deferral

A generic `runtime_run` YAML schema and an automated in-repo temp scanner are deferred until repeated runtime proof cases prove the pattern. Until then, envelope fields live as markdown sections inside the relevant evidence, protocol, or experiment files.

## Agent Intake Flow

When the user asks for learning-loop work, the agent should:

1. Classify the prompt:
   - evidence capture;
   - claim/risk setup;
   - verification experiment;
   - product/build request;
   - observation capture;
   - intentional skip of required knowledge;
   - external/user-provided decision;
   - self-improvement request.
2. Locate relevant claims, experiments, and decisions first. Evidence files are referenced via `record_ref`, never browsed standalone for truth-status discovery (Q4 E rule). Before opening a new experiment plan, scan `records/evidence/meta/` for `## Trigger` sections matching the new experiment's event class and read each matched file; apply guidance and increment any sample-count thresholds (Q5 R2 rule). After claim-first orientation but before drafting experiment steps, list `records/evidence/<capability>/` end-to-end for files or subdirectories not referenced by the active claim verification block; read relevant text evidence files, skip raw/binary/generated/private artifacts unless explicitly approved, skip files marked with `## Superseded By` unless forensic context is needed (consult the linked canonical artifact instead), and list relevant files in the plan's "Read for context". Capability-dir scanning is for planning-context discovery; truth-status of any discovered file is still determined per the claims-first rule above (Q6 rule). Before asking the user about external system state (device slots, budgets, registration status, rate limits, operational constraints), scan `records/observations/` for relevant observation records and read them. Observations are the authoritative source for factual system state (see `record:decision-20260517T1200Z-observation-state-check-rule`).
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
7. Create/update records before downstream artifacts.
8. Plan experiments with explicit `claim_refs`, `risk_refs`, `source_refs`, `verification.proves`, output policy, and approval status.
9. Run only approved work.
10. Link experiment results back to claims/risks.
11. Derive claim assurance from verification dimensions.
12. Publish capability records only after their `record_ref` claims are verified for the relevant dimension.
13. Validate records with `pnpm validate:records` and `pnpm check`.

## Operator Cards

### Product Build Request

When user asks to build product/API/tool on top of a verified library:

- Do not jump directly to implementation.
- Expand request into claims, risks, experiments, and decisions.
- Required claims usually include identity, allowed use, entitlement/scope, install/import substrate, callable surface, output/storage boundary.
- Required risks usually include entitlement ambiguity, scope creep, data capture, false assurance, operational limits.
- Required experiments usually include evidence review, static verification, approved install verification, approved runtime/output verification.
- Required decisions approve product/build scope, output policy, and blocked actions.
- Capability records must state the verified library surfaces (via `record_ref` to surface claims) and the product surfaces they map to (`route_class`, `view_class`, `response_class`).

### Capability Runtime Experiment

When user asks to create capability scripts (standalone feasibility scripts) for a library or SDK:

- Capability scripts are standalone scripts under `product/<stack>/capabilities/<scope>/` that test whether a library's API returns usable data. They use minimal calls per API surface area (one script per domain layer).
- Capability scripts are distinct from product code (they do not implement product features) and distinct from basic runtime proof (they test API-return-data, not just import/load).
- Capability scripts verify the `runtime` dimension of a claim. The experiment record carries `verification.proves: runtime` with `output: sample-output` or `runtime-captured`.
- The capability scripts are the execution substrate; the experiment record is the ledger entry. Scripts may be segmented (e.g., cell markers, regions, or blocks) for interactive or whole-script execution.
- Capability scripts may live in `product/<stack>/` before product approval because they are feasibility probes, not product implementations.
- **Environment model:** Capability scripts share a persistent dependency environment with their stack. The environment root is `product/<stack>/` (language-specific: `product/web/node_modules/` for TS/JS, `product/api/.venv/` for Python, `product/<stack>/vendor/` for Go, etc.). Capability scripts run against this environment, not a disposable temp install. Future product code in the same stack uses the same environment and the same library installation.
- This per-stack environment is intentional. It respects external constraints such as vendor device limits, license activations, or authenticated registries by keeping all execution on the registered device while avoiding cross-runtime coupling.
- Required experiment steps: create capability scripts, run against live endpoints using the shared environment, capture metadata + schema-shape + redacted sample output, update claim `runtime` dimension to `verified`.

### Stacks and Capability Locations

| Stack | Manifest | Capability script root |
|---|---|---|
| Python API | `product/api/pyproject.toml` | `product/api/capabilities/` |
| TypeScript web | `product/web/package.json` when introduced | `product/web/capabilities/` |

Every `product/<stack>/` directory must contain a stack manifest such as `pyproject.toml`, `package.json`, or `go.mod`. The validator only allows `local:product/*/capabilities/...` for capability records; all other record types keep the default `records/evidence` local source root.

### API Stack Bootstrap

Bootstrap the Python API stack from the repo root with:

```bash
pnpm bootstrap:api
```

The command runs two explicit stages: `uv sync` installs public dependencies in `product/api/.venv`, then `product/api/scripts/install-vnstock.sh` runs the SHA-pinned vnstock vendor installer with `product/api` as `HOME`. Stage 2 requires an operator-provided `VNSTOCK_API_KEY`, may consume a vendor device slot, and must not be run from package install hooks.

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
- Build a claim extraction matrix: `doc section -> claim -> verification class -> experiment -> capability-record eligibility`.
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

For a worked example of meta-process improvement debate (multi-question cascade, deferred-meta-evidence pattern, `## Trigger` recall mechanism), see `plans/reports/brainstorm-20260508-resume-vnstock-and-meta-loop.md`.

## Experiment Result Convention

Experiment YAMLs use `result` as one of:

- `supports` - outcome supports the hypothesis.
- `does-not-support` - outcome contradicts the hypothesis.
- `inconclusive` - outcome did not produce a clear answer (vendor gate, env failure, operator interrupt, indeterminate result).

Pair with sibling `result_reason` (free text) for disambiguation, especially for `inconclusive`.

The convention is not enforced by `experiment.schema.json` - `result` remains an unconstrained `string`. Schema enum hardening is deferred until at least three distinct experiments use the convention without semantic strain (per `record:decision-20260509T192448Z-experiment-result-convention`).

### Convention Application

New conventions apply prospectively unless an explicit migration is approved. A historical experiment authored before a convention lands does not need to be rewritten for cosmetic alignment; per-experiment immutability beats convention uniformity. Convert only when the operator approves a migration plan that documents the conversion mode (Migration / Structuring; see "Evidence-MD to Experiment-YAML Conversion").

See `record:decision-20260509T192449Z-prospective-convention-application` for the policy decision.

## Evidence-MD to Experiment-YAML Conversion

When converting an evidence MD into a structured experiment YAML, classify the source MD up front. Both modes share the experiment YAML output schema and the audit linkage (`source_refs` -> the original evidence MD); modes differ in whether `hypothesis` and `success_metrics` are reconstructed verbatim or marked post-hoc.

### Mode: Migration

The original evidence MD captured a hypothesis, success metrics, and a decisive outcome. The conversion is verbatim:

- `hypothesis`, `success_metrics`, and `result` carry over without reinterpretation.
- `source_refs` lists the original evidence MD using `local:records/evidence/...`.
- `result_reason` (if needed) cites the same passage that justified the original outcome.
- The output YAML status is `reviewed` if the original was operator-reviewed; otherwise `draft`.
- `result` follows the convention from "Experiment Result Convention".

### Mode: Structuring

The original evidence MD lacked a clean hypothesis or success metrics. Reconstruction is post-hoc:

- `hypothesis` and `success_metrics` are reconstructed from the evidence narrative; mark them as post-hoc in `notes`.
- `result` is `inconclusive` unless the evidence is decisive on its own; never `supports` or `does-not-support` without operator confirmation.
- The output YAML is pinned at `status: draft` until operator review.

### Shared Rules

- Both modes preserve the original evidence MD unchanged.
- Both modes link `source_refs` back to the original evidence MD.
- Conversion runs only after the operator approves an explicit migration plan; no ad-hoc conversion.
- Run `pnpm validate:records` and `pnpm check` after each approved batch.
- For prompt/checklist support, see the `learning-loop` skill (`evidence-to-experiment migration` task class) at `.claude/skills/learning-loop/`.

## Phase Success Criteria

A plan phase has two orthogonal axes that must be tracked separately to avoid the "mostly checked off" failure mode where process boxes appear complete despite a blocked or inconclusive experimental result.

### Process Steps

A list of agent actions required to perform the phase: read inputs, author records, run validation, etc. Each step is a checkbox. `[x]` means the step was performed and reviewed. Process completion is independent of experimental outcome.

### Experiment Outcome

The phase's experimental result, using the convention from "Experiment Result Convention":

- `supports`
- `does-not-support`
- `inconclusive`

Plus a `Blocker / result reason` line if the outcome is `does-not-support` or `inconclusive`.

### Reporting

A phase summary must state both axes explicitly. Examples:

- "Process: 9/9 steps complete. Experiment: `inconclusive` (vendor device-limit gate)."
- "Process: 6/6 steps complete. Experiment: `supports` (sandbox-1 reached `from vnstock_data import Reference`)."

### Lifecycle Status Orthogonality

Plan-level lifecycle status (`pending`, `in-progress`, `completed`) follows project-management conventions and tracks process. Experiment outcome lives in evidence/experiment records. The two are orthogonal: a plan can be `completed` while its underlying experiment is `blocked` or `inconclusive`. Do not block plan close-out on an external gate that prevents experimental verification.

## Rule Origins

Shorthand citations in Agent Intake Flow trace to the meta-process brainstorm that produced them. Agent Intake Flow step 2 carries the canonical wording; this section is documentary. If the two diverge, step 2 wins.

### Q4 E - Claims-first scanning for evidence truth-status

- Prior ambiguity: a disproved evidence file (`installer-prior-notes.md` claimed installer reads `~/.vnstock/user.json`) sat on disk with no signal; future agents could re-adopt the disproven claim by direct browse.
- Alternatives considered: status field in frontmatter (rejected), `## Status` markdown body (crosses source/proof line), claim-side status block (deferred N>=2), per-file `## Supersedes` link in disproving evidence (adopted as Q4 D), computed validation view (deferred N>=2).
- Chosen: structural prevention. Evidence is referenced via claims, never browsed standalone for truth-status discovery.
- Origin: `plans/reports/brainstorm-20260508-resume-vnstock-and-meta-loop.md` (Q4).

### Q5 R2 - Pre-experiment scan of `records/evidence/meta/`

- Prior ambiguity: deferred meta-evidence files had no recall mechanism; N>=2 triggers could fire silently months later under a different agent.
- Alternatives considered: in-file counter (compliance failure), validation tool extension (premature), plan-template extension (premature), separate `_pending` index (drift risk).
- Chosen: doc rule. Before opening a new experiment plan, scan `records/evidence/meta/` for `## Trigger` sections matching the new experiment's event class; read each matched file and apply guidance.
- Origin: same brainstorm (Q5). Pairs with Q4 D's `## Supersedes` convention.

### Q6 - Capability-directory scan after claims-first orientation

- Prior ambiguity: claims-first scanning surfaced cited evidence but missed uncited files in the same capability directory. The `unified-ui-snapshot/` directory was nearly missed during vnstock plan drafting.
- Alternative considered: rely on claims to cite everything (rejected; claims drift, capability dirs hold reference docs that aren't claim-cited).
- Chosen: after claims-first orientation, list `records/evidence/<capability>/` end-to-end. Read relevant text evidence, skip raw/binary/generated/private artifacts and `## Superseded By` files unless forensic context is needed.
- Origin: `records/evidence/meta/capability-dir-scan-rule.md` (commit `e0a1c0f`). Not part of the original Q1-Q5 cascade; added later when the gap surfaced during planning.

## Agent Anti-Confusion Checklist

Before answering or editing, verify:

- Am I treating evidence as source, not proof?
- Am I using `verification.proves` on experiments?
- Am I deriving claim assurance from dimensions instead of storing it?
- Am I using risks for cautions, not negative claims?
- Am I requiring decisions for approval/acceptance/product permission?
- Am I keeping capability records slim and faithful to their cited claims?
- Am I blocking runtime/product/live/output actions until approved?
- Am I preserving unresolved knowledge as risk instead of ignoring it?
- Am I recording factual state as observations, not claims?
- Am I checking observation records for external system state before asking the user?

## Generated Docs

Generated docs are optional derived views. Records, evidence, and decisions remain source of truth. After record changes, run `pnpm check`.

## Current Next Step

Choose the first domain/source and create a scoped evidence or experiment request before authoring capability records or product code.
