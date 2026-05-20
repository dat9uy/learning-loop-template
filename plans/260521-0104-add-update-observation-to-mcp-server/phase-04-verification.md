---
phase: 4
title: "Verification"
status: completed
priority: P2
effort: "15m"
dependencies: [3]
---

# Phase 4: Verification

## Overview

End-to-end verification: confirm the `update_observation` capability works in a real gate scenario using a temporary observation. Never modify production security controls during testing.

## Requirements

- Functional: MCP `update_observation` successfully toggles observation status on a temporary test observation.
- Functional: Write gate respects the toggled status (blocks when inactive, allows when active).
- Non-functional: All `pnpm check` steps pass (capabilities, records validation, tests).

## Related Code Files

- Read for context: `.claude/coordination/hooks/write-coordination-gate.cjs`
- Read for context: `tools/constraint-gate/server.js`
- Read for context: `records/observations/observation-evidence-write-path.yaml`

## Implementation Steps

1. **Verify starting state:** Read `observation-evidence-write-path.yaml`. If `inactive`, re-activate it first via MCP to establish a known baseline.
2. **Use a temporary observation for e2e testing** (never modify production security controls):
   - Call `record_observation` to create a temporary write-path observation with `constraint: test-verification`
   - Verify the temp observation is `active`
3. Test write gate: attempt `Write` to `records/evidence/test-verify-temp.md` — expect allow.
4. Use MCP `update_observation` to set temp observation to `inactive`.
5. Test write gate again: attempt `Write` to same path — expect block.
6. Use MCP `update_observation` to re-activate temp observation.
7. Test write gate again: attempt `Write` to same path — expect allow.
8. **Clean up:** Delete temp observation file and test evidence file.
9. **Account for inbound gate:** Before step 3, check `.claude/coordination/.last-operator-message`. If marker is newer than observation `updated_at`, clear the marker or document that verification requires no pending operator messages.
10. Run `pnpm test` — all constraint-gate tests pass.
11. Run `pnpm validate:records` — modified observations still pass schema validation.
12. Run `pnpm check` — full validation suite passes.
13. Update decision record status to "implemented" if it has one.

## Success Criteria

- [x] MCP `update_observation` toggles status correctly.
- [x] Write gate blocks/allows based on observation status.
- [x] `pnpm test` passes (all constraint-gate tests).
- [x] `pnpm check` passes (no regressions in records, capabilities, or tool tests).

## Risk Assessment

- **Risk:** `pnpm check` may fail due to unrelated pre-existing issues (e.g., stale reference test). **Mitigation:** Note pre-existing failures in journal; do not treat them as blockers.
- **Risk:** Verification modifies production observation file in-place without rollback. **Mitigation:** Use temporary observation for e2e testing; never modify `observation-evidence-write-path`.
- **Risk:** Inbound gate marker causes non-deterministic escalation. **Mitigation:** Clear `.last-operator-message` before verification or document prerequisite.
