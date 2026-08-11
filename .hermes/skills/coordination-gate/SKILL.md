---
name: coordination-gate
description: MCP server for constraint checks, meta-state registry, runtime-state tracking, and workflow orchestration. All tools are namespaced by domain.
user-invocable: false
maturity: state-2
---

# Coordination Gate

MCP server that enforces "observe before workaround" for constraint discovery and provides the meta-state registry (findings, change-log, rules, loop-designs), runtime-state tracking, and workflow tools. The authoritative tool list is `tools/learning-loop-mastra/tools/manifest.json`; agent-facing intent mapping lives in `tools/handlers/references/tool-selection-guide.md`.

## Server

- **Name**: `learning-loop-mastra`
- **Entry**: `tools/learning-loop-mastra/mastra/server.js`
- **Registered**: 42 tools (see `tools/manifest.json`)

## Tool Domains

| Domain | Tools | When to use |
|--------|-------|-------------|
| `gate_*` | `gate_check`, `gate_check_recurrence`, `gate_mark_preflight`, `gate_override` | Before any gated write or command |
| `meta_state_*` | `meta_state_report`, `meta_state_list`, `meta_state_resolve`, `meta_state_patch`, `meta_state_batch`, `meta_state_log_change`, `meta_state_promote_rule`, `meta_state_derive_status`, `meta_state_check_grounding`, `meta_state_refresh_file_index`, `meta_state_sweep`, `meta_state_query_drift`, `meta_state_relationships`, `meta_state_relationship_validate`, `meta_state_re_verify`, `meta_state_touch`, `meta_state_supersede`, `meta_state_archive`, `meta_state_propose_design`, `meta_state_ship_loop_design`, `meta_state_dispatch_finding` | All registry (meta-state) reads and writes |
| `runtime_state_*` | `runtime_state_record`, `runtime_state_read`, `runtime_state_pause`, `runtime_state_resume`, `runtime_state_stop` | Runtime-state sidecar tracking |
| `workflow_*` | `workflow_classify_prompt`, `workflow_prepare_runtime_request`, `workflow_generate_prompt`, `workflow_self_improvement`, `workflow_intentional_skip`, `workflow_report_phase_status`, `workflow_runtime_probe`, `workflow_notify_artifact`, `workflow_trigger` | Learning-loop orchestration |
| `loop_*` | `loop_describe`, `loop_get_instruction` | Surface discovery and hint lookup |
| misc | `check_runtime_agnostic` | Runtime-agnostic feature audit |

## Quickstart: Product Build Workflow

1. `gate_mark_preflight` — unlock `product/**` writes
2. `gate_check` — verify target files are safe to modify
3. `meta_state_log_change` — record the decision/change in the registry

## Quickstart: Meta-State Writes

Use `meta_state_*` tools for all `meta-state.jsonl` changes. Direct
`Edit`/`Write`/`Bash` to the registry is mechanically blocked by the write
gate. Use the read-only CLI (`bin/loop.mjs`) for the 12 read tools when the
runtime routes reads via CLI.

## Quickstart: Post-Write Notification

After changing an artifact the workflow registry cares about:

1. Call `workflow_notify_artifact` with the file path and change type.
2. Read the returned `recommended_next_tools`. Note: `recommended_tools` in
   `WORKFLOW_REGISTRY` is currently vacated to `[]` (the index/capability
   subsystem it pointed at was retired), so expect an empty list until a
   successor subsystem lands.

## Agent Manifest

See `tools/learning-loop-mastra/agent-manifest.json` for full grouping, ordering hints, and typical chains.
