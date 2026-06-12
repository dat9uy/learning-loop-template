---
phase: 7
title: "Delete-Product-Tools"
status: completed
priority: P1
effort: "2h"
dependencies: [5, 6]
---

# Phase 7: Delete-Product-Tools

## Overview

Delete the 13 product-surface MCP tool files, update `tools/manifest.json` and `agent-manifest.json` to reflect the 56 → 43 tool reduction. **Aggressive simplification per operator adjudication 2026-06-12 22:42** — delete all product-surface tools, not just the 6 named in the design report. Net: 56 → 43 tools.

## Requirements

- Functional:
  - 13 tool files are deleted from `tools/learning-loop-mcp/tools/`
  - `tools/manifest.json` has 43 entries (down from 56)
  - `agent-manifest.json` groups reflect the deletions (3 tools removed from `index` group; 3 from `capability` group; 2 from `record_crud` group; 5 from `workflow` group)
  - The 4 groups `capability` is removed entirely
  - No imports of the 13 tool names remain in the codebase
- Non-functional:
  - No `meta_state_*` tool is affected (the 16 meta-state tools stay)
  - `agent-manifest.json#quickstart` references to the deleted tools are removed or replaced
  - `meta_state_log_change` is filed with `change_target: 'tools/manifest.json'` documenting the deprecation

## Architecture

**The 13 tool files to delete:**

| # | File | Tool name | Group |
|---|------|-----------|-------|
| 1 | `capability_*` | `capability_generate` | capability (group removed) |
| 2 | `capability_*` | `capability_list_probes` | capability (group removed) |
| 3 | `capability_*` | `capability_list_verified` | capability (group removed) |
| 4 | `index_extract` | `index_extract` | index |
| 5 | `index_search` | `index_search` | index |
| 6 | `index_update_claim` | `index_update_claim` | index |
| 7 | `record_create_observation` | `record_create_observation` | record_crud |
| 8 | `record_update_observation` | `record_update_observation` | record_crud |
| 9 | `workflow_convert_evidence` | `workflow_convert_evidence` | workflow |
| 10 | `workflow_verify_evidence` | `workflow_verify_evidence` | workflow |
| 11 | `workflow_external_decision` | `workflow_external_decision` | workflow |
| 12 | `workflow_candidate_to_experiment` | `workflow_candidate_to_experiment` | workflow |
| 13 | `workflow_vendor_doc_assist` | `workflow_vendor_doc_assist` | workflow |

**No replacement function for `capability_*` tools** (per operator adjudication 2026-06-12 22:35). Callers query capabilities via `meta_state_list({entry_kind: 'rule', affected_system: '<s>'})` directly.

**The 4 `index` group survivors:** `index_validate` and `index_validate_plans` stay (validates plan structure, not product-surface).

**The 7 `record_crud` group survivors:** `record_create_decision`, `record_update_decision`, `record_create_experiment`, `record_update_experiment`, `record_create_risk`, `record_update_risk`, `record_delete` stay (the records are archived in Phase 5, but the tools remain for backward compat with any external caller; they now write to `records/_unbound/`). <!-- Updated: Validation Session 1 - clarify that 7 record_crud tools are deprecated but not deleted; they operate on the archived records in records/_unbound/. -->

**The 10 `workflow` group survivors:** 15 - 5 = 10 tools stay. The deleted 5 reference dead product-surface concepts.

## Related Code Files

