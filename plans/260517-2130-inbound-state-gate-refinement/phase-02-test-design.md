---
phase: 2
title: "Test Design"
status: complete
priority: P1
effort: "30m"
dependencies: [1]
---

# Phase 2: Test Design

## Overview

Design a comprehensive test suite for the inbound state gate. TDD approach: define test cases before refining implementation.

## Test Categories

### 1. State-Change Detection (Unit)

| Test | Input | Expected |
|------|-------|----------|
| Device clearance | "I cleared the device" | detect=true |
| Container state | "the container is running" | detect=true |
| Action report | "I installed vnstock" | detect=true |
| State assertion | "the slot is free" | detect=true |
| Normal message | "what should we do next?" | detect=false |
| Short message | "ok" | detect=false (length < 10) |
| Empty message | "" | detect=false |
| Question about state | "is the device cleared?" | detect=false (F11: question filter — ends with `?`) |
| Negated state | "I didn't clear the device" | detect=true (still relevant) |
| Question ending with ? (F11) | "is the test suite done?" | detect=false (question filter) |
| Broad pattern match (F11) | "the build is broken" | detect=true (acceptable — document in Phase 5) |

**Note (F9):** No blocking test cases — inbound gate is soft-only (exit 0 + additionalContext).

### 2. Observation Staleness (Unit)

**Critical (F2):** Two different staleness algorithms exist:
- **Inbound gate:** `(now - updated_at) > 30 minutes` (time-based threshold)
- **Outbound gate:** `marker.timestamp > observation.updated_at` (event-based, no threshold)

Tests must cover BOTH algorithms separately.

| Test | Observation updated_at | Marker timestamp | Inbound stale (30min) | Outbound stale (marker>obs) |
|------|----------------------|------------------|----------------------|---------------------------|
| Fresh observation | now - 5min | now - 1min | false | true |
| Stale observation | now - 2hr | now - 1min | true | true |
| No updated_at | missing | now | true | true |
| No marker | now | missing | false (no marker) | false (no marker) |
| Invalid timestamp | "not-a-date" | now | true | true |
| **Divergence case (F2)** | **now - 10min** | **now** | **false** (< 30min) | **true** (marker newer) |
| **Stale marker (F8)** | **now - 3hr** | **now - 24hr** | **true** | **false** (marker older) |

### 3. Context Injection (Integration)

| Test | Scenario | Expected output |
|------|----------|-----------------|
| State-change + stale obs | Operator says "cleared device", obs > 30min old | JSON with additionalContext |
| State-change + fresh obs | Operator says "cleared device", obs < 30min old | No output (exit 0) |
| No state-change | Normal message | No output (exit 0) |
| State-change + no obs | Operator says "cleared device", no observations | No output (exit 0) |

### 4. Marker File Flow (Integration)

**Critical (F1):** The current code writes the marker BEFORE checking staleness. Tests must verify this behavior explicitly and decide whether to fix it.

| Test | Scenario | Expected |
|------|----------|----------|
| Marker written on stale obs (F1) | State-change + obs > 30min old | .last-operator-message exists with timestamp |
| Marker written on fresh obs (F1) | State-change + obs < 30min old | .last-operator-message exists (current behavior — phantom escalation risk) |
| Marker not written | Normal message | .last-operator-message unchanged |
| Marker content | "I cleared the device" | prompt_snippet contains "cleared" |
| **Marker TTL (F8)** | Marker > 24hr old | Outbound gate should NOT escalate (requires TTL implementation) |

### 5. Outbound Gate Integration (Integration)

| Test | Scenario | Expected |
|------|----------|----------|
| Stale obs + constrained cmd | Marker newer than obs, run `sudo` | escalate with inbound_gate: true |
| Fresh obs + constrained cmd | Marker older than obs, run `sudo` | ok or block (not stale) |
| No marker + constrained cmd | No marker file, run `sudo` | ok (not stale) |
| **Phantom escalation (F1)** | **Fresh obs + state-change msg + constrained cmd** | **escalate with inbound_gate: true (current behavior — document as known issue)** |
| **Divergence case (F2)** | **Obs 10min old + state-change + constrained cmd** | **Outbound escalates even though inbound didn't warn** |

