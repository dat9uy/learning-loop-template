# Operator Guide

This guide covers mechanics. For reasoning — why the loop exists, verification dimensions, decisions as boundaries, and state-machine rules — read `docs/philosophy.md` first.

## Procedural knowledge encoded in MCP workflow tools

All procedural prompts, runtime validation protocols, experiment conventions, and operator checklists are now generated via MCP workflow tools. See `workflow_generate_prompt`, `workflow_prepare_runtime_request`, `workflow_product_build`, and the `tools/learning-loop-mcp/` MCP server.

## Start Here

Run `pnpm check` before changing records. Use `records/<surface>/` for the ledger, `records/<surface>/evidence/` for evidence, and `docs/` for metadata.

## Record Naming Conventions

Timestamp: `YYMMDDTmmZ` (13 chars, UTC, lexicographically sortable).

| Artifact | Directory | Pattern | Timestamped? |
|---|---|---|---|
| Decision | `records/<surface>/decisions/` | `decision-<surface>-YYMMDDTmmZ-<slug>.yaml` | Yes |
| Experiment | `records/<surface>/experiments/` | `experiment-<surface>-YYMMDDTmmZ-<slug>.yaml` | Yes |
| Risk | `records/<surface>/risks/` | `risk-<surface>-YYMMDDTmmZ-<slug>.yaml` | Yes |
| Domain Evidence | `records/<surface>/evidence/` | `<type>-YYMMDDTmmZ[-<variant>].md` | Yes |
| Index entry | `records/<surface>/index/` | `assertion-<capability>-<dimension>-<topic-tag>.yaml` | No |
| Claim | `records/<surface>/claims/` | `claim-<scope>-<slug>.yaml` | No — frozen-legacy, read-only |
| Capability | `records/<surface>/capabilities/` | `capability-<stack>-<slug>.yaml` | No |
| Observation | `records/observations/` | `observation-<scope>-<slug>.yaml` | No |
| Meta Evidence | `records/meta/evidence/` | `<descriptive-kebab-slug>.md` | No |

The `id` field inside every YAML record must match the filename stem. New conventions apply prospectively; historical records keep original names.

## State Query Protocol

Use `meta_state_list` and `meta_state_derive_status` MCP tools for state queries.

## Evidence Model

Active `source_refs` should use `local:records/<surface>/evidence/...`, `local:product/<stack>/capabilities/...` (capability records only), or `record:<id>`. Do not use active `legacy:` refs.

## Evidence Findings Convention

Evidence markdown files may include a `## Findings` section. Each top-level bullet starts with `[topic-tag]` followed by an atomic assertion. Nested `Context:` bullets populate `context`; nested `Caveat:` bullets populate `caveats`. Files without `## Findings` (or without `[topic-tag]` bullets) are silently skipped.

## Plan Authoring

All product-build plans (tagged `product-build`) require Phase 0: Loop Pre-Flight before implementation phases. Phase 0 declares surfaces and verifies decision record coverage.

Reference template: `.claude/skills/learning-loop/references/plan-phase-0-template.md`

1. Declare all surfaces the plan touches.
2. Confirm decision records exist in `records/<surface>/decisions/` for each surface.
3. Run pre-flight validation: `pnpm validate:records` and `pnpm check`.
4. Proceed to implementation phases only after decision coverage is confirmed.

The gate scans plan frontmatter on first write. Missing decision records trigger a warning (default) or block (escalate mode). Set mode via `GATE_RESPONSE_MODE`.

## Adding Or Updating Records

1. Add or update safe local evidence under `records/<surface>/evidence/` with `## Findings`.
2. Update experiment or decision records to cite local evidence and current verification dimensions.
3. For product-build plans, author capability records under `records/<surface>/capabilities/` per `schemas/capability.schema.json`.
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
Blocked: `records/observations/**`, `records/*/evidence/**`, `schemas/**`, build artifacts, unknown paths.

**Gate override:** Use `gate_override` MCP tool to temporarily skip a promoted gate rule. The override is TTL'd (max 24h), audited in `runtime-state.jsonl`, and applies only to regex/glob rules enforced by the bash gate. Requires an `operator_note` for the audit trail.

References: `.claude/coordination/hooks/`, `.claude/coordination/__tests__/`.

## Recurrence Detection

The `gate_check_recurrence` MCP tool scans `.gate-decision.log` across all surfaces for recurring false-positive escalation patterns. When a command prefix recurs >= 3 times within 10 minutes under the same rule, the tool auto-files a meta-state `finding` with subtype `recurring-false-positive`. A `recurrence-check-on-start` SessionStart hook runs this check automatically at session start. Threshold and window are configurable.

## Workflow Auto-Trigger

After writing evidence files, call `notify_artifact_change` via MCP. The `evidence-changed` workflow auto-triggers `validate-records` for `records/*/evidence/**` changes.

Workflows are defined in `.claude/coordination/workflows.json`. Log at `.claude/coordination/workflow-log.jsonl`; failures at `.claude/coordination/.workflow-failures`.

## MCP Tools

The `tools/learning-loop-mcp/` MCP server exposes 33 tools: 18 enforcement/CRUD tools, 2 gate tools, and 13 workflow tools. Mutating tools gate through the constraint system; read-only tools do not require observations.

Key enforcement tools: `check_gate`, `gate_override`, `gate_check_recurrence`, `record_observation`, `update_observation`, `notify_artifact_change`, `trigger_workflow`, `validate_records`, `gate_mark_preflight`.

Key workflow tools: `workflow_classify_prompt`, `workflow_intake_orient`, `workflow_intake_plan`, `workflow_prepare_runtime_request`, `workflow_generate_prompt`, `workflow_product_build`, `workflow_convert_evidence`, `workflow_verify_evidence`, `workflow_intentional_skip`, `workflow_external_decision`, `workflow_self_improvement`, `workflow_report_phase_status`, `workflow_runtime_probe`.

See `tools/learning-loop-mcp/agent-manifest.json` for the full tool list, schemas, and quickstart recipes.

## Resolving Findings (Consult-Gate)

The global rule `rule-no-orphaned-evidence` gates `meta_state_resolve`. Before a finding can be resolved, the consult-gate scans all active findings with `mechanism_check: true` and verifies that each `evidence_code_ref` still hashes to its stored `code_fingerprint`. If any finding's source code has drifted (hash mismatch), resolution is blocked with:

```
{ resolved: false, reason: "resolution_evidence_required", orphans: [...] }
```

To unblock: refresh the path's hash in the shared fingerprint index (`meta_state_refresh_file_index({ path: <evidence_code_ref> })`) or update the evidence reference, then retry resolution. This ensures grounded findings stay grounded and prevents resolving against stale evidence.

## Runtime Validation

Runtime validation is managed through workflow tools. Use `workflow_prepare_runtime_request` to prepare bounded runtime/install proofs.

## Generated Docs

Generated docs are optional derived views. Records, evidence, and decisions remain source of truth. After record changes, run `pnpm check`.

## Current Next Step

Choose the first domain/source and create a scoped evidence or experiment request before authoring capability records or product code.
