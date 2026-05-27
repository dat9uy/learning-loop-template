---
phase: 5
title: "Agent Manifest + Skill Documentation"
status: pending
priority: P2
effort: "1h"
dependencies:
  - 4
---

# Phase 5: Agent Manifest + Skill Documentation

## Overview

Create an agent-facing MCP surface manifest (`agent-manifest.json`) that groups the 33 namespaced tools by semantic domain with ordering hints, typical chains, and cache TTL. Update `.factory/skills/coordination-gate/SKILL.md` with quickstart recipes for common agent workflows (product build, record CRUD, index verification).

## Requirements

- Functional: `agent-manifest.json` exists and groups tools by domain: `gate`, `record_crud`, `workflow`, `index`, `capability`
- Functional: Each group has `description`, `tools[]`, `ordering` hint, optional `typical_chain`
- Functional: `quickstart` section provides concrete tool-call sequences for common workflows
- Functional: `.factory/skills/coordination-gate/SKILL.md` references manifest and quickstarts
- Non-functional: Manifest is human-readable and machine-parseable

## Architecture

### Deliverable 1: `tools/coordination-gate/mcp/agent-manifest.json`

```json
{
  "version": "1.0.0",
  "groups": {
    "gate": {
      "description": "Safety checks — call BEFORE any write operation",
      "tools": ["gate_check", "gate_mark_preflight"],
      "ordering": "mandatory-first",
      "cache_ttl": 0
    },
    "record_crud": {
      "description": "Create/update decision, experiment, risk, observation records",
      "tools": [
        "record_create_decision", "record_update_decision",
        "record_create_experiment", "record_update_experiment",
        "record_create_risk", "record_update_risk",
        "record_create_observation", "record_update_observation",
        "record_delete"
      ],
      "ordering": "any",
      "requires_observation": true
    },
    "workflow": {
      "description": "Learning-loop workflow orchestration",
      "tools": [
        "workflow_intake_orient", "workflow_intake_plan",
        "workflow_classify_prompt", "workflow_prepare_runtime_request",
        "workflow_convert_evidence", "workflow_verify_evidence",
        "workflow_generate_prompt", "workflow_external_decision",
        "workflow_self_improvement", "workflow_intentional_skip",
        "workflow_report_phase_status", "workflow_product_build",
        "workflow_runtime_probe", "workflow_notify_artifact",
        "workflow_trigger"
      ],
      "ordering": "linear",
      "typical_chain": [
        "workflow_intake_orient",
        "workflow_intake_plan",
        "workflow_product_build",
        "workflow_runtime_probe"
      ]
    },
    "index": {
      "description": "Index extraction, search, and validation",
      "tools": ["index_extract", "index_search", "index_validate", "index_update_claim"],
      "ordering": "extract-before-search",
      "typical_chain": ["index_validate", "index_extract", "index_search"]
    },
    "capability": {
      "description": "Capability map generation and probe listing",
      "tools": ["capability_generate", "capability_list_probes", "capability_list_verified"],
      "ordering": "any"
    }
  },
  "quickstart": {
    "product_build": [
      { "tool": "gate_mark_preflight", "surface": "product" },
      { "tool": "gate_check", "file_path": "product/**" },
      { "tool": "workflow_intake_orient", "input": "plan.md" },
      { "tool": "workflow_intake_plan", "input": "$workflow_intake_orient" },
      { "tool": "record_create_decision", "surface": "product" },
      { "tool": "workflow_product_build" },
      { "tool": "index_validate" },
      { "tool": "index_extract" }
    ],
    "record_verification": [
      { "tool": "index_validate" },
      { "tool": "index_extract" },
      { "tool": "index_search", "filters": { "status": "verified" } }
    ]
  }
}
```

### Deliverable 2: `.factory/skills/coordination-gate/SKILL.md`

Quickstart recipes referencing namespaced tools:

```markdown
## Quickstart: Product Build Workflow

1. `gate_mark_preflight` — unlock product/** writes
2. `gate_check` — verify target files are safe to modify
3. `workflow_intake_orient` — orient on plan.md
4. `record_create_decision` — create required decision record
5. `workflow_product_build` — execute build
6. `index_validate` + `index_extract` — update ledger

## Quickstart: Record CRUD

Use `record_create_*` / `record_update_*` for all `records/**` writes.
Direct Edit/Write/Bash to `records/**` is mechanically blocked.
```

## Related Code Files
- Create: `tools/coordination-gate/mcp/agent-manifest.json`
- Modify: `.factory/skills/coordination-gate/SKILL.md`
- Modify: `.claude/skills/coordination-gate/SKILL.md` (sync with `.factory/` version)
- Modify: `CLAUDE.md` (add manifest reference)

## Implementation Steps

1. **Draft `agent-manifest.json`** (20 min)
   - Group 33 tools into 5 semantic domains
   - Add `ordering`, `typical_chain`, `cache_ttl` metadata per group
   - Write `quickstart` recipes for product_build and record_verification

2. **Validate manifest against actual tools** (10 min)
   - `node -e "const m=require('./tools/coordination-gate/mcp/manifest.json'); const a=require('./tools/coordination-gate/mcp/agent-manifest.json'); /* assert every tool in manifest appears in exactly one group */"`

3. **Write skill quickstarts** (20 min)
   - Update `.factory/skills/coordination-gate/SKILL.md` with recipes
   - Sync to `.claude/skills/coordination-gate/SKILL.md`

4. **Update `CLAUDE.md`** (10 min)
   - Add reference to agent-manifest.json in the MCP-First Record Access section

## Success Criteria

- [ ] `agent-manifest.json` exists and is valid JSON
- [ ] Every MCP tool in `manifest.json` appears in exactly one group in `agent-manifest.json`
- [ ] `.factory/skills/coordination-gate/SKILL.md` contains 2+ quickstart recipes
- [ ] Quickstart recipes use namespaced tool names
- [ ] `CLAUDE.md` references the manifest

## Risk Assessment

- **Risk:** Manifest drifts from actual tool list as tools are added/removed
  - Mitigation: CI validation script compares manifest.json against agent-manifest.json
- **Risk:** Quickstart recipes are too abstract to be useful
  - Mitigation: Base recipes on real agent sessions; include concrete parameter examples
