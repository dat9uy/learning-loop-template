# Tool Selection Guide

Use this when you know what you want to do but not which tool to call. The
canonical reference is `tools/learning-loop-mcp/agent-manifest.json`; this guide
maps **intent** (what you're trying to do) to **tool** (the right MCP tool).

The 4-question framework for picking a tool:

1. **WHAT** — what does it do (read the `description` field)
2. **WHEN** — when to use vs alternatives (the 1-2 sentence "When to use" clause
   appended to each top-10 tool's description)
3. **INPUTS** — what shape it accepts (the `inputSchema`)
4. **RETURNS** — what shape comes back (the JSON-RPC `result.content[0].text`)

For per-field semantics (role, mutability, allowed values), the shared field
glossary is the single source of truth: `core/field-glossary.js`, served via
`loop_describe({tier:"cold"})` and embedded in `meta_state_patch` /
`meta_state_batch` `invalid_field` / `empty_patch` error payloads. A tool's
`.describe()` points at `field_glossary.<field>` rather than restating the
definition (DRY).

## Meta-state lifecycle

| Intent | Tool |
|---|---|
| Record a finding (operator-observed loop issue) | `meta_state_report` |
| Log a system change (immutable audit log) | `meta_state_log_change` |
| Promote a finding from `reported` to `active` | `meta_state_ack` |
| Close a finding (with `resolution` text) | `meta_state_resolve` |
| Re-check if a finding is still true | `meta_state_derive_status` |
| Re-hash a cited path's code after a refactor (re-grounds all anchored findings) | `meta_state_refresh_file_index` |
| Query the registry (filterable) | `meta_state_list` |
| Update an existing entry (with CAS) | `meta_state_patch` |
| Promote a finding into a gate-enforced rule | `meta_state_promote_rule` |
| Aggregate drift across the registry | `meta_state_query_drift` |
| Archive stale findings (structural fix for size overruns) | `meta_state_archive` |
| Atomic batch CRUD (cap 500 ops) | `meta_state_batch` |
| Walk the registry and propose lifecycle transitions | `meta_state_sweep` |
| Mark one entry as superseded by a change-log | `meta_state_supersede` |
| Re-verify a stale entry by running its verification.steps | `meta_state_re_verify` |
| Re-ground an aged finding whose verification.steps is empty (operator attestation; checks grounding snapshot) | `meta_state_touch` |

## Record CRUD

| Intent | Tool |
|---|---|
| Record a decision (plan-time choice) | `record_create_decision` |
| Record an experiment (proves a hypothesis) | `record_create_experiment` |
| Record a risk (potential issue) | `record_create_risk` |
| Record an observation (operator-managed state) | `record_create_observation` |
| Update an existing decision | `record_update_decision` |
| Update an existing experiment | `record_update_experiment` |
| Update an existing risk | `record_update_risk` |
| Update an existing observation | `record_update_observation` |

## Gate

| Intent | Tool |
|---|---|
| Check if a command/file is allowed by the gate | `gate_check` |
| Unlock `product/**` writes (30-min TTL) | `gate_mark_preflight` |
| Run the gate on a batch of commands | `gate_batch` |

## Runtime-state tracking

The runtime-state sidecar (`runtime-state.jsonl`) is deduped via `version`
field (max_by(version) per id, with newest-timestamp/last-in-file tie-break).
Operators can pause/resume tracking per surface (e.g. vendored `vnstock`).

| Intent | Tool |
|---|---|
| Record a runtime-state row (preflight-gated) | `runtime_state_record` |
| Read runtime-state rows (deduped to latest per id) | `runtime_state_read` |
| Pause runtime-state tracking for a surface (preflight-gated; appends in-band `kind: budget-state, status: paused`) | `runtime_state_pause` |
| Resume a previously paused surface (preflight-gated; appends in-band `kind: budget-state, status: active`) | `runtime_state_resume` |
| Non-destructively stop runtime-state tracking for a surface (preflight + confirm-gated; appends in-band `kind: budget-state, status: stopped`; terminal — restart requires a new id) | `runtime_state_stop` |

## Discovery

| Intent | Tool |
|---|---|
| Discover the loop's surface (tiered: hot/warm/cold) | `loop_describe` |
| List meta-state entries by kind | `meta_state_list` |
| List all probe files for a stack | `capability_list_probes` |
| Search index entries by capability/dimension/status | `index_search` |

## Workflow orchestration

| Intent | Tool |
|---|---|
| Classify a user prompt into one of 8 categories | `workflow_classify_prompt` |
| Convert vendor evidence markdown to experiment YAML | `workflow_convert_evidence` |
| Map a candidate assertion to an experiment draft | `workflow_candidate_to_experiment` |
| Build a structured approval request for runtime commands | `workflow_prepare_runtime_request` |
| Generate a structured prompt for a learning-loop task | `workflow_generate_prompt` |
| Notify that an artifact file has changed | `workflow_notify_artifact` |
| Trigger a workflow by name | `workflow_trigger` |

## Budget + capability

| Intent | Tool |
|---|---|
| Check resource budget status for a vendor system | `budget_check` |
| Generate capability records from product surface adapters | `capability_generate` |


## Anti-pattern: do NOT use these

- `node -e "import('./core/meta-state.js')..."` — direct file I/O to
  `meta-state.jsonl`. Use the canonical MCP tools instead. The
  `meta-260606T2102Z` finding tracks this anti-pattern.
- `Edit` / `Write` / `Create` to `meta-state.jsonl` — blocked by the write gate.
- Re-reading the agent-manifest to find a tool — the tool manifest is loaded
  into the agent runtime automatically; you do not need to read it manually.
- Pre-checking with `meta_state_list` before every `meta_state_patch` — patches
  return CAS mismatch via `_expected_version`; use it instead of pre-reads.

## When in doubt

Call `loop_describe({ tier: "warm" })` first. The `discoverability_hints` block
in the response surfaces short reminders of the loop's rules (cite code, not
markdown; canonical tool, not escape hatch; etc.).
