# Operator Guide

This guide covers mechanics. For reasoning — why the loop exists, verification dimensions, decisions as boundaries, and state-machine rules — read `docs/philosophy.md` first.

## Procedural knowledge encoded in MCP workflow tools

All procedural prompts, runtime validation protocols, experiment conventions, and operator checklists are now generated via workflow tools. See `workflow_generate_prompt`, `workflow_prepare_runtime_request`, `workflow_product_build`, and the constraint-gate MCP server.

## Start Here

Run `pnpm check` before changing records. Use `records/` for the ledger, `records/evidence/` for evidence, and `docs/` for metadata.

## Record Naming Conventions

Timestamp: `YYMMDDTmmZ` (13 chars, UTC, lexicographically sortable).

| Artifact | Directory | Pattern | Timestamped? |
|---|---|---|---|
| Decision | `records/decisions/` | `decision-YYMMDDTmmZ-<slug>.yaml` | Yes |
| Experiment | `records/experiments/` | `experiment-<scope>-YYMMDDTmmZ-<slug>.yaml` | Yes |
| Risk | `records/risks/` | `risk-YYMMDDTmmZ-<slug>.yaml` | Yes |
| Domain Evidence | `records/evidence/<domain>/` | `<type>-YYMMDDTmmZ[-<variant>].md` | Yes |
| Index entry | `records/index/` | `assertion-<capability>-<dimension>-<topic-tag>.yaml` | No |
| Claim | `records/claims/` | `claim-<scope>-<slug>.yaml` | No — frozen-legacy, read-only |
| Capability | `records/capabilities/` | `capability-<stack>-<slug>.yaml` | No |
| Observation | `records/observations/` | `observation-<scope>-<slug>.yaml` | No |
| Meta Evidence | `records/evidence/meta/` | `<descriptive-kebab-slug>.md` | No |

The `id` field inside every YAML record must match the filename stem. New conventions apply prospectively; historical records keep original names.

## State Query Protocol

Run `pnpm extract:index` to regenerate machine-extracted assertions from evidence `## Findings`. For read-only search across index entries, use the MCP `search_index_entries` tool.

## Evidence Model

Active `source_refs` should use `local:records/evidence/...`, `local:product/<stack>/capabilities/...` (capability records only), or `record:<id>`. Do not use active `legacy:` refs.

## Evidence Findings Convention

Evidence markdown files may include a `## Findings` section for machine extraction. Each top-level bullet starts with `[topic-tag]` followed by an atomic assertion. Nested `Context:` bullets populate `context`; nested `Caveat:` bullets populate `caveats`. The extraction tool (`pnpm extract:index`) reads this and produces `records/index/assertion-...yaml`. Files without `## Findings` (or without `[topic-tag]` bullets) are silently skipped.

## Adding Or Updating Records

1. Add or update safe local evidence under `records/evidence/<scope>/` with `## Findings`.
2. Update experiment or decision records to cite local evidence and current verification dimensions.
3. For product-build plans, author capability records under `records/capabilities/` per `schemas/capability.schema.json`.
4. For factual state captures, author observation records under `records/observations/` per `schemas/observation.schema.json`.
5. Run `pnpm validate:records` and `pnpm check`.

## Approval Flow

A decision record's `decision_effect` names the action, scope, affected refs, allowed actions, blocked actions, and required gates. Review for planning does not approve runtime access, external integration, commercial use, persistent storage, arbitrary criteria, or product code; those require their own scoped decisions.

## Resource Budget & State-Machine

External systems with irreversible operations use a gatekeeper model. The learning-loop skill checks resource state before producing a prompt for budget-consuming actions and blocks when budget is exhausted.

- Budget observation: `records/observations/<scope>-resource-budget.yaml` tracks `budget`, `current`, `last_verified`, and `validation_window`.
- Check tool: `pnpm check:budget -- --system {system} --resource {resource}` returns current state.
- Operator-only writes: agent never mutates budget YAML; operator updates after each action.

For MCP-driven gate checks, use `check_gate`. For runtime request preparation, use `workflow_prepare_runtime_request`.

References: `references/resource-budget-rules.md`, `references/prompt-blueprints-state-gated.md`, `schemas/resource-budget.schema.json`.

## Write Domain Rules

The write gate (`.claude/coordination/hooks/write-coordination-gate.cjs`) enforces hard blocks only; policy logic lives in the MCP server. Agents call `check_gate` via MCP for policy decisions on non-critical paths.

Allowed: `docs/**`, `plans/**`, `.claude/**`, `tools/**`, `product/**`.
Blocked: `records/observations/**`, `records/evidence/**`, `schemas/**`, build artifacts, unknown paths.

References: `.claude/coordination/hooks/`, `.claude/coordination/__tests__/`.

## Workflow Auto-Trigger

After writing evidence files, call `notify_artifact_change` via MCP. The `evidence-changed` workflow auto-triggers `extract-index` then `validate-records` for `records/evidence/**` changes.

Workflows are defined in `.claude/coordination/workflows.json`. Log at `.claude/coordination/workflow-log.jsonl`; failures at `.claude/coordination/.workflow-failures`.

## MCP Tools

The constraint-gate MCP server (`tools/constraint-gate/server.js`) exposes 25 tools: 12 enforcement tools and 13 workflow tools. Mutating tools gate through the constraint system; read-only tools do not require observations.

Key enforcement tools: `check_gate`, `record_observation`, `update_observation`, `notify_artifact_change`, `trigger_workflow`, `validate_records`, `extract_index_entries`, `search_index_entries`, `generate_capability_records`.

Key workflow tools: `workflow_classify_prompt`, `workflow_intake_orient`, `workflow_intake_plan`, `workflow_prepare_runtime_request`, `workflow_generate_prompt`, `workflow_product_build`, `workflow_convert_evidence`, `workflow_verify_evidence`, `workflow_intentional_skip`, `workflow_external_decision`, `workflow_self_improvement`, `workflow_report_phase_status`, `workflow_runtime_probe`.

See the constraint-gate server for the full tool list and schema.

## Runtime Validation

Runtime validation is managed through workflow tools. Use `workflow_prepare_runtime_request` to prepare bounded runtime/install proofs.

## Generated Docs

Generated docs are optional derived views. Records, evidence, and decisions remain source of truth. After record changes, run `pnpm check`.

## Current Next Step

Choose the first domain/source and create a scoped evidence or experiment request before authoring capability records or product code.
