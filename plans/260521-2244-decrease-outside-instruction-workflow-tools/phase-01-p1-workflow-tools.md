---
phase: 1
title: "P1 Workflow Tools"
status: pending
priority: P1
effort: "4h"
dependencies: [0]
---

# Phase 1: P1 Workflow Tools

## Overview

Implement the four highest-priority workflow tools that cover the agent intake flow and runtime request protocol. These are the tools the agent calls first in any session. Phase 0 (safeImport) is a blocking prerequisite.

## Key Insights

- `workflow_classify_prompt` is the entry point — every user prompt flows through here first
- `workflow_intake_orient` performs index-first orientation — it reads `records/index/`, scans meta triggers, checks observations
- `workflow_prepare_runtime_request` generates structured approval request text — advisory only; agent must still call `check_gate` before execution
- `workflow_intake_plan` consumes orient output and returns ordered next steps for intake steps 3-4
- All three tools follow the existing pattern: export `{ name, description, schema, handler }` config object
- Tests must use `node:test` + real filesystem (no mocking), following the existing gate tool test pattern

## Requirements

- Functional:
  - `workflow_classify_prompt`: Classify user prompt into 8 categories with confidence + suggested tools
  - `workflow_intake_orient`: Return index entries, meta triggers, observations, capability files, missing decisions
  - `workflow_intake_plan`: Consume orient output, return ordered next steps for intake steps 3-4 (candidate extraction + verification classify)
  - `workflow_prepare_runtime_request`: Generate structured approval request text + pre-conditions checklist (advisory only; agent must still call `check_gate`)
- Non-functional:
  - Each tool < 60 lines of handler logic (orchestration, not heavy computation)
  - Rich descriptions: what it does, when to use, what it returns, failure modes
  - Tests run with `node --test` against real repo

## Architecture

Each tool is a plain JS module exporting a config object. Registration happens in `server.js` via `registerTool()`.

```javascript
// workflow-classify-prompt-tool.js
import { z } from "zod";

export const workflowClassifyPromptTool = {
  name: "workflow_classify_prompt",
  description: "Classify a user prompt into one of 8 categories...",
  schema: {
    prompt: z.string().describe("The user prompt to classify")
  },
  handler: async ({ prompt }) => {
    // Classification logic
    return {
      content: [{ type: "text", text: JSON.stringify(result) }]
    };
  }
};
```

## Related Code Files

- Create: `tools/constraint-gate/tools/workflow-classify-prompt-tool.js`
- Create: `tools/constraint-gate/tools/workflow-classify-prompt-tool.test.js`
- Create: `tools/constraint-gate/tools/workflow-intake-orient-tool.js`
- Create: `tools/constraint-gate/tools/workflow-intake-orient-tool.test.js`
- Create: `tools/constraint-gate/tools/workflow-prepare-runtime-request-tool.js`
- Create: `tools/constraint-gate/tools/workflow-prepare-runtime-request-tool.test.js`
- Modify: `tools/constraint-gate/server.js` (add 3 imports + 3 register calls)
- Read for context:
  - `tools/constraint-gate/tools/validate-records-tool.js` (existing pattern)
  - `tools/constraint-gate/tools/validate-records-tool.test.js` (test pattern)
  - `tools/constraint-gate/tool-registry.js`
  - `tools/constraint-gate/resolve-root.js`
  - `tools/constraint-gate/gate-logging.js`
  - `records/evidence/meta/resource-budget-procedural-rules.md`

## Implementation Steps

### Tests First (TDD)

1. **Write `workflow-classify-prompt-tool.test.js`**
   - Test: empty prompt → returns error
   - Test: evidence-style prompt → category "evidence"
   - Test: product-style prompt → category "product"
   - Test: runtime command prompt → category "verification"

2. **Write `workflow-intake-orient-tool.test.js`**
   - Test: basic orient → returns index entries array (length > 0)
   - Test: missing category → returns error
   - Test: orient with capability scope → filters capability files

3. **Write `workflow-intake-plan-tool.test.js`**
   - Test: consumes orient output → returns ordered steps array
   - Test: missing verification candidates → flags step 3 as blocked

4. **Write `workflow-prepare-runtime-request-tool.test.js`**
   - Test: sandbox install request → pre_conditions checklist passes
   - Test: production runtime without observation → flags missing observation
   - Test: missing evidence → flags missing evidence in checklist

### Implementation

