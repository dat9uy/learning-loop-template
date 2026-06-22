---
phase: 3
title: "Envelope Input Tests"
status: pending
effort: "~30min"
---

# Phase 3: Envelope Input Tests

## Overview

Add 2 tests proving `stripEnvelope` (in `create-loop-workflow.js` step executor) handles the MCP envelope form when an agent caller wraps the input. Closes review-260619-1429 finding #3 (envelope-input coverage). Plan 1 shipped `stripEnvelope` but only tested raw (non-envelope) input.

## Context Links

- `plans/reports/review-260619-1429-GH-1911-phase-d-plan-1-workflows-report.md` finding #3 (envelope-input tests for `workflow_self_improvement` and `workflow_intake_plan` to prove `stripEnvelope` preprocess handles the MCP envelope form)
- `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` §"Plan 1a candidates" item 1.2 (envelope-input tests for 2 workflows)
- `tools/learning-loop-mastra/create-loop-workflow.js` (factory; step executor at line 36-54 wraps `adaptLegacyHandler` + defensive envelope strip)
- `tools/learning-loop-mastra/workflows/workflow-self-improvement.js` (target workflow #1)
- `tools/learning-loop-mastra/workflows/workflow-intake-plan.js` (target workflow #2)

## Requirements

- **Functional:**
  - Add 2 test cases to `workflow-direct-parity.test.js` proving envelope-form input produces the same output as raw input for `workflow_self_improvement` and `workflow_intake_plan`.
  - Envelope form: `{ content: [{ type: "text", text: JSON.stringify(rawInput) }] }` (the MCP wire format).
- **Non-functional:**
  - Test count delta: +2.
  - Each test runs in <50ms.

## Architecture

TDD: RED → GREEN.

| Step | Action |
|---|---|
| RED | Add 2 envelope-form tests; expect them to FAIL initially because `createLoopWorkflow`'s step executor does not call `stripEnvelope` on the input — only on the handler's result (line 50-55 in `create-loop-workflow.js`). |
| GREEN | Modify `create-loop-workflow.js` step executor: add `stripEnvelope(input)` preprocess before calling `handler(input, params)`. Update comment at line 47-49 to reflect envelope-aware input handling. |
| VERIFY | 2 new tests pass; existing 8 shape-only + 6 deep-equal (from Phase 2) + 2 envelope = 16 tests in `workflow-direct-parity.test.js`. |

## Related Code Files

- **Modify:** `tools/learning-loop-mastra/create-loop-workflow.js` (step executor; add `stripEnvelope` input preprocess)
- **Modify:** `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js` (add 2 envelope tests)
- **Create:** none
- **Delete:** none

## Implementation Steps

1. Read `create-loop-workflow.js` lines 36-55 (step executor).
2. Add 2 RED tests:
   - `test("workflow_self_improvement handles envelope-form input", ...)`: pass `{ content: [{ type: "text", text: JSON.stringify(RAW_INPUT) }] }` as `inputData`; expect same result as raw input.
   - `test("workflow_intake_plan handles envelope-form input", ...)`: same pattern.
3. Run; expect 2 failures (current executor does not strip envelope on input).
4. Modify `create-loop-workflow.js` step executor: add `const stripped = stripEnvelope(data); return handler(stripped, params);` (where `stripEnvelope` is the inverse of `adaptLegacyHandler` — already implemented in `legacy-handler-adapter.js`).
5. Re-run; expect 2 tests pass.
6. Run full `pnpm test`; expect 1091 pass (1089 baseline + 2 new envelope tests).

## Success Criteria

- [ ] 2 envelope-form tests added to `workflow-direct-parity.test.js`.
- [ ] `create-loop-workflow.js` step executor strips envelope on input (not just on handler result).
- [ ] `pnpm test` exits 0 with 1091 pass / 0 fail / 1 skipped.

## Risk Assessment

- **Strip-on-input changes wrapper behavior.** Risk: low. Plan 1's parity tests already verify raw input works; adding strip-on-input is additive. Mitigation: Phase 3 step 4 includes a re-run of all 14 prior tests in `workflow-direct-parity.test.js` to confirm no regression.

## Security Considerations

- **Envelope-strip parsing must fail-closed on malformed input.** If envelope form is `{content: [{text: "not json"}]}`, `JSON.parse` throws. Mitigation: wrap `JSON.parse` in try/catch; if parse fails, fall back to raw input (matches `adaptLegacyHandler` behavior at line 50-55).

## Next Steps

Phase 4: Factory Hardening (id-shape validation regex).