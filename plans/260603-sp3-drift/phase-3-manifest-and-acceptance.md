---
phase: 3
title: "Manifest Registration + Acceptance Test + Grounding-Mode Tests"
status: pending
priority: P2
effort: "2h"
dependencies: ["phase-2"]
---

# Phase 3: Manifest Registration + Acceptance + Grounding-Mode + Cook Journal

## Overview

This phase registers the new tool in the manifests, runs 2 acceptance tests on real findings (one with known drift, one stable), runs 2 grounding-mode tests that prove the SP1+SP2 join works, extends the `loop-describe.test.js` discoverability test, and writes the cook journal. 4 acceptance + 2 grounding-mode + 1 discoverability = 7 new tests in this phase.

## Requirements

- **Functional:**
  - Add 1 line to `tools/manifest.json` (appended at end of meta-state-* group, after `meta-state-refresh-fingerprint-tool.js`)
  - Add 1 entry to `agent-manifest.json` `meta_state` group
  - Run 2 acceptance tests on real findings from `meta-state.jsonl`
  - Run 2 grounding-mode tests that prove the join works with `run_grounding: true`
  - Extend `__tests__/loop-describe.test.js` with 1 test asserting `meta_state_query_drift` is in the warm response
  - Write the cook journal at `docs/journals/260605-sp3-cook.md`
- **Non-functional:**
  - Manifest insertion order preserved (chronological: SP0 → SP1 → SP2 → SP3)
  - Acceptance tests use real findings (no mocked registry)
  - Grounding-mode tests use temp files (mutated between calls) to prove the hash-mismatch detection
  - Cook journal mirrors the SP0/SP1/SP2 cook pattern

## Architecture

This phase is operational + verification, not new architecture. The new tool is already implemented in Phase 2; this phase wires it into the manifest surface and validates end-to-end.

**Manifest changes:**

```diff
# tools/manifest.json (1 line added at end of meta-state-* group)
 { "file": "./tools/meta-state-derive-status-tool.js", "export": "metaStateDeriveStatusTool" },
+{ "file": "./tools/meta-state-query-drift-tool.js", "export": "metaStateQueryDriftTool" },
 { "file": "./tools/meta-state-check-grounding-tool.js", "export": "metaStateCheckGroundingTool" },
```

```diff
# agent-manifest.json (1 entry added to meta_state group)
   "meta_state": {
     "description": "Meta-state registry for loop self-awareness findings",
     "tools": [
       "meta_state_report",
       "meta_state_list",
       "meta_state_ack",
       "meta_state_resolve",
       "meta_state_promote_rule",
       "meta_state_sweep",
       "meta_state_log_change",
       "meta_state_derive_status",
       "meta_state_check_grounding",
       "meta_state_refresh_fingerprint",
+      "meta_state_query_drift"
     ],
     "ordering": "any"
   }
```

## Related Code Files

### Create
- `tools/learning-loop-mcp/__tests__/acceptance/sp3-drift.test.js` (NEW, ~150 LOC, 4 tests: 2 acceptance + 2 grounding-mode)
- `docs/journals/260605-sp3-cook.md` (NEW, cook journal mirroring the SP2 cook pattern)

### Modify
- `tools/learning-loop-mcp/tools/manifest.json` (+1 line at end of meta-state-* group)
- `tools/learning-loop-mcp/agent-manifest.json` (+1 entry in `meta_state` group)
- `tools/learning-loop-mcp/__tests__/loop-describe.test.js` (+1 test asserting `meta_state_query_drift` is in the warm response)

### Read
- `meta-state.jsonl` (real findings for acceptance tests)
- `tools/learning-loop-mcp/tools/manifest.json` (verify insertion order)
- `tools/learning-loop-mcp/agent-manifest.json` (verify entry position)
- `docs/journals/260602-sp2-check-grounding-cook.md` (cook journal pattern reference)
- `docs/journals/260603-sp2-discoverability-and-manifest-backfill.md` (cook journal pattern reference)
- `tools/learning-loop-mcp/__tests__/loop-describe.test.js` (existing test structure)

### Delete
- None

## Implementation Steps

1. **Add 1 line to `tools/manifest.json`** (preserve chronological insertion order):
   - Position: end of meta-state-* group, after `meta-state-refresh-fingerprint-tool.js` (the last SP2 entry)
   - Format: `{ "file": "./tools/meta-state-query-drift-tool.js", "export": "metaStateQueryDriftTool" }`
2. **Add 1 entry to `agent-manifest.json`** `meta_state` group:
   - Position: end of `meta_state.tools` array, after `meta_state_refresh_fingerprint`
   - Format: `"meta_state_query_drift"`
3. **Validate the JSON**:
   - `node -e "JSON.parse(require('fs').readFileSync('tools/learning-loop-mcp/agent-manifest.json'))"`
   - `node -e "JSON.parse(require('fs').readFileSync('tools/learning-loop-mcp/tools/manifest.json'))"`
4. **Extend `__tests__/loop-describe.test.js`** with 1 test:
   - Use the existing `mkdtempSync` + `process.env.GATE_ROOT` pattern
   - Assert `text.tools.map((t) => t.name).includes("meta_state_query_drift")`
   - Mirror the SP2 test at `__tests__/loop-describe.test.js` for `check_grounding` and `refresh_fingerprint`
