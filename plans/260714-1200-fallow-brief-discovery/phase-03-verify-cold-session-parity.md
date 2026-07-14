---
phase: 3
title: "verify-cold-session-parity"
status: completed
effort: ""
---

# Phase 3: Verify cold-session parity

## Overview

Run the cold-session discoverability parity test (already in the suite) to confirm PROCESS_HINTS and LOCAL_PROCESS_HINTS are byte-identical; add 2 new regression tests for `rule-fallow-brief-on-gate-failure` (rule-loads + PROCESS_HINTS-contains-rule-id); run `loop_describe({tier: warm})` to confirm the hint surfaces in the agent runtime contract.

## Requirements

- Functional: existing cold-session parity test stays green; new regression tests for the new rule pass.
- Non-functional: full test suite delta is exactly +2 (no regressions).

## Related Code Files

- Create: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-fallow-brief.test.js` (NEW; 2 tests)
- Modify: (none beyond test creation)

## Implementation Steps

1. Read `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-tool-integration.test.js` (the existing test from `260628-1337`) to model the new test file after. The existing test uses `applyPromotedRules` (imported at line 5-7) + constructs the rule object inline (line 19-37); it does NOT use `loadPromotedRules`. Mirror this pattern — registry round-trip tests depend on Phase 2 having pre-populated the registry and fail in isolation in CI without the rule.
2. Create `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-fallow-brief.test.js` with 2 tests:
   - Test 1: "consult-checklist rule schema is valid for rule-fallow-brief-on-gate-failure" — constructs the rule object inline (mirroring `gate-logic-consult-checklist-tool-integration.test.js:19-37`), asserts `applyPromotedRules` returns the expected consult-checklist shape (1 item with id `fallow-gate-failure-routes-to-brief`).
   - Test 2: "PROCESS_HINTS row #5 contains the literal rule id substring" — imports `buildProcessHints` (or the same export the existing test uses) and asserts the returned array includes the literal `rule-fallow-brief-on-gate-failure` substring (per H6 ordering gate at `loop-describe-tool.js:94-106`).
3. Run `vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs` (test at lines 359-379 must stay green — no PROCESS_HINTS ↔ LOCAL_PROCESS_HINTS drift).
4. Run `vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-fallow-brief.test.js` — must pass (+2 tests).
5. Run `pnpm test` — full suite delta should be exactly +2; no regressions.
6. Call `loop_describe({ tier: 'warm' })` MCP tool — confirm `process_hints` array has 5 entries; entry #5 begins with "Fallow gate triage." and references `pnpm fallow:brief`; `warnings` array is empty.

## Success Criteria

- [ ] `vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs` exits 0 (parity holds; test at lines 359-379).
- [ ] `vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/gate-logic-consult-checklist-fallow-brief.test.js` exits 0 (+2 new tests, mirroring `applyPromotedRules` pattern from `gate-logic-consult-checklist-tool-integration.test.js:5-7`).
- [ ] `pnpm test` test count delta is exactly +2.
- [ ] `loop_describe({ tier: 'warm' }).process_hints` has 5 entries; entry #5 references `pnpm fallow:brief` AND the literal `rule-fallow-brief-on-gate-failure`.
- [ ] `loop_describe({ tier: 'warm' }).warnings` is empty (no H6 ordering-gate firing).

## Risk Assessment

- **Risk:** Existing tests that count PROCESS_HINTS rows break when the array grows 4 → 5. **Mitigation:** the cold-session parity test asserts byte-equality on the whole array (lines 359-379), not length-specific; only length-specific assertions elsewhere need touching. Search the test suite for `length === 4`-style assertions on PROCESS_HINTS before merging.
- **Risk:** The new test file diverges from the existing test's import pattern. **Mitigation:** mirror `gate-logic-consult-checklist-tool-integration.test.js:5-7` (`applyPromotedRules` + constructed rule object); do NOT use `loadPromotedRules` against the live registry (test would be order-coupled to Phase 2 step 9).
- **Risk:** `loop_describe({ tier: 'warm' })` is run against a stale cache. **Mitigation:** the tool re-reads `meta-state.jsonl` on each call (no in-process cache); confirm by running twice and comparing outputs.