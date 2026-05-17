---
phase: 3
title: "MCP Staleness Fix (F3)"
status: completed
priority: P2
effort: "30m"
dependencies: [1]
---

# Phase 3: MCP Staleness Fix (F3)

## Overview

Remove the `decision === "ok"` guard on the staleness check in `server.js`. The staleness check should run regardless of the gate decision, so that `inbound_gate: true` is included in escalation responses even when budget exhaustion is the primary cause.

## Problem

Current code in `server.js` (line 127):
```js
if (decision.decision === "ok" && constraintMatch) {
```

This means:
- Budget exhaustion → decision is "escalate" → staleness check skipped → `inbound_gate: true` missing
- No observation → decision is "block" → staleness check skipped
- Only when decision is "ok" does staleness get evaluated

The operator loses information: they see "budget exhausted" but don't know that observations are also stale relative to a recent state-change message.

## Architecture

**Fixed logic:**
```js
// Check staleness regardless of decision, but only when constraint matches
if (constraintMatch) {
  const staleness = checkObservationStaleness(observations, root);
  if (staleness.stale) {
    // Add inbound_gate flag to whatever decision was already made
    decision.inbound_gate = true;
    // If decision was "ok", upgrade to "escalate"
    if (decision.decision === "ok") {
      decision.decision = "escalate";
      decision.reason = staleness.reason;
      decision.observation_id = staleness.observation_id;
    }
    // If decision was already "escalate" (budget), just add the flag
    // If decision was "block", add the flag (operator should know observations are stale)
  }
}
```

This ensures:
- Budget escalation + stale observations → `escalate` with `inbound_gate: true` (both reasons visible)
- Budget escalation + fresh observations → `escalate` without `inbound_gate: true` (just budget)
- No constraint match → no staleness check (irrelevant)

## Related Code Files

- Modify: `tools/constraint-gate/server.js` (lines 125-135, staleness check block)
- Test: `tools/constraint-gate/gate-logic.test.js` (F3 test cases)

## Implementation Steps

### TDD: Write tests first

1. Add test: budget exhaustion + stale marker → decision has `inbound_gate: true`
2. Add test: budget exhaustion + fresh marker → decision does NOT have `inbound_gate: true`
3. Add test: no constraint match → no staleness check (no `inbound_gate` field)
4. Add test: "ok" decision + stale marker → upgraded to "escalate" with `inbound_gate: true` (existing behavior preserved)

### Implementation

5. Modify the staleness check block in `server.js`:
   - Remove `decision.decision === "ok"` from the condition
   - Keep `constraintMatch` guard (staleness is irrelevant if no constraint matched)
   - Add `inbound_gate: true` to the decision regardless of existing decision
   - Only upgrade to "escalate" if decision was "ok" (preserve existing escalation reason for budget/block)
6. Run existing tests to verify no regressions

### Verification

7. Run full test suite: `node --test tools/constraint-gate/gate-logic.test.js`
8. Manual test: call `check_gate` MCP tool with exhausted budget and stale marker → verify `inbound_gate: true` in response

## Success Criteria

- [ ] Budget exhaustion + stale marker includes `inbound_gate: true`
- [ ] Budget exhaustion + fresh marker does NOT include `inbound_gate: true`
- [ ] "ok" + stale marker still upgrades to "escalate" (existing behavior preserved)
- [ ] No constraint match → no staleness evaluation
- [ ] All existing tests pass (no regressions)
- [ ] New F3 tests written and passing (4+ test cases)

## Risk Assessment

- **Risk:** Adding `inbound_gate: true` to budget escalation confuses the decision vocabulary. **Mitigation:** The field is additive (informational), not changing the decision itself. The decision remains "escalate".
- **Risk:** Staleness check adds latency to every gate call. **Mitigation:** File read + timestamp comparison is negligible (~1ms). Already runs in the "ok" path.
