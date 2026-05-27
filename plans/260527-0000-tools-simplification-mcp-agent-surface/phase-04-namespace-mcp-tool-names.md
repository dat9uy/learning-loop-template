---
phase: 4
title: "Namespace MCP Tool Names"
status: pending
priority: P1
effort: "2h"
dependencies:
  - 2
---

# Phase 4: Namespace MCP Tool Names

## Overview

All 33 MCP tools get a `{domain}_` prefix to make them scannable and enable future server splitting. The server name changes from `"constraint-gate"` to `"coordination-gate"`. No aliases — user confirmed no backward-compat requirement. MCP client caches old names; agents must restart after this phase.

## Requirements

- Functional: All 33 tools have domain prefix: `gate_*`, `record_*`, `workflow_*`, `index_*`, `capability_*`
- Functional: Server name is `"coordination-gate"`
- Functional: `manifest.json` lists namespaced tool names with descriptions
- Functional: `server.js` registers tools under new names
- Functional: `.mcp.json` updated if it references server name or tool names
- Non-functional: Zero behavioral changes to tool logic

## Architecture

### Name Mapping

| Old Name | New Name | Domain |
|----------|----------|--------|
| `check_gate` | `gate_check` | gate |
| `mark_preflight_complete` | `gate_mark_preflight` | gate |
| `create_decision_record` | `record_create_decision` | record |
| `update_decision_record` | `record_update_decision` | record |
| `create_experiment_record` | `record_create_experiment` | record |
| `update_experiment_record` | `record_update_experiment` | record |
| `create_risk_record` | `record_create_risk` | record |
| `update_risk_record` | `record_update_risk` | record |
| `record_observation` | `record_create_observation` | record |
| `update_observation` | `record_update_observation` | record |
| `delete_record` | `record_delete` | record |
| `validate_records` | `index_validate` | index |
| `extract_index_entries` | `index_extract` | index |
| `search_index_entries` | `index_search` | index |
| `update_claim_verification` | `index_update_claim` | index |
| `generate_capability_records` | `capability_generate` | capability |
| `list_runtime_probes` | `capability_list_probes` | capability |
| `list_verified` | `capability_list_verified` | capability |
| `workflow_intake_orient` | `workflow_intake_orient` | workflow |
| `workflow_intake_plan` | `workflow_intake_plan` | workflow |
| `workflow_classify_prompt` | `workflow_classify_prompt` | workflow |
| `workflow_prepare_runtime_request` | `workflow_prepare_runtime_request` | workflow |
| `workflow_convert_evidence` | `workflow_convert_evidence` | workflow |
| `workflow_generate_prompt` | `workflow_generate_prompt` | workflow |
| `workflow_intentional_skip` | `workflow_intentional_skip` | workflow |
| `workflow_verify_evidence` | `workflow_verify_evidence` | workflow |
| `workflow_external_decision` | `workflow_external_decision` | workflow |
| `workflow_self_improvement` | `workflow_self_improvement` | workflow |
| `workflow_report_phase_status` | `workflow_report_phase_status` | workflow |
| `workflow_product_build` | `workflow_product_build` | workflow |
| `workflow_runtime_probe` | `workflow_runtime_probe` | workflow |

### Files to Update

| File | What Changes |
|------|-------------|
| `tools/coordination-gate/mcp/manifest.json` | All `name` fields updated |
| `tools/coordination-gate/mcp/server.js` | Server name; tool registration loop |
| `tools/coordination-gate/mcp/tools/*.js` | Export names (e.g., `export const gateCheckTool = ...`) |
| `tools/coordination-gate/mcp/tools/*.test.js` | Test assertions for tool names |
| `.mcp.json` | Server name if present |
| `.factory/skills/coordination-gate/SKILL.md` | Example tool names |
| `.claude/skills/coordination-gate/SKILL.md` | Example tool names |
| `CLAUDE.md` | MCP CRUD table tool names |

## Related Code Files
- Modify: `tools/coordination-gate/mcp/manifest.json`
- Modify: `tools/coordination-gate/mcp/server.js`
- Modify: `tools/coordination-gate/mcp/tools/*-tool.js`
- Modify: `tools/coordination-gate/mcp/tools/*-tool.test.js`
- Modify: `.mcp.json`
- Modify: `.factory/skills/coordination-gate/SKILL.md`
- Modify: `.claude/skills/coordination-gate/SKILL.md`
- Modify: `CLAUDE.md`

## Implementation Steps

1. **Update `manifest.json`** (20 min)
   - Change every `name` field to namespaced version
   - Verify JSON is valid: `node -e "JSON.parse(require('fs').readFileSync('tools/coordination-gate/mcp/manifest.json'))"

2. **Update tool file export names** (30 min)
   - Rename exports in each `*-tool.js`:
     - `export const checkGateTool` → `export const gateCheckTool`
     - `export const recordObservationTool` → `export const recordCreateObservationTool`
     - etc.
   - Update corresponding `.test.js` files

3. **Update `server.js`** (15 min)
   - Change server name: `new McpServer({ name: "coordination-gate", ... })`
   - Ensure tool registry loop uses manifest names directly

4. **Update skill docs and CLAUDE.md** (20 min)
   - Replace all tool name references in documentation

5. **Run MCP integration tests** (15 min)
   - `node --test 'tools/coordination-gate/mcp/*.test.js'`
   - Verify all 33 tools register under new names

6. **Verify zero old-name references across entire repo** (30 min)
   - Search entire repo (excluding `.git/`, `node_modules/`, archived journal entries):
     `rg "check_gate\b|mark_preflight_complete\b|create_decision_record\b|record_observation\b|validate_records\b|extract_index_entries\b|search_index_entries\b|update_claim_verification\b|generate_capability_records\b|list_runtime_probes\b" --type md --type js --type json --type yaml --type cjs`
   - Check `.claude/coordination/workflows.json` for workflow definitions referencing old names
   - Check `docs/`, `records/` for documentation or decision records referencing old names
   - Check dynamic string construction in tool wrappers that might build old names

7. **Document rollback** (5 min)
   - If rename causes active agent breakage: `git checkout -- tools/coordination-gate/mcp/manifest.json tools/coordination-gate/mcp/server.js tools/coordination-gate/mcp/tools/`
   - Restart MCP server; agents must reload their tool list

## Success Criteria

- [ ] `manifest.json` lists 33 namespaced tool names
- [ ] `server.js` server name is `"coordination-gate"`
- [ ] All MCP tool files export names matching the namespace pattern
- [ ] MCP integration tests pass under new names
- [ ] `rg "constraint-gate" tools/coordination-gate/mcp/server.js` returns zero
- [ ] Documentation (CLAUDE.md, skills) uses new names
- [ ] Zero old tool-name references found in `docs/`, `records/`, `.claude/coordination/workflows.json`, `.mcp.json`

## Risk Assessment

- **Risk:** A client caches old tool names and fails after rename
  - Mitigation: Document restart requirement in skill docs; no aliases per user direction
- **Risk:** Partial rename leaves some tools with old names
  - Mitigation: Script-driven search-replace with `rg` verification step across entire repo
- **Risk:** `.mcp.json` or IDE plugin references old server name
  - Mitigation: Update `.mcp.json`; test MCP server start after rename
