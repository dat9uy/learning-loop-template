---
phase: 5
title: "Update tests"
status: completed
priority: P1
effort: "1.5h"
dependencies: [2, 3]
---

# Phase 5: Update tests

## Overview

Update only the tests that actually rely on the old observation model. Tests that assert `records/observations/` is blocked remain unchanged. Add tests proving the gate reads runtime-state.jsonl.

## Related Code Files

- Modify: `tools/learning-loop-mcp/__tests__/gate-logic-constraint.test.js` (or equivalent constraint test file)
- Modify: `tools/learning-loop-mcp/__tests__/ledger-conversion.test.js`
- Modify: `.claude/coordination/__tests__/bash-coordination-gate.test.cjs` only if it has observation-satisfaction tests
- Modify: `.claude/coordination/__tests__/write-coordination-gate-minimal.test.cjs` only if it has observation-unlock tests

## Implementation Steps

1. Identify tests that pass mock observation arrays to `checkObservationExists` / `makeGateDecision`:
   - These tests may continue to work unchanged because the gate decision logic itself is unchanged.
2. Identify tests that write fake YAML to `records/observations/`:
   - Redirect them to write temporary `runtime-state.jsonl` entries using a test helper.
   - Provide a helper that creates a valid runtime-state entry with all required fields (`kind`, `affected_system`, `id`, `source_ref`, `timestamp`, `status`, `fingerprint`, `metadata`).
3. Add a new test that:
   - Writes an active `ledger-event` for `vnstock` to a temp `runtime-state.jsonl`.
   - Asserts that `vendor-api` and `package-manager` commands return `ok`.
   - Asserts that `sudo` and `docker` commands still return `block`.
4. Keep tests that assert `records/observations/**` is blocked; do not modify them.
5. Remove or update tests that assert `records/evidence/**` can be unlocked by a `records-evidence` observation. The unlock is removed; these writes should now always be blocked.
6. Run targeted tests after each file change.

## Success Criteria

- [ ] No test writes fake data to `records/observations/`.
- [ ] New or updated tests prove constraints are satisfied by runtime-state entries.
- [ ] Existing block tests for `records/**` and `records/observations/**` still pass.
- [ ] Test count delta is documented in phase-6.