### 6. False Positive Rate (Acceptance)

| Test | Message | Expected | Notes |
|------|---------|----------|-------|
| Casual conversation | "I think we should clear the board" | detect=true | Acceptable — document in Phase 5 |
| Code discussion | "the docker container needs to be running" | detect=true | Acceptable — document in Phase 5 |
| Pure question | "what is the device limit?" | detect=false | |
| Unrelated | "let's implement the auth system" | detect=false | |
| **Question with state (F11)** | **"is the device cleared?"** | **detect=false** | **Add question-detection filter: skip messages ending with `?`** |
| **Broad pattern (F11)** | **"the build is broken"** | **detect=true** | **Acceptable — document expected false positive rate** |

### 7. MCP Server Divergence (Integration) — NEW (F3)

| Test | Scenario | Expected |
|------|----------|----------|
| MCP: stale obs + ok decision | Gate returns "ok", obs stale | Escalate with inbound_gate: true |
| MCP: stale obs + budget exhausted (F3) | Gate returns "escalate" (budget), obs stale | Should also include inbound_gate: true (currently skipped) |
| MCP: fresh obs + constrained cmd | Gate returns "ok", obs fresh | No staleness escalation |

### 8. Test Isolation (Unit) — NEW (F6)

| Test | Scenario | Expected |
|------|----------|----------|
| GATE_MARKER_PATH override | Set env var to temp dir | Hook writes marker to temp dir, not project |
| Default marker path | No env var | Hook writes to `.claude/coordination/.last-operator-message` |
| Parallel test safety | Two tests with different GATE_MARKER_PATH | No interference between tests |

### 9. Observation Schema (Unit) — NEW (F14)

| Test | Scenario | Expected |
|------|----------|----------|
| Observation with id | YAML has `id: obs-1` | Staleness check finds observation by id |
| Observation without id | YAML has only `constraint: sudo-req` | Staleness check finds observation by constraint fallback |
| Observation with neither | YAML has neither id nor constraint | Staleness check uses 'unknown' fallback |

## Implementation Steps

1. Create test file `.claude/coordination/__tests__/inbound-state-gate.test.cjs`
2. Define test helper: `runHook(prompt, envOverrides) → { exitCode, stdout, stderr }` (F6: accept env overrides for GATE_MARKER_PATH)
3. Define test helper: `runOutboundGate(command, envOverrides) → { exitCode, stdout }`
4. Define test helper: `writeMarker(timestamp)`, `clearMarker()`
5. Define test helper: `setObservationTime(obsIdOrConstraint, timestamp)` (F14: support lookup by both id and constraint)
6. Write all test cases as functions with assert + pass/fail logging
7. Follow existing test pattern from `bash-coordination-gate.test.cjs`
8. Use `node .claude/coordination/__tests__/inbound-state-gate.test.cjs` as test runner (F5: no jest)
9. Tests must spawn hook via `child_process.spawnSync` (not import functions directly) to match production module resolution (F15)

## Success Criteria

- [ ] Test file created with all test categories (1-9)
- [ ] Test helpers for hook execution, marker manipulation, observation time setting
- [ ] All test cases defined with clear expected values
- [ ] Tests runnable via `node .claude/coordination/__tests__/inbound-state-gate.test.cjs` (F5: no jest)
- [ ] Test helpers support `GATE_MARKER_PATH` env var override (F6)
- [ ] Test helpers support observation lookup by both `id` and `constraint` (F14)
- [ ] Staleness tests cover BOTH inbound (30min threshold) and outbound (marker>obs) algorithms (F2)
- [ ] Phantom escalation test case included (F1)
- [ ] MCP server divergence test case included (F3)
- [ ] Question-detection filter test case included (F11)