5. **Write `__tests__/acceptance/sp3-drift.test.js`** with 4 tests:
   - **AT-1 (acceptance, real finding):** use a finding with `evidence_code_ref: "tools/learning-loop-mcp/lib/source-ref-validator.js"` (the one SP1's acceptance test uses). The file exists; SP1's `deriveStatus` returns `resolved-by-mechanism` (per the SP1 acceptance test). Verify SP3 returns a drift event with `recommendation: "resolve"`.
   - **AT-2 (acceptance, real finding, stable):** use a finding with `evidence_code_ref: "tools/learning-loop-mcp/core/derive-status.js"` (the SP1 sibling file). The file exists; SP1's `deriveStatus` returns `active-no-signal` (the mechanism is the SP1 tool itself, not the file referenced). Verify SP3 returns NO drift event for this finding.
   - **GM-1 (grounding-mode, real `mechanism_check: true` finding, stable):** use a finding with `mechanism_check: true` AND `evidence_code_ref: <temp_file>` where the temp file's hash matches. With `run_grounding: true`, SP2 returns `grounded`. SP1 says `active-no-signal`. Per case 4, no drift. Verify SP3 returns NO drift event.
   - **GM-2 (grounding-mode, real `mechanism_check: true` finding, drifted):** use a finding with `mechanism_check: true` AND `evidence_code_ref: <temp_file>` where the temp file is mutated between calls. With `run_grounding: true`, SP2 returns `drifted` (hash mismatch). SP1 says `active-no-signal`. Per case 3, drift with `recommendation: "investigate"`. Verify SP3 returns a drift event.
6. **Run `pnpm test`**: confirm 557 + 24 + 24 + 4 + 1 = 610 pass, 0 fail.
7. **Run `pnpm validate:records`** and `pnpm validate:plan-loop`: confirm no regressions.
8. **Write the cook journal** at `docs/journals/260605-sp3-cook.md`:
   - Mirror the SP2 cook journal structure (header, steps, deviations, success metrics, references)
   - Document the 4-phase progression
   - Document the 4 join cases + the 2 grounding-mode tests
   - Document the 53-test budget (1 more than the 52 in the brainstorm report, due to the `loop-describe.test.js` extension)
   - Document the G8 6th recurrence from Phase 0
   - Cross-reference the Phase 0/1/2/3 phase files

## Test Plan

| # | Test | What it covers |
|---|---|---|
| AT-1 | Acceptance: real SP1-resolved finding → drift event with `recommendation: "resolve"` | Real registry, real derivation, end-to-end |
| AT-2 | Acceptance: real stable finding → NO drift event | Real registry, real derivation, end-to-end |
| GM-1 | Grounding-mode: real `mechanism_check: true` finding with stable hash → NO drift (case 4) | Real registry, real grounding, end-to-end |
| GM-2 | Grounding-mode: real `mechanism_check: true` finding with mutated hash → drift with `recommendation: "investigate"` (case 3) | Real registry, real grounding, end-to-end (proves the join) |
| LD-1 | Discoverability: `loop_describe({ tier: "warm" })` includes `meta_state_query_drift` in the tools list | Mirrors SP2 discoverability test |

## Success Criteria

- [x] `tools/manifest.json` has the new line; insertion order is correct
- [x] `agent-manifest.json` `meta_state` group has the new entry; insertion order is correct
- [x] Both JSON files validate as valid JSON
- [x] 2 acceptance tests pass on real findings (AT-1, AT-2)
- [x] 2 grounding-mode tests pass (GM-1, GM-2)
- [x] 1 discoverability test passes (LD-1)
- [x] `pnpm test` shows 557 + 24 + 24 + 4 + 1 = 610 pass, 0 fail
- [x] `pnpm validate:records` passes
- [x] `pnpm validate:plan-loop` passes (76 plans check)
- [x] Cook journal written at `docs/journals/260605-sp3-cook.md`, mirrors the SP2 cook pattern
- [x] All 4 join cases are exercised in the test suite (cases 1, 2, 3, 4)
- [x] No regressions in the 605-test baseline (from Phase 2)

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| The acceptance test's real finding (AT-1) may have changed since the SP1 acceptance test (the file may have been mutated) | Low | The SP1 acceptance test's finding is `meta-260601T1339Z-the-learning-loop-...` with `evidence_code_ref: "tools/learning-loop-mcp/lib/source-ref-validator.js"`. The file has been stable since SP1. If the file has changed, AT-1 may return a different result; the test should assert the actual result and surface the change. |
| The grounding-mode tests (GM-1, GM-2) need `mechanism_check: true` findings with mutable files | Medium | Use the same temp-file pattern as SP2's acceptance tests. Create a temp dir, write a temp file, set the entry's `evidence_code_ref` to the temp file path. Mutate the file between GM-1 and GM-2 calls. |
| The `loop-describe.test.js` extension may break the existing 16 tests if the file is restructured | Low | Add the new test inside the existing `describe("loop_describe new behavior")` block, mirroring the SP2 test (lines 110-130 of the existing file). The new test is appended, not restructured. |
| The cook journal may diverge from the SP2 pattern | Low | Use the SP2 cook journal as the template; follow the same structure (header, steps, deviations, success metrics, references). |
| The manifest insertion order may be wrong | Low | Verify the order is SP0 → SP1 → SP2 → SP3 (chronological). The new entry is at the end of each group. |
