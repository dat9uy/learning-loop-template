// Single source of truth for the read tools exposed by the CLI transport.
// The CLI uses this as its allowlist; opted-in MCP runtimes exclude the same set.
export const CLI_READ_TOOLS = new Set([
  "loop_describe",
  "loop_get_instruction",
  "meta_state_list",
  "meta_state_relationships",
  "meta_state_derive_status",
  "meta_state_check_grounding",
  "runtime_state_read",
]);
