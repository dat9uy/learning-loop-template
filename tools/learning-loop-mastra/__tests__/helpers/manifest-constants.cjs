/**
 * Shared cross-walking constants for the four manifests in the mastra package.
 *
 * Source of truth for the sizes asserted by:
 *   - __tests__/manifest-arithmetic.test.cjs          (tools: 44, total: 50, workflow: 11, groups: 6)
 *   - __tests__/cold-session-enumerate-mastra.test.cjs (declared: 50, groups: 6)
 *   - __tests__/integration/cold-session-discoverability.test.cjs (total: 50, groups: 6)
 *   - __tests__/e2e/mastra-code-smoke.test.cjs (live MCP residue: 8)
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
  // Full agent declaration (agent-manifest.json) — a separate surface from the
  // CLI allowlist (42), the handler manifest (44), the classified residue (5),
  // and the live MCP residue (8). Do not relabel this as a CLI count.
  AGENT_MANIFEST_TOTAL_TOOLS: 50,
  AGENT_MANIFEST_GROUPS: 6,
  TOOLS_MANIFEST_ENTRIES: 44,
  WORKFLOW_GROUP_TOOLS: 11,
  // Live MCP residue — the exact 8 tools registered by the production server
  // (no flag changes it): 3 ask_* agents + 2 run_workflow_storage_* +
  // update_r2_allowlist + check_runtime_agnostic + workflow_generate_prompt.
  // Asserted by cli-optout-wiring.test.js and cli-write-tool-set-drift.test.js.
  MCP_RESIDUE_TOTAL_TOOLS: 8,
  // CLI allowlist (core/cli-tools.js) — the single record surface. 12 reads +
  // 30 writes. Asserted by cli-optout-wiring.test.js (loop.mjs list).
  CLI_TOTAL_TOOLS: 42,
};
