---
phase: 3
title: "Refactor and closeout"
status: completed
priority: P1
effort: "0.75h"
dependencies: [2]
---

# Phase 3: Refactor and closeout

## Overview

Resolve the target finding with the canonical fingerprint sequence, update the reopened parent finding if needed, and optionally re-emit the stale id-addressed-list design as a proper loop-design entry. No code changes; all registry mutations go through MCP tools.

## Requirements

- Functional: `meta-260610T1458Z` must be resolved with structural justification.
- Functional: `evidence_code_ref` must point to the actual fix site before fingerprint refresh.
- Functional: grounding check must pass before resolution.
- Functional (optional): migrate `meta-260610T1457Z` from finding to loop-design entry via `meta_state_propose_design`.
- Non-functional: use canonical MCP tools, not `node -e` scripts.

## Architecture

The closeout follows the F11 lesson from prior meta-state plans:

```
1. meta_state_log_change   (ship announcement)
2. meta_state_patch        (update evidence_code_ref on target finding)
3. meta_state_refresh_fingerprint
4. meta_state_check_grounding
5. meta_state_resolve      (close target finding)
6. [optional] meta_state_propose_design for id-addressed-list
```

The parent finding `meta-260606T2202Z` is already `resolved` (terminal), so no `cascade_from` is needed.

## Related Code Files

- **Modify (via MCP tools only):** `meta-state.jsonl`
- **Read:** `tools/learning-loop-mcp/tools/meta-state-resolve-tool.js` (TERMINAL_STATUSES and cascade rules)
- **Read:** `tools/learning-loop-mcp/tools/meta-state-patch-tool.js` (IMMUTABLE_PATCH_FIELDS)

## Implementation Steps

0. **Environment readiness gate:**
   - Before any registry mutation, verify MCP tools are reachable by calling `tools/list`.
   - If the call fails or returns no tools, stop Phase 3 and record a blocker (do not fall back to direct `node -e` scripts that import `core/meta-state.js`).
1. **Ship announcement:**
   - Call `meta_state_log_change` with:
     - `change_dimension: "mechanical"`
     - `change_target: "tools/learning-loop-mcp/tool-registry.js#installWireFormatCoercion + tools/learning-loop-mcp/server.js"`
     - `change_diff`: list added function, patched validation, attached `_coerceSchema`
     - `reason`: "Move wire-format coercion before MCP SDK validation so top-level arrays and booleans round-trip correctly over stdio."
     - `applies_to.tools`: `["meta_state_propose_design", "meta_state_report"]`
2. **Update evidence_code_ref on target finding:**
   - Call `meta_state_patch` on `meta-260610T1458Z-next-session-target-fix-the-mcp-wire-format-coercion-bug-blo`:
     - Set `evidence_code_ref: "tools/learning-loop-mcp/tool-registry.js#installWireFormatCoercion"`
3. **Refresh fingerprint:**
   - Call `meta_state_refresh_fingerprint({ id: "meta-260610T1458Z-..." })`.
4. **Check grounding:**
   - Call `meta_state_check_grounding({ id: "meta-260610T1458Z-..." })` and assert `status: "grounded"`.
5. **Resolve target finding:**
   - Call `meta_state_resolve` on `meta-260610T1458Z-...` with:
     - `resolution`: "Fixed by moving wire-format coercion to McpServer.validateToolInput. meta_state_propose_design and meta_state_report now accept top-level arrays and booleans over stdio."
     - `resolved_by: "operator"`
6. **Optional: re-emit id-addressed-list design:**
   - If Step 5 succeeded, attempt `meta_state_propose_design` for the id-addressed-list design (content from `meta-260610T1457Z-...`):
     - `title`: "id-addressed meta_state_list filter"
     - `description`: summary from the finding description
     - `proposed_design_for`: `["tools/learning-loop-mcp/tools/meta-state-list-tool.js#inputSchema"]`
     - `addresses`: `["meta-260606T2202Z-...", "meta-260610T1457Z-..."]`
     - `affected_system`: "mcp-tools"
   - If this fails (e.g., title collision or the design already exists), skip and append a note to `meta-260610T1457Z` description instead.
7. **Final verification:**
   - Run `pnpm test`, `pnpm validate:records`, `pnpm validate:plan-loop`.
   - Run the new stdio tests one more time.

## Success Criteria

- [x] MCP readiness check passed before any registry mutation.
- [x] `meta-260610T1458Z` `evidence_code_ref` points to `tools/learning-loop-mcp/tool-registry.js#installWireFormatCoercion`.
- [x] `meta_state_check_grounding` for `meta-260610T1458Z` returns `grounded`.
- [x] `meta-260610T1458Z` status is `resolved`.
- [x] Change-log entry created with `applies_to.tools` documenting the fix.
- [x] Optional loop-design re-emission attempted; if skipped, a note is recorded.
- [x] All verification commands pass.

## Risk Assessment

- **rule-no-orphaned-evidence blocks resolve:** if `evidence_code_ref` is not patched before refresh, grounding drifts and resolution is blocked. **Mitigation:** follow the exact sequence in Steps 2-5.
- **Optional loop-design collision:** `meta_state_propose_design` idempotency may reject if the title-derived id already exists. **Mitigation:** use an explicit `loop_design_id` or skip with a note.
- **MCP tool not available in closeout environment:** if the stdio server cannot be reached, use the underlying tool handlers directly in a Node script? **NO** — this is the anti-pattern flagged in AGENTS.md. **Mitigation:** if MCP tools are unavailable, stop and ask the operator; do not use `node -e` scripts that import `core/meta-state.js` directly.
