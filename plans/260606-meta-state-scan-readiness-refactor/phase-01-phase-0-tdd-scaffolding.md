---
phase: 1
title: "Scaffolding: Cold-Tier Fixture + TDD Harness + Target Verification"
status: pending
priority: P2
effort: "0.5h"
dependencies: []
---

# Phase 1: Scaffolding

## Overview

Captures the pre-refactor cold-tier JSON as a regression baseline fixture, sets up the cold-tier regression test harness, and verifies the 6 target files exist before any code changes. No functional changes in this phase; pure scaffolding.

## Requirements

- **Functional**: a `loop_describe({ tier: 'cold' })` call returns JSON; that JSON is captured to a fixture file; a regression test compares current cold-tier output against the fixture.
- **Non-functional**: the fixture is ~109KB (the size of the current cold tier); the harness runs in <2 seconds; the harness diff is human-readable when it fails.

## Architecture

The harness sits between the test runner and `loop_describe`. It calls the tool, serializes the result, and diffs against the fixture. The fixture is committed to git; the test is part of `npm test`. Future phases update the fixture as the cold tier evolves.

```
test runner (npm test)
  → __tests__/cold-tier-regression.test.cjs
    → calls loop_describe_tool.handler({ tier: 'cold' })
    → serializes via JSON.stringify(result, null, 2)
    → diffs against __tests__/fixtures/cold-tier-pre-refactor.json
    → exits 0 on match, 1 on diff
```

## Related Code Files

- **Create**: `tools/learning-loop-mcp/__tests__/fixtures/cold-tier-pre-refactor.json` (the 109KB baseline)
- **Create**: `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.cjs` (the harness, ~40 lines)
- **Read** (no modify): all 6 target files (verify they exist):
  - `tools/learning-loop-mcp/core/meta-state.js`
  - `tools/learning-loop-mcp/core/loop-introspect.js`
  - `tools/learning-loop-mcp/tools/loop-describe-tool.js`
  - `tools/learning-loop-mcp/tools/meta-state-list-tool.js`
  - `tools/learning-loop-mcp/tools/meta-state-sweep-tool.js`
  - `tools/learning-loop-mcp/tools/manifest.json`

## Implementation Steps

### Red: write the failing harness (TDD step 1)

1. Create `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.cjs` with the diff logic. The fixture file does not exist yet → the test fails (red).
2. Run `cd tools/learning-loop-mcp && npm test -- cold-tier-regression` to confirm the test fails for the right reason ("fixture not found").

### Green: capture the fixture (TDD step 2)

3. Add a one-shot capture script at `tools/learning-loop-mcp/__tests__/capture-cold-tier.cjs` that:
   - Loads `loop-describe-tool.js` (or imports the handler directly).
   - Calls `handler({ tier: 'cold' })`.
   - Writes the result to `__tests__/fixtures/cold-tier-pre-refactor.json`.
4. Run the capture script. Verify the file is ~109KB and contains the 51 entries + 4 inverse map slots (empty for now).
5. Re-run the regression test → it should pass (green).

### Refactor + accept (TDD steps 3-4)

6. Add a helper `serialize(result)` that strips volatile fields (timestamps, run-specific ids) and produces a stable hash. Update the harness to use it. (Avoids spurious diffs on runs that include runtime data.)
7. Run `npm test` to confirm the harness passes alongside existing tests.
8. Verify the 6 target files exist via `ls -la` (no missing-file surprises later).

## Success Criteria

- [ ] `tools/learning-loop-mcp/__tests__/fixtures/cold-tier-pre-refactor.json` exists and is ~109KB
- [ ] `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.cjs` exists and passes
- [ ] `cd tools/learning-loop-mcp && npm test` runs the new test alongside existing tests with no failures
- [ ] All 6 target files exist (verified via `ls -la` of each path)
- [ ] The fixture is committed to git (a separate commit, so future diffs are easy to attribute)

## Risk Assessment

- **Risk**: the fixture contains runtime data (timestamps, ephemeral ids) that varies per run. → **Mitigation**: the `serialize()` helper strips volatile fields. If a field is missed, the diff will fail loudly and the field can be added to the strip list.
- **Risk**: the harness depends on a working `loop_describe` tool; if the tool is broken, the harness fails. → **Mitigation**: this is the desired behavior (the harness IS the smoke test). The fixture is the "known good" baseline.
- **Risk**: the fixture is too large to review in PRs (~109KB). → **Mitigation**: future phases update the fixture; PRs that touch the fixture show only the diff (the new fixture vs the old), not the full 109KB. The fixture file is `.gitignore`-able for human review but committed for test reproducibility.
