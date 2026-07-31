/**
 * Shared cross-walking constants for the four manifests in the mastra package.
 *
 * Source of truth for the sizes asserted by:
 *   - __tests__/manifest-arithmetic.test.cjs          (tools: 32, total: 44, workflow: 11, groups: 6)
 *   - __tests__/cold-session-enumerate-mastra.test.cjs (declared: 44, groups: 6)
 *   - __tests__/legacy-mcp/cold-session-discoverability.test.cjs (total: 44, groups: 6)
 *   - __tests__/legacy-mcp/mastra-code-smoke.test.cjs (live MCP residue: 8)
 *
 * WHY: prior removal (meta_state_ack + intake_orient + intake_plan) and
 * addition (meta_state_ship_loop_design in plan 260712-0724 Fix A) both
 * surfaced as test-count drift. Centralising the expected sizes in this
 * module means future manifest mutations edit ONE constant here, not four
 * duplicate literals scattered across the suite.
 *
 * Update protocol: when adding or removing a tool/group, edit the relevant
 * constant here AND verify the comments in each consumer file remain accurate.
 */
module.exports = {
  AGENT_MANIFEST_TOTAL_TOOLS: 49,
  AGENT_MANIFEST_GROUPS: 6,
  TOOLS_MANIFEST_ENTRIES: 43,
  WORKFLOW_GROUP_TOOLS: 11,
  // MCP residue when a runtime sets LOOP_RECORDS_VIA_CLI=1 (all three wired
  // runtimes do): the full record surface rides the stateless CLI, so MCP
  // keeps only workflow/storage/allowlist/audit + agent wrappers:
  //   mastra_workflow_generate_prompt, mastra_check_runtime_agnostic,
  //   mastra_update_r2_allowlist, ask_{intake,scout,self_improvement}_agent,
  //   run_workflow_storage_{round_trip,read}
  MCP_RESIDUE_TOTAL_TOOLS: 8,
};
