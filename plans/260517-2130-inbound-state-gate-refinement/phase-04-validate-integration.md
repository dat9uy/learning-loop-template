---
phase: 4
title: "Validate Integration"
status: complete
priority: P1
effort: "30m"
dependencies: [3]
---

# Phase 4: Validate Integration

## Overview

Validate the full end-to-end flow: operator message → inbound gate → marker file → outbound gate → escalation. Manual and automated validation.

## Validation Scenarios

### Scenario 1: Full Inbound → Outbound Flow (AUTOMATED — replaces manual test)

1. Clear marker file
2. Set observation `updated_at` to 2 hours ago
3. Simulate operator: "I cleared the device slot"
4. Verify: inbound gate injects context
5. Verify: marker file written
6. Simulate agent: `sudo docker rm test`
7. Verify: outbound gate escalates with `inbound_gate: true`

### Scenario 2: Fresh Observation — Phantom Escalation (F1)

1. Clear marker file
2. Set observation `updated_at` to 5 minutes ago (fresh by 30min threshold)
3. Simulate operator: "the container is running" (state-change detected)
4. Verify: inbound gate does NOT inject context (< 30min threshold)
5. Verify: marker file IS written (current behavior)
6. Simulate agent: `sudo apt install`
7. **Verify: outbound gate escalates with `inbound_gate: true`** (marker newer than observation — this is the phantom escalation from F1)
8. **Document:** This is a known behavior. Fix: move marker write after staleness check, or accept as intentional.

### Scenario 3: Staleness Algorithm Divergence (F2)

1. Clear marker file
2. Set observation `updated_at` to 10 minutes ago
3. Simulate operator: "I cleared the device" (state-change detected)
4. Verify: inbound gate does NOT inject context (< 30min threshold)
5. Verify: marker file IS written
6. Simulate agent: `sudo docker rm test`
7. **Verify: outbound gate escalates** (marker(now) > obs(10min ago) = stale by outbound algorithm)
8. **Document:** Inbound and outbound gates disagree. This is the divergence from F2.

### Scenario 4: Normal Conversation (No Interference)

1. Send normal message: "what should we do next?"
2. Verify: no context injection, no marker written
3. Run constrained command
4. Verify: outbound gate behavior unchanged

### Scenario 5: MCP Server Integration (F3)

1. Call `check_gate` MCP tool with constrained command after state-change
2. Verify: MCP server also escalates on stale observations
3. **Call `check_gate` with constrained command when budget exhausted AND observations stale (F3)**
4. **Verify: MCP server includes `inbound_gate: true` in escalation** (currently skipped when decision !== "ok")

### Scenario 6: Race Condition Documentation (F12)

1. Document that `fs.writeFileSync` is non-atomic
2. Document that partial reads during concurrent write → JSON parse fails → `readLastOperatorMessage` returns null → escalation silently skipped
3. Assess risk: acceptable for a soft gate, but should be noted

## Implementation Steps

1. Run automated integration tests from Phase 3
2. **Automate Scenario 1** (replaces manual test): write integration test that exercises inbound gate → marker → outbound gate → escalation
3. **Automate Scenario 2** (F1): test phantom escalation behavior with fresh observations
4. **Automate Scenario 3** (F2): test staleness algorithm divergence
5. Manual validation: send state-change message in actual Claude Code session
6. Verify MCP server integration by calling check_gate tool (Scenario 5)
7. Document race condition limitation (Scenario 6, F12)
8. Document any behavioral differences from expected

## Success Criteria

- [ ] Full inbound → outbound flow works end-to-end (Scenario 1 — automated)
- [ ] Phantom escalation behavior documented and tested (F1, Scenario 2)
- [ ] Staleness algorithm divergence documented and tested (F2, Scenario 3)
- [ ] Normal conversation is unaffected (Scenario 4)
- [ ] MCP server integration works (Scenario 5)
- [ ] MCP server handles budget+stale case correctly (F3, Scenario 5 step 3-4)
- [ ] Race condition documented as known limitation (F12, Scenario 6)
- [ ] No regressions in existing gate behavior
