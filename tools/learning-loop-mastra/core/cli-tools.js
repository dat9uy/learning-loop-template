// Single source of truth for the CLI-portable tool surface.
//
// The L2 capability rule (`docs/runtime-contract.md` § "Transport capability
// (per function)") classifies each manifest tool on Axis A (capability) as:
//   - transport-capable (stateless → rides CLI by default), or
//   - MCP-only by one of the declared overrides (server-state,
//     operator-policy, agent-facing, deferred-rehoming).
//
// Axis B (wiring) — which transport a given runtime exposes F on — is
// runtime config. The CLI uses `CLI_TOOLS` as its allowlist. Opted-in MCP
// runtimes exclude the same set when `LOOP_RECORDS_VIA_CLI=1` (full record
// surface — reads + writes) or `LOOP_READS_VIA_CLI=1` (reads-only backward
// compat). The union is exported as `CLI_TOOLS` so a single membership
// check covers both transport opt-outs.
//
// Note on `pathFields: []`: this is **R2 path-ownership bypass** (the CLI
// path hardcodes `pathFields:[]` at `bin/loop.mjs:123`, so the R2 gate
// short-circuits to allow for tools that take no write-path arg), NOT a
// statelessness assertion. A tool can be `pathFields:[]` (server-state) or
// transport-capable (stateless). The two properties are independent — see
// `update_r2_allowlist` (pathFields: [] + server-state) for the proof.
//
// Adding a tool?  Either add it to CLI_WRITE_TOOLS for CLI portability,
// or extend MCP_RESIDUE in `__tests__/cli-write-tool-set-drift.test.js`
// with a documented reason from {server-state, operator-policy,
// agent-facing, deferred-rehoming}. The drift test fails on any
// unclassified manifest entry — there is no silent default.
//
// The drift test also covers the 8 `run_<wf.id>` workflow tools (registered
// via `workflows-manifest.json` at `mastra/server.js:135,187`) — same
// reclassification rule, same reason taxonomy.
//
// Rollback: `LOOP_RECORDS_VIA_CLI=0` restores ALL tools to MCP and
// re-opens the split-brain W closed; do not use as a per-tool escape
// hatch. Targeted rollback = move the specific entry out of `CLI_TOOLS`
// back into `MCP_RESIDUE` with a reason tag.

export const CLI_READ_TOOLS = new Set([
  // Original L3 reads surface (R-runtime backward compat).
  "loop_describe",
  "loop_get_instruction",
  "meta_state_list",
  "meta_state_relationships",
  "meta_state_derive_status",
  "meta_state_check_grounding",
  "runtime_state_read",
  // Auxiliary read-ish tools — closed the plan-260722-2125 audit gap:
  // stateless handlers in tools/manifest.json that pre-Phase-3 were left on
  // MCP as residue. They ride the CLI under LOOP_READS_VIA_CLI=1 and
  // LOOP_RECORDS_VIA_CLI=1 alike (CLI_READ_TOOLS widens both opt-out flags).
  "gate_check",
  "gate_check_recurrence",
  "meta_state_sweep",
  "meta_state_query_drift",
  "meta_state_relationship_validate",
]);

export const CLI_WRITE_TOOLS = new Set([
  // Record-surface mutation handlers (pathFields: [] → R2 passthrough;
  // stateless, recoverable from args + file-based record surface).
  "meta_state_report",
  "meta_state_resolve",
  "meta_state_promote_rule", // gated by the activation self-footgun guard (core/cli-self-match.js)
  "meta_state_log_change",
  "meta_state_patch",
  "meta_state_batch",
  "meta_state_archive",
  "meta_state_supersede",
  "meta_state_propose_design",
  "meta_state_ship_loop_design",
  "meta_state_dispatch_finding", // both prepare + commit stages ride the CLI; the handler does not call gh
  "meta_state_re_verify",
  "meta_state_refresh_file_index",
  "meta_state_touch",
  "runtime_state_record",
  "runtime_state_pause",
  "runtime_state_resume",
  "runtime_state_stop",
  "gate_mark_preflight",
  "gate_override",
  // Workflow helper handlers — stateless, write side-effecting only through
  // gate-log append (notify_artifact) or trigger-log emit (trigger).
  "workflow_notify_artifact",
  "workflow_trigger",
]);

// Union: every tool the CLI accepts. CLI membership checks use this set.
export const CLI_TOOLS = new Set([...CLI_READ_TOOLS, ...CLI_WRITE_TOOLS]);
