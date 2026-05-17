---
phase: 3
title: "Implement Tests"
status: complete
priority: P1
effort: "1h"
dependencies: [2]
---

# Phase 3: Implement Tests

## Overview

Implement the test suite designed in Phase 2. Run tests, fix any failures in the hook implementation, iterate until all tests pass.

## Implementation Steps

1. **Prerequisite — Add GATE_MARKER_PATH env var override (F6):**
   - Add env var support to `inbound-state-gate.cjs:122` for marker path
   - Add env var support to `bash-coordination-gate.cjs` for coord dir
   - Pattern: `const markerPath = process.env.GATE_MARKER_PATH || path.join(root, '.claude', 'coordination', '.last-operator-message')`

2. **Prerequisite — Consolidate staleness logic (F3):**
   - Extract `readLastOperatorMessage` and `checkObservationStaleness` from `gate-utils.cjs` into a shared module
   - For ESM (server.js): create `tools/constraint-gate/staleness.mjs` or use `createRequire` to import from gate-utils
   - For CJS (hooks): import from `gate-utils.cjs`
   - Ensure all three code paths use the same algorithm (decide: time-based threshold OR marker-based comparison)

3. Write test file per Phase 2 design
4. Run tests — expect some failures (TDD red phase)
5. Fix hook implementation based on test failures
6. Re-run tests — iterate until green
7. Add edge cases discovered during implementation
8. Verify all existing tests still pass (bash-coordination-gate, gate-utils, write-coordination-gate)
9. **Tests must spawn hook via `child_process.spawnSync` (F15)** — do NOT import hook functions directly. This ensures `require('yaml')` module resolution matches production (Node.js resolves from script location, not test location).

## Test File Location

`.claude/coordination/__tests__/inbound-state-gate.test.cjs`

## Success Criteria

- [ ] All state-change detection tests pass
- [ ] All observation staleness tests pass
- [ ] All context injection tests pass
- [ ] All marker file flow tests pass
- [ ] All outbound gate integration tests pass
- [ ] False positive rate is acceptable (document any surprising matches)
- [ ] Existing tests still pass (no regressions)
- [ ] Test execution under 500ms

## Risk Assessment

- **Risk:** Hook may need stdin piping which is hard to test
  - **Mitigation:** Use child_process.spawnSync with stdin pipe (F15: matches production invocation pattern)
- **Risk:** Marker file tests may have race conditions
  - **Mitigation:** Use GATE_MARKER_PATH env var to isolate each test (F6), clean up after each test
- **Risk:** Staleness logic consolidation (F3) may break existing tests
  - **Mitigation:** Run existing test suite after each change, fix regressions before proceeding
- **Risk:** ESM/CJS module boundary for shared staleness logic
  - **Mitigation:** Use `createRequire` in ESM module to import CJS gate-utils, or create separate ESM module
