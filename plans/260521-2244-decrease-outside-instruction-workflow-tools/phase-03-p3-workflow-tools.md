---
phase: 3
title: "P3 Workflow Tools"
status: pending
priority: P2
effort: "3h"
dependencies: [2]
---

# Phase 3: P3 Workflow Tools

## Overview

Implement three lower-priority workflow tools: phase status reporting, product build expansion, and runtime probe planning. These complete the workflow namespace coverage of the operator guide.

## Key Insights

- `workflow_report_phase_status` is simple — orthogonal process steps + experiment outcome
- `workflow_product_build` expands a user request into assertions, risks, experiments, decisions
- `workflow_runtime_probe` plans a standalone feasibility script for a given stack
- All three are relatively small compared to P2 tools
- `workflow_product_build` and `workflow_runtime_probe` were originally operator cards — now they become callable tools

## Requirements

- Functional:
  - `workflow_report_phase_status`: Report process steps + experiment outcome → summary string + lifecycle_complete boolean
  - `workflow_product_build`: Expand request into structured assertions/risks/experiments/decisions
  - `workflow_runtime_probe`: Plan runtime probe experiment for a stack (temp dir, shared env, per-stack probes)
- Non-functional:
  - Each tool < 50 lines of handler logic
  - Tests use `node:test`

## Related Code Files

- Create: `tools/constraint-gate/tools/workflow-report-phase-status-tool.js`
- Create: `tools/constraint-gate/tools/workflow-report-phase-status-tool.test.js`
- Create: `tools/constraint-gate/tools/workflow-product-build-tool.js`
- Create: `tools/constraint-gate/tools/workflow-product-build-tool.test.js`
- Create: `tools/constraint-gate/tools/workflow-runtime-probe-tool.js`
- Create: `tools/constraint-gate/tools/workflow-runtime-probe-tool.test.js`
- Modify: `tools/constraint-gate/server.js` (add 3 imports + 3 register calls)
- Read for context:
  - `records/evidence/meta/capability-generation-extension.md`
  - `records/evidence/meta/live-gate-template.md`

## Implementation Steps

### Tests First (TDD)

1. **Write tests for all 3 tools**
   - `workflow-report-phase-status-tool.test.js`: complete process, incomplete process, blocker reason
   - `workflow-product-build-tool.test.js`: minimal request, complex request with risks
   - `workflow-runtime-probe-tool.test.js`: known stack, unknown stack

### Implementation

2. **Implement `workflow-report-phase-status-tool.js`**
   - Input: process_steps_total, process_steps_complete, experiment_result, blocker_reason?
   - Format: "Process: N/N. Experiment: [result] ([reason])."
   - lifecycle_complete: true when process_steps_total === process_steps_complete AND experiment_result !== "inconclusive" (unless blocker_reason present)

3. **Implement `workflow-product-build-tool.js`**
   - Input: request_description, scope, known_constraints?
   - Output: assertions[], risks[], experiments[], decisions[], required_records[]
   - Reference capability generation extension rules from meta evidence

4. **Implement `workflow-runtime-probe-tool.js`**
   - Input: stack, probe_type, temp_dir?
   - Output: probe_plan (script outline), shared_env_requirements, per_stack_commands[], expected_outputs[]
   - Reference live-gate-template for approval flow rules

5. **Register 3 tools in `server.js`**
   - Add 3 imports + 3 register calls
   - Verify server starts

## Todo List

- [ ] Write tests for all 3 P3 tools
- [ ] Implement `workflow-report-phase-status-tool.js`
- [ ] Implement `workflow-product-build-tool.js`
- [ ] Implement `workflow-runtime-probe-tool.js`
- [ ] Register 3 tools in `server.js`
- [ ] Run `pnpm test` — all tests pass

## Success Criteria

- [ ] All 3 tools return structured JSON with correct shape
- [ ] Tests pass: 3 test files, 6+ test cases
- [ ] Server starts with all 25 tools registered (22 existing + 3 new)

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| `workflow_product_build` is under-specified | Low | Follow operator card pattern; return structured template |
| `workflow_runtime_probe` requires stack knowledge | Low | Hard-code known stacks; unknown stack returns guidance |

## Next Steps

After Phase 3 completes, proceed to Phase 4 (operator guide shrink).