- Delete: `tools/learning-loop-mcp/tools/capability-*-tool.js` (3 files)
- Delete: `tools/learning-loop-mcp/tools/extract-index-tool.js`
- Delete: `tools/learning-loop-mcp/tools/search-index-tool.js`
- Delete: `tools/learning-loop-mcp/tools/update-claim-tool.js`
- Delete: `tools/learning-loop-mcp/tools/record-observation-tool.js`
- Delete: `tools/learning-loop-mcp/tools/update-observation-tool.js`
- Delete: `tools/learning-loop-mcp/tools/workflow-convert-evidence-tool.js`
- Delete: `tools/learning-loop-mcp/tools/workflow-verify-evidence-tool.js`
- Delete: `tools/learning-loop-mcp/tools/workflow-external-decision-tool.js`
- Delete: `tools/learning-loop-mcp/tools/workflow-candidate-to-experiment-tool.js`
- Delete: `tools/learning-loop-mcp/tools/workflow-vendor-doc-assist-tool.js`
- Modify: `tools/learning-loop-mcp/tools/manifest.json` (remove 13 entries)
- Modify: `tools/learning-loop-mcp/agent-manifest.json` (remove 5 `capability` tools, 3 from `index`, 2 from `record_crud`, 5 from `workflow`; remove `capability` group entirely)
- Create: `meta-state.jsonl` entry: `meta_state_log_change` with `change_target: 'tools/manifest.json'`, `change_dimension: 'mechanical'`, `change_diff.removed: ['capability_generate', 'capability_list_probes', 'capability_list_verified', ...]`, `reason: 'Phase A — 13 product-surface tools deleted per plan 260612-1700-meta-surface-re-debate (no replacement for capability_*; callers use meta_state_list with affected_system filter)'`
- Create: `__tests__/tool-deletion-coverage.test.js` (verifies 13 tools are gone, 43 remain)

## Implementation Steps

1. **Grep all consumers of the 13 tool names.** Use `rg -l 'capability_generate|capability_list_probes|capability_list_verified|index_extract|index_search|index_update_claim|record_create_observation|record_update_observation|workflow_convert_evidence|workflow_verify_evidence|workflow_external_decision|workflow_candidate_to_experiment|workflow_vendor_doc_assist' --type ts --type js --type md .` to enumerate call sites. Document each in a "no replacement" callout.
2. **Update `agent-manifest.json` first.** Remove the 5 `capability` tools from the `capability` group; remove the 3 from `index`; remove the 2 from `record_crud`; remove the 5 from `workflow`. Remove the `capability` group entirely. Update `quickstart` to remove references.
3. **Update `tools/manifest.json`.** Remove the 13 entries.
4. **Delete the 13 tool files.** Use `git rm` to preserve history.
5. **Delete the 13 test files** (if any). Some of the deleted tools have `.test.js` siblings (e.g., `workflow-candidate-to-experiment-tool.test.js`); delete those too.
6. **Add `meta_state_log_change` entry.** Document the deletion with full audit trail.
7. **Add `__tests__/tool-deletion-coverage.test.js`.** Verify 43 tool files exist; verify the 13 deleted tool names do not appear in `tools/manifest.json`; verify the 4 `capability` group is gone from `agent-manifest.json`.
8. **Run `pnpm test`.** Verify all tests pass.

## Success Criteria

- [x] 13 tool files are deleted (and their `.test.js` siblings if any).
- [x] `tools/manifest.json` has 43 entries.
- [x] `agent-manifest.json` does not have a `capability` group.
- [x] `agent-manifest.json#groups.index.tools` has 2 entries (`index_validate`, `index_validate_plans`).
- [x] `agent-manifest.json#groups.record_crud.tools` has 7 entries (no observation tools).
- [x] `agent-manifest.json#groups.workflow.tools` has 10 entries (no evidence/claim/index tools).
- [x] `meta-state.jsonl` has 1 new `change-log` entry documenting the deletion.
- [x] No code in the repo imports the 13 deleted tool names.
- [x] `__tests__/tool-deletion-coverage.test.js` passes.
- [x] `pnpm test` passes 1014+ tests.

## Risk Assessment

- **High: external callers (`.claude/skills/**`, `.factory/skills/**`, agents) reference the 13 tool names.** Mitigation: sub-step 7.1 enumerates all consumers. For each, either (a) the skill is updated in this phase, or (b) the "no replacement" callout is documented in the change-log.
- **High: deleting `record_create_observation` / `record_update_observation` may break the `index_extract` test that creates observations to test extraction.** Mitigation: `index_extract` is also deleted (step 4). The chain is consistent.
- **Medium: `agent-manifest.json#quickstart` references the deleted tools.** Mitigation: sub-step 7.2 updates `quickstart`. The `record_verification` quickstart that references `index_extract` and `index_search` is removed or replaced with `meta_state_query_drift`.
- **Low: the 13 `*.test.js` files have shared helpers imported by other tests.** Mitigation: sub-step 7.5 deletes only the test file siblings, not shared helpers.
