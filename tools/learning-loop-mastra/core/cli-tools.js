// Single source of truth for the CLI-portable tool surface.
//
// The CLI uses `CLI_TOOLS` as its allowlist; opted-in MCP runtimes exclude
// the same set when `LOOP_RECORDS_VIA_CLI=1` (full record surface — reads
// + writes) or `LOOP_READS_VIA_CLI=1` (reads-only backward compat). The
// union is exported as `CLI_TOOLS` so a single membership check covers
// both transport opt-outs.
//
// Adding a tool?  Either add it to CLI_WRITE_TOOLS for CLI portability,
// or extend the MCP_RESIDUE list in
// `__tests__/cli-write-tool-set-drift.test.js` with a documented reason.
// The drift test fails on any unclassified manifest entry — there is no
// silent default.
//
// Auxiliary read-ish tools (gate_check, gate_check_recurrence,
// meta_state_sweep, meta_state_query_drift, meta_state_relationship_validate)
// are NOT in CLI_TOOLS: they are not in the 7 reads and not mutation
// handlers, so leaving them on MCP does not re-open the split-brain. A
// follow-up may add them to CLI_READ_TOOLS if a runtime wants the full
// surface; not required to close the split.
//
// Workflow + storage + allowlist + audit tools stay MCP for documented
// reasons (see `cli-write-tool-set-drift.test.js` MCP_RESIDUE).

export const CLI_READ_TOOLS = new Set([
  "loop_describe",
  "loop_get_instruction",
  "meta_state_list",
  "meta_state_relationships",
  "meta_state_derive_status",
  "meta_state_check_grounding",
  "runtime_state_read",
]);

export const CLI_WRITE_TOOLS = new Set([
  // Record-surface mutation handlers (pathFields: [] → R2 passthrough).
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
  "runtime_state_record",
  "runtime_state_pause",
  "runtime_state_resume",
  "runtime_state_prune_surface",
  "gate_mark_preflight",
  "gate_override",
]);

// Union: every tool the CLI accepts. CLI membership checks use this set.
export const CLI_TOOLS = new Set([...CLI_READ_TOOLS, ...CLI_WRITE_TOOLS]);