4. **Verify dependencies exist**
   - Check `gate-logic.js` for `evaluateRuntimePreconditions()` and `checkObservationStaleness()`
   - If missing, implement them as thin wrappers over existing `readBudgets()` + `readObservations()`
   - This is a 15-minute blocker check before proceeding

5. **Implement `workflow-classify-prompt-tool.js`**
   - Simple keyword/heuristic classifier (not ML)
   - 8 categories: evidence, assertion, verification, product, observation, skip, external_decision, self_improvement
   - Map each category to suggested tool names
   - Use `resolveRoot()` for repo-relative paths if reading index files

6. **Implement `workflow-intake-orient-tool.js`**
   - Read `records/index/` YAML files
   - Scan `records/evidence/meta/` for trigger files
   - Read `records/observations/` for active observations
   - Scan `records/capabilities/` for relevant capability files
   - Return structured result with all 5 arrays

7. **Implement `workflow-intake-plan-tool.js`**
   - Consume `workflow_intake_orient` output
   - Extract verification candidates from index entries
   - Classify each candidate by verification type (static, import, runtime)
   - Return ordered steps: which records to read, which tools to call, which questions to ask

8. **Implement `workflow-prepare-runtime-request-tool.js`**
   - Accept dimension, scope, output_level, command_class, temp_root_class, evidence_missing, why_local_insufficient
   - Check budget state via shared `evaluateRuntimePreconditions()` helper (reuses `gate-logic.js`)
   - Check observation freshness via `checkObservationStaleness()` — return `marker_timestamp` checked
   - Format approval request text per operator guide protocol
   - Return approval_request string + pre_conditions checklist (NOT a gate decision)
   - Description must state: "This tool does NOT approve commands; always run `check_gate` before execution"

9. **Register tools in `server.js`**
   - Add 4 import statements
   - Add 4 `registerTool()` calls
   - Verify server starts without errors: `node tools/constraint-gate/server.js` (should exit after init)

## Todo List

- [ ] Write `workflow-classify-prompt-tool.test.js`
- [ ] Write `workflow-intake-orient-tool.test.js`
- [ ] Write `workflow-intake-plan-tool.test.js`
- [ ] Write `workflow-prepare-runtime-request-tool.test.js`
- [ ] Implement `workflow-classify-prompt-tool.js`
- [ ] Implement `workflow-intake-orient-tool.js`
- [ ] Implement `workflow-intake-plan-tool.js`
- [ ] Implement `workflow-prepare-runtime-request-tool.js`
- [ ] Register 4 tools in `server.js`
- [ ] Write rich descriptions for each tool (what, when, returns, failure modes)
- [ ] Run `pnpm test` — all tests pass
- [ ] Run existing gate tool tests — no regressions

## Success Criteria

- [ ] All 4 tools return structured JSON with correct shape
- [ ] Tests pass: 4 test files, 12+ test cases
- [ ] Server starts with all 16 tools registered (12 existing + 4 new)
- [ ] Tool descriptions state: what it does, when to use, what it returns, failure modes
- [ ] `workflow_prepare_runtime_request` description explicitly states it is advisory and `check_gate` is still required

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| `workflow_intake_orient` reads many directories — slow | Low | Read is synchronous; directories are small (<50 files each) |
| `workflow_classify_prompt` heuristic is brittle | Medium | Document confidence levels; agent can override |
| `workflow_prepare_runtime_request` duplicates gate_check logic | Medium | Extract shared `evaluateRuntimePreconditions()` helper in `gate-logic.js` |

## Security Considerations

- Workflow tools are read-only or return structured output; they do NOT write files directly
  - Exception: `record_observation` and `update_observation` already write via MCP; this is existing behavior
  - Any new workflow tool that needs to write must use the agent's Write tool (subject to write-coordination-gate hook) or add an MCP-level write gate
- `workflow_prepare_runtime_request` does NOT execute commands and does NOT approve commands — it only generates approval text + checklist
  - Description must explicitly state: "This tool does NOT approve commands; always run `check_gate` before execution"
- All reads use `resolveRoot()` with path-escape guard; user-supplied paths must additionally pass `resolveSafePath(root, subPath)` to prevent traversal

## Next Steps

After Phase 1 completes, proceed to Phase 2 (P2 workflow tools). Phase 1 does NOT shrink the operator guide yet — shrink happens in Phase 4 after all tools are implemented.
