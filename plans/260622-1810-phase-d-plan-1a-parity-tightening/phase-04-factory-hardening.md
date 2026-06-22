---
phase: 4
title: "Factory Hardening"
status: pending
effort: "~10min"
---

# Phase 4: Factory Hardening

## Overview

Add `id` shape validation regex `/^[a-z][a-z0-9_]*$/` to `createLoopWorkflow` factory. Closes review-260619-1429 finding #8 (workflow `id` not shape-validated). Fail-fast at workflow definition time protects downstream MCP `run_<id>` naming.

## Context Links

- `plans/reports/review-260619-1429-GH-1911-phase-d-plan-1-workflows-report.md` finding #8 (workflow `id` not shape-validated; future additions could silently violate MCP `run_<id>` naming)
- `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` §"Plan 1a candidates" item 1.3 (id shape validation in `createLoopWorkflow` factory `/^[a-z][a-z0-9_]*$/`)
- `tools/learning-loop-mastra/create-loop-workflow.js` line 58 (factory entry; `createLoopWorkflow({ id, description, ... })` destructure)
- `tools/learning-loop-mastra/__tests__/create-loop-workflow.test.js` (5 existing invariant tests; add 1 new test)

## Requirements

- **Functional:**
  - Add `if (!/^[a-z][a-z0-9_]*$/.test(id)) throw new Error(...)` check to `createLoopWorkflow` factory, immediately after the existing `description` validation (line 60-62).
  - Error message: `createLoopWorkflow: id "${id}" must match /^[a-z][a-z0-9_]*$/ (lowercase letters, digits, underscores; must start with a letter).`
  - Add 1 new test to `create-loop-workflow.test.js` proving invalid id (e.g., `"Intake-Orient"` or `"intake orient"`) throws.
- **Non-functional:**
  - Test count delta: +1.
  - All 8 existing workflow ids (`workflow_intake_orient`, `workflow_intake_plan`, `workflow_classify_prompt`, `workflow_intentional_skip`, `workflow_report_phase_status`, `workflow_prepare_runtime_request`, `workflow_self_improvement`, `workflow_runtime_probe`) match the regex; no existing tests break.

## Architecture

Single-line factory check + 1-line test addition.

| Step | Action |
|---|---|
| RED | Add new invariant test: `test("createLoopWorkflow throws on invalid id", ...)`. Pass `id: "Intake-Orient"`. Run; expect test PASSES today (no validation). Mark as "should fail" — invert the assertion. |
| GREEN | Add regex check to factory. Run; expect new test PASSES (now throws). |
| VERIFY | Run all 6 factory tests; expect 6/6 pass. |

## Related Code Files

- **Modify:** `tools/learning-loop-mastra/create-loop-workflow.js` (1-line regex check after line 62)
- **Modify:** `tools/learning-loop-mastra/__tests__/create-loop-workflow.test.js` (add 1 test)
- **Create:** none
- **Delete:** none

## Implementation Steps

1. Read `create-loop-workflow.js` line 58-65 (factory entry + description validation).
2. Add new invariant test:
   ```js
   test("createLoopWorkflow throws on invalid id (uppercase)", () => {
     assert.throws(() => createLoopWorkflow({ id: "Intake-Orient", description: "x", inputSchema: z.object({}), steps: [{...}] }), /must match \/\^\[a-z\]\[a-z0-9_\]\*\$/);
   });
   ```
3. Run; expect test fails today (no validation).
4. Add regex check to factory after line 62:
   ```js
   if (!/^[a-z][a-z0-9_]*$/.test(id)) {
     throw new Error(`createLoopWorkflow: id "${id}" must match /^[a-z][a-z0-9_]*$/ (lowercase letters, digits, underscores; must start with a letter).`);
   }
   ```
5. Re-run; expect new test passes.
6. Run full `pnpm test`; expect 1092 pass (1091 baseline + 1 new).

## Success Criteria

- [ ] Regex check added to `createLoopWorkflow` factory after `description` validation.
- [ ] 1 new test in `create-loop-workflow.test.js` asserting invalid id throws.
- [ ] All 8 existing workflow ids pass the regex (no regression).
- [ ] `pnpm test` exits 0 with 1092 pass / 0 fail / 1 skipped.

## Risk Assessment

- **Existing id fails regex.** Risk: very low. All 8 in-scope ids use lowercase letters + underscores only. Mitigation: Phase 4 step 6 runs all 6 factory tests + 8 wrapper creation tests to confirm no regression.

## Security Considerations

None. Validation is purely shape-based; no data leakage.

## Next Steps

Phase 5: RunId Generation (explicit `crypto.randomUUID()` fallback in `server.js`).