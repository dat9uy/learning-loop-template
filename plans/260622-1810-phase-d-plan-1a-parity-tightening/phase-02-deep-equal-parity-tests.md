---
phase: 2
title: "Deep-Equal Parity Tests"
status: pending
effort: "~1h"
---

# Phase 2: Deep-Equal Parity Tests

## Overview

Replace 6 of 8 shape-only parity assertions in `workflow-direct-parity.test.js` with `assert.deepStrictEqual` using the existing `legacyToResult` helper. Closes review-260619-1429 finding #2 + #3. Plan 1 left shape-only assertions (Array.isArray, typeof, scalar equality) which mask field-level regressions.

## Context Links

- `plans/reports/review-260619-1429-GH-1911-phase-d-plan-1-workflows-report.md` finding #2 (parity tests are shape-only, not deep-equal)
- `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` §"Plan 1a candidates" item 1.1 (deep-equal structural parity for remaining 6 workflows)
- `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js` (target file; has 8 shape-only tests + unused `legacyToResult` helper at lines 27-32)
- `tools/learning-loop-mastra/workflows/workflow-*.js` (8 wrappers; outputs are JSON-serializable plain objects)
- `tools/learning-loop-mcp/tools/workflow-*.js` (legacy handlers; reference outputs)

## Requirements

- **Functional:**
  - Add 6 `assert.deepStrictEqual(started.result, EXPECTED_LEGACY_OUTPUT)` assertions to `workflow-direct-parity.test.js` — one per workflow in this set: `workflow_intake_orient`, `workflow_intake_plan`, `workflow_prepare_runtime_request`, `workflow_self_improvement`, `workflow_report_phase_status`, `workflow_runtime_probe`. (The other 2 — `workflow_classify_prompt` + `workflow_intentional_skip` — already have explicit deep-equal assertions per parent review report's cross-reference at line 32-33; verify and skip if so.)
  - Use the existing `legacyToResult` helper (lines 27-32) to compute `EXPECTED_LEGACY_OUTPUT` from the legacy handler.
  - Wire `legacyToResult` helper (currently dead code per review finding #3) into each new assertion.
- **Non-functional:**
  - Test count delta: +6 (was 8 shape-only tests in `workflow-direct-parity.test.js`; 6 upgraded, 2 retained as shape-only + new deep-equal).
  - Test must run in <50ms per workflow (no I/O).
  - Test must NOT require live MCP server (direct unit test pattern).

## Architecture

TDD: RED → GREEN.

| Step | Action |
|---|---|
| RED | Add 6 new test cases with `assert.deepStrictEqual(started.result, EXPECTED_LEGACY_OUTPUT)` — call `legacyToResult` from each. Run; expect 6 failures (helper currently unused). |
| GREEN | No code changes; tests pass once `legacyToResult` is wired in (it already exists; just call it). |
| VERIFY | `pnpm test` exits 0; `workflow-direct-parity.test.js` shows 14 tests passing (8 existing + 6 new). |

The helper `legacyToResult` is the inverse of `with-mcp-server.js:89`'s envelope strip — it takes the legacy handler's MCP envelope output and returns the unwrapped result object. Wiring it in (per review finding #3) is the fix.

## Related Code Files

- **Modify:** `tools/learning-loop-mastra/__tests__/workflow-direct-parity.test.js` (add 6 deep-equal assertions + wire `legacyToResult` calls)
- **Create:** none
- **Delete:** none

## Implementation Steps

1. Read current `workflow-direct-parity.test.js`; identify which 6 of 8 workflows need deep-equal upgrades (per finding #2, the 6 are the ones with non-trivial output shapes).
2. For each of the 6 workflows:
   - Add new test case: `test("workflow_<name> matches legacy handler output structurally", async () => { const started = await workflow.createRun(); const result = await started.start({ inputData: FIXTURE_INPUT }); assert.deepStrictEqual(result, legacyToResult(await legacyHandler(FIXTURE_INPUT))); });`
   - `FIXTURE_INPUT` per workflow: read from existing shape-only test (top of file).
   - `legacyHandler`: import from `tools/learning-loop-mcp/tools/workflow-<name>.js` (legacy path).
3. Run `pnpm --filter learning-loop-mastra test -- workflow-direct-parity.test.js`; expect 6 new tests pass.
4. Run full `pnpm test`; expect 1089 pass (1083 baseline + 6 new).

## Success Criteria

- [ ] 6 new `assert.deepStrictEqual` assertions added to `workflow-direct-parity.test.js`.
- [ ] `legacyToResult` helper wired into each new test (no longer dead code per finding #3).
- [ ] `pnpm test` exits 0 with 1089 pass / 0 fail / 1 skipped (was 1083 baseline).
- [ ] Each new test runs in <50ms (direct unit; no MCP).

## Risk Assessment

- **Legacy handler output divergence.** Risk: low. The legacy handlers are read-only deterministic functions; their output is captured in Plan 1's parity test fixtures. Mitigation: if `legacyToResult` produces unexpected shape, surface the diff and halt; do NOT relax the assertion.
- **Slow test (live I/O in direct unit test).** Risk: low. Workflow handlers are pure compute + filesystem reads (no network). Mitigation: if any test takes >50ms, profile and add caching or skip live filesystem calls (use in-memory fixtures).

## Security Considerations

None. Read-only test on deterministic code paths.

## Next Steps

Phase 3: Envelope Input Tests (proves `stripEnvelope` handles MCP envelope form for agent callers).