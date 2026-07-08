---
name: coordination-gate
description: MCP server for constraint checks, record CRUD, preflight gating, and workflow orchestration. All tools are namespaced by domain.
user-invocable: false
maturity: state-2
---

# Coordination Gate

MCP server that enforces "observe before workaround" for constraint discovery and provides record CRUD, index operations, capability generation, and workflow tools.

## Server

- **Name**: `learning-loop-mastra`
- **Entry**: `tools/learning-loop-mastra/mastra/server.js`
- **Registered**: 40 tools across 5 groups

## Tool Domains

| Domain | Tools | When to use |
|--------|-------|-------------|
| `gate_*` | `gate_check`, `gate_mark_preflight` | Before any write operation |
| `record_*` | `record_create_decision`, `record_update_decision`, `record_create_experiment`, `record_update_experiment`, `record_create_risk`, `record_update_risk`, `record_create_observation`, `record_update_observation`, `record_delete` | All `records/**` writes |
| `workflow_*` | `workflow_classify_prompt`, `workflow_prepare_runtime_request`, `workflow_convert_evidence`, `workflow_verify_evidence`, `workflow_generate_prompt`, `workflow_external_decision`, `workflow_self_improvement`, `workflow_intentional_skip`, `workflow_report_phase_status`, `workflow_product_build`, `workflow_runtime_probe`, `workflow_notify_artifact`, `workflow_trigger` | Learning-loop orchestration |
| `index_*` | `index_validate`, `index_extract`, `index_search`, `index_update_claim` | Index extraction, search, validation |
| `capability_*` | `capability_generate`, `capability_list_probes`, `capability_list_verified` | Capability map generation |

## Quickstart: Product Build Workflow

1. `gate_mark_preflight` — unlock `product/**` writes
2. `gate_check` — verify target files are safe to modify
3. `record_create_decision` — create required decision record
5. `workflow_product_build` — execute build
6. `index_validate` + `index_extract` — update ledger

## Quickstart: Record CRUD

Use `record_create_*` / `record_update_*` for all `records/**` writes.
Direct `Edit`/`Write`/`Bash` to `records/**` is mechanically blocked by the write gate.

## Quickstart: Post-Write Validation

After writing evidence, observations, capabilities, or index files via MCP record tools:

1. Call `workflow_notify_artifact` with the file path and change type.
2. Read the returned `recommended_next_tools`.
3. Call each recommended tool explicitly (e.g., `index_validate`, `index_extract`, `capability_generate`).

Example:
```
workflow_notify_artifact(path="records/product/evidence/decision.md", change_type="created")
→ { recommended_next_tools: ["index_extract", "index_validate"] }
index_extract()
index_validate()
```

## Agent Manifest

See `tools/learning-loop-mastra/agent-manifest.json` for full grouping, ordering hints, and typical chains.
