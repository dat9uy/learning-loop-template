---
phase: 4
title: "Integration Tests"
status: completed
priority: P1
effort: "1h"
dependencies: [1, 2, 3]
---

# Phase 4: Integration Tests

## Overview

Add integration tests that exercise the full gate pipeline (inbound → outbound → MCP) with real observation YAML files and marker files. These tests catch the class of bugs that unit tests with synthetic fixtures miss.

## Problem

The constraint gate gap closure (plan `260517-1800`) identified that unit tests with hand-crafted inputs missed schema mismatches. At least one integration test should load actual production data files to verify the gate recognizes them.

## Architecture

**Integration test structure:**
```
test setup:
  1. Create temp directory with real observation YAML files (copy from records/observations/)
  2. Create temp marker file with controlled timestamp
  3. Set GATE_ROOT and GATE_MARKER_PATH env vars

test scenarios:
  - Fresh marker + fresh observations → no escalation
  - Fresh marker + stale observations → escalation
  - Stale marker (TTL expired) + stale observations → no escalation
  - No marker + stale observations → no escalation (inbound gate hasn't fired)
  - Budget exhaustion + stale marker → escalate with inbound_gate: true
  - Budget exhaustion + fresh marker → escalate without inbound_gate: true
```

## Related Code Files

- Create: `.claude/coordination/__tests__/gate-integration.test.cjs` (integration test suite)
- Read: `records/observations/*.yaml` (real observation files for test fixtures)
- Read: `.claude/coordination/hooks/inbound-state-gate.cjs` (inbound gate for spawn tests)
- Read: `.claude/coordination/hooks/bash-coordination-gate.cjs` (outbound gate for spawn tests)
- Read: `tools/constraint-gate/server.js` (MCP server for check_gate tests)

## Implementation Steps

### TDD: Write tests first

1. Create test fixture setup: copy real observation YAML files to temp directory
2. Create test fixture setup: write marker file with controlled timestamp
3. Test: inbound gate with fresh observations → no marker written (verifies F1 fix)
4. Test: inbound gate with stale observations → marker written (verifies F1 fix)
5. Test: outbound gate with fresh marker + fresh observations → ok (no phantom escalation)
6. Test: outbound gate with stale marker + stale observations → escalate (real escalation)
7. Test: outbound gate with TTL-expired marker → ok (marker expired, F8 fix)
8. Test: MCP check_gate with budget exhaustion + stale marker → inbound_gate: true (F3 fix)
9. Test: MCP check_gate with budget exhaustion + fresh marker → no inbound_gate flag

### Implementation

10. Create `gate-integration.test.cjs` with `spawnSync`-based tests (per F15: exercise realistic module resolution)
11. Use `GATE_ROOT` and `GATE_MARKER_PATH` env vars for test isolation
12. Load real observation YAML files from `records/observations/` as fixtures

### Verification

13. Run integration test suite
14. Run all existing test suites to verify no regressions
15. Verify test count increased by 8+ new integration tests

## Success Criteria

- [ ] Integration tests load real observation YAML files
- [ ] Full pipeline tested: inbound gate → marker → outbound gate → MCP server
- [ ] F1 fix verified: marker only written when observations are stale
- [ ] F3 fix verified: inbound_gate flag on budget escalation
- [ ] F8 fix verified: TTL-expired markers treated as null
- [ ] All existing tests pass (no regressions)
- [ ] 8+ new integration tests passing

## Risk Assessment

- **Risk:** Real observation YAML files change between test runs. **Mitigation:** Copy files to temp directory; tests use copies, not originals.
- **Risk:** Integration tests are slow due to spawn isolation. **Mitigation:** Spawn is fast for CJS modules (<100ms per test). 8 tests ≈ 1 second total.
- **Risk:** Env var isolation leaks between tests. **Mitigation:** Each test sets its own GATE_ROOT/GATE_MARKER_PATH in spawn env. No shared state.
