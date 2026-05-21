---
phase: 6
title: "Integration Test"
status: pending
priority: P1
effort: "2h"
dependencies: [1, 2, 3, 4, 5]
---

# Phase 6: Integration Test

## Overview

Validate that an agent can complete the full intake → experiment → capability lifecycle without opening `docs/operator-guide.md`. Run a synthetic end-to-end test that exercises all 13 workflow tools in sequence.

## Key Insights

- The integration test is synthetic — it calls tools directly, not through a real agent session
- It validates tool coverage and correct behavior, not real agent decision-making
- The test scenario: "I want to verify that the vnstock install works in a fresh sandbox and then build a product capability on top of it"
- This scenario exercises: classify → orient → plan → prepare runtime request → convert evidence → report phase → validate records → extract index → generate capabilities

## Requirements

- Functional:
  - Simulate the 10-step agent lifecycle from the brainstorm report
  - Verify each step produces expected output shape
  - Verify no step requires opening operator-guide.md
  - Verify guide line count < 120
- Non-functional:
  - Test runs with `node --test`
  - Test completes in < 30 seconds
  - Test is deterministic (no randomness)

## Related Code Files

- Create: `tools/constraint-gate/tools/agent-lifecycle-integration.test.js`
- Read for context:
  - `plans/reports/brainstorm-260521-decrease-outside-instruction.md` §Integration Test Scenario
  - `docs/operator-guide.md` (post-shrink)

## Architecture

```javascript
// agent-lifecycle-integration.test.js
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { workflowClassifyPromptTool } from "../tools/workflow-classify-prompt-tool.js";
import { workflowIntakeOrientTool } from "../tools/workflow-intake-orient-tool.js";
// ... etc

describe("agent completes intake lifecycle", () => {
  it("step 1: classify prompt → product", async () => {
    const result = await workflowClassifyPromptTool.handler({
      prompt: "I want to verify vnstock install and build a product capability"
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.category, "product");
  });

  it("step 2: intake orient → returns index entries", async () => {
    // ...
  });

  // ... steps 3-10
});
```

## Implementation Steps

1. **Write integration test file**
   - Import all 13 workflow tools
   - Step 1: `workflow_classify_prompt` → category "product"
   - Step 2: `workflow_intake_orient` → index entries for `vnstock-data`
   - Step 3: `workflow_intake_plan` → ordered steps from orient output
   - Step 4: `workflow_prepare_runtime_request` → pre_conditions checklist
   - Step 5: `workflow_convert_evidence` → produces experiment YAML
   - Step 6: `workflow_report_phase_status` → lifecycle_complete false during process
   - Step 7: `validate_records` → valid: true
   - Step 8: `extract_index_entries` → entries generated
   - Step 9: `generate_capability_records` → capability records derived
   - Step 10: Final `workflow_report_phase_status` → lifecycle_complete true

2. **Add guide line count assertion**
   - Read `docs/operator-guide.md` and assert `lineCount < 120`

3. **Add tool coverage assertion**
   - Read `server.js` and assert all 25 tools are registered (12 existing + 13 new)
   - Assert no existing tool names collide with new `workflow_*` names

4. **Run synthetic integration test**
   - `cd tools/constraint-gate && node --test tools/agent-lifecycle-integration.test.js`
   - If any step fails, fix the underlying tool or test

5. **Real agent session validation**
   - Rename `docs/operator-guide.md` to `docs/operator-guide.md.bak` (hide from agent)
   - Spawn a fresh agent session with prompt: "I want to verify that the vnstock install works in a fresh sandbox and then build a product capability on top of it"
   - Verify the agent completes the 10-step lifecycle using workflow tools only
   - Evaluate transcript against checklist:
     - [ ] Calls `workflow_classify_prompt` first
     - [ ] Calls `workflow_intake_orient` before browsing evidence standalone
     - [ ] Reads observations before asking operator
     - [ ] Calls `workflow_prepare_runtime_request` before runtime commands
     - [ ] Calls `check_gate` before executing any command
     - [ ] Calls `workflow_report_phase_status` after experiments
     - [ ] Does NOT open `docs/operator-guide.md.bak`
   - Restore `docs/operator-guide.md` after validation
   - Document result in `/ck:journal`

## Todo List

- [ ] Write `agent-lifecycle-integration.test.js`
- [ ] Step 1: classify prompt test
- [ ] Step 2: intake orient test
- [ ] Step 3: intake plan test
- [ ] Step 4: prepare runtime request test
- [ ] Step 5: convert evidence test
- [ ] Step 6: report phase status (mid) test
- [ ] Step 7: validate records test
- [ ] Step 8: extract index test
- [ ] Step 9: capability derivation test
- [ ] Step 10: final report phase status test
- [ ] Guide line count assertion
- [ ] Tool coverage assertion (25 tools)
- [ ] Run synthetic integration test — all steps pass
- [ ] Real agent session validation — hide guide, spawn session, evaluate transcript

## Success Criteria

- [ ] All 10 integration test steps pass
- [ ] Guide line count assertion passes (< 120, range 100-140)
- [ ] Tool coverage assertion passes (25 tools registered: 12 existing + 13 new)
- [ ] Test runs in < 30 seconds
- [ ] No regression in existing unit tests
- [ ] At least one real agent session validated end-to-end without guide access

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Integration test is too rigid | Medium | Each step is independent; one failure does not cascade |
| Real agent behavior differs from synthetic test | Medium | Document: test validates coverage, not real behavior |
| Test requires specific repo state | Low | Test uses existing evidence/index files; no external dependencies |

## Next Steps

After Phase 5 completes:
- Run full test suite: `pnpm test`
- Run record validation: `pnpm validate:records`
- Run index extraction: `pnpm extract:index`
- Mark plan as complete
- Proceed to `/ck:journal`
