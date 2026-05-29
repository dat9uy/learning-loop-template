---
phase: 2
title: "Meta-State Category Extension"
status: completed
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Meta-State Category Extension

## Overview

Add `budget-check` to the `meta_state_report` tool's category enum. Extend the affected_system enum to include `vnstock_vendor` (and other vendor systems). Add a test for `budget-check` entries in `meta-state.test.js`. This enables the agent to record budget-check reasoning in meta-state via the existing `meta_state_report` MCP tool.

## Requirements

- **Functional:** `meta_state_report` accepts `category: "budget-check"`
- **Functional:** `meta_state_report` accepts `affected_system: "vnstock_vendor"` (and future vendor systems)
- **Functional:** `meta_state_list` can filter by `category: "budget-check"`
- **Functional:** `meta-state.jsonl` entries with `category: "budget-check"` are valid
- **Non-functional:** Existing meta-state categories remain unchanged
- **Non-functional:** All meta-state tests pass

## Architecture

### Current `meta_state_report` schema (from `tools/learning-loop-mcp/tools/meta-state-report-tool.js`):

```javascript
category: z.enum(["gate-logic-bug", "record-repair-gap", "schema-drift", "stale-ref", "mcp-tool-missing"])
severity: z.enum(["warning", "escalate"])
affected_system: z.enum(["gate-logic", "record-validation", "index-extractor", "mcp-tools", "workflow-registry"])
```

### Target schema:

```javascript
category: z.enum(["gate-logic-bug", "record-repair-gap", "schema-drift", "stale-ref", "mcp-tool-missing", "budget-check"])
severity: z.enum(["warning", "escalate"])
affected_system: z.enum(["gate-logic", "record-validation", "index-extractor", "mcp-tools", "workflow-registry", "vnstock_vendor"])
```

### Budget-check entry schema:

```json
{
  "id": "meta-260529T1530Z-budget-check-vnstock-device-slots",
  "category": "budget-check",
  "severity": "warning",
  "affected_system": "vnstock_vendor",
  "description": "Agent checked budget before vendor-api command. Budget: 1/1, fingerprint matches ledger entry 0637fff6c615f57b73e646206fdf774d. Decision: proceed (idempotent re-run).",
  "evidence": {
    "observation": "records/observations/observation-vnstock-resource-budget.yaml",
    "ledger": "records/observations/observation-vnstock-device-slot-ledger.yaml"
  },
  "status": "reported"
}
```

## Related Code Files

- **Modify:** `tools/learning-loop-mcp/tools/meta-state-report-tool.js` — add `"budget-check"` to category enum, add `"vnstock_vendor"` to affected_system enum
- **Modify:** `tools/learning-loop-mcp/core/meta-state.js` — add `budget-check` to validation if any (the `filterEntries` function is generic, so no change needed)
- **Modify:** `__tests__/meta-state.test.js` or `__tests__/meta-state-integration.test.js` — add test for `budget-check` entry creation
- **Modify:** `tools/learning-loop-mcp/agent-manifest.json` — update the `meta_state` group description to include budget-check usage
- **Document:** `meta-state-report-tool.js` — add note about MCP server restart after schema change

## Implementation Steps

1. **Update `meta-state-report-tool.js`:**
   - Add `"budget-check"` to category enum
   - Add `"vnstock_vendor"` to affected_system enum
   - Consider adding a future-proof mechanism: allow `affected_system` to accept any string (not strict enum) for vendor systems, or keep the enum and add vendors as needed
   - **Note:** MCP server must be restarted after schema change for new enum values to be recognized by the agent

2. **Update `meta-state.js`:**
   - Check if there's any category validation in `meta-state.js` (there isn't — validation is in the tool schema)
   - Confirm `filterEntries` works with `category: "budget-check"`

3. **Write tests:**
   - Add test: `meta_state_report` with `category: "budget-check"` and `affected_system: "vnstock_vendor"` succeeds
   - Add test: `meta_state_list` filtering by `category: "budget-check"` returns only budget-check entries
   - Add test: `meta_state_report` with `category: "budget-check"` and `severity: "warning"` writes correct JSONL

4. **Run `pnpm test`** — all meta-state tests pass

## Success Criteria

- [x] `meta_state_report` accepts `category: "budget-check"`
- [x] `meta_state_report` accepts `affected_system: "vnstock_vendor"`
- [x] `meta_state_list` filters by `category: "budget-check"` correctly
- [x] `meta-state.jsonl` contains valid `budget-check` entry after test
- [x] All meta-state tests pass
- [x] All 273 tests pass
