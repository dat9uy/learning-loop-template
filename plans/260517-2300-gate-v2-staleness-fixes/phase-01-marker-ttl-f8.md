---
phase: 1
title: Marker TTL (F8)
status: in-progress
priority: P1
effort: 30m
dependencies: []
---

# Phase 1: Marker TTL (F8)

## Overview

Add TTL (time-to-live) to the marker file reading logic. Markers older than 30 minutes are treated as if they don't exist. This prevents perpetual escalation after state-change messages.

## Problem

The `.last-operator-message` marker file is written with a timestamp but never checked for age. A marker from hours or days ago causes the outbound gates to perpetually escalate, creating a cry-wolf effect where operators learn to ignore escalation messages.

## Architecture

**Current flow:**
```
inbound gate writes marker → outbound gate reads marker → compares markerTime > obsTime → escalates
```
Problem: marker persists forever, so escalation persists forever.

**Fixed flow:**
```
inbound gate writes marker → outbound gate reads marker → checks marker age → if >30min, treat as null → no escalation
```

**TTL value:** 30 minutes (matches the inbound gate's `STALENESS_THRESHOLD_MS`). This creates a consistent window: if the operator sent a state-change message more than 30 minutes ago, the system treats it as if it never happened.

## Related Code Files

- Modify: `.claude/coordination/hooks/lib/gate-utils.cjs` (lines 121-128, `readLastOperatorMessage`)
- Modify: `tools/constraint-gate/server.js` (lines 35-42, `readLastOperatorMessage`)
- Test: `.claude/coordination/__tests__/gate-utils.test.cjs` (TTL test cases)
- Test: `tools/constraint-gate/gate-logic.test.js` (TTL integration with check_gate)

## Implementation Steps

### TDD: Write tests first

1. Add test to `gate-utils.test.cjs`: marker within TTL returns marker object
2. Add test: marker older than TTL returns null
3. Add test: marker with invalid timestamp returns null
4. Add test: no marker file returns null
5. Add test to `gate-logic.test.js`: check_gate with fresh marker triggers escalation
6. Add test: check_gate with expired marker does NOT trigger escalation

### Implementation

7. Modify `readLastOperatorMessage` in `gate-utils.cjs`:
   - After parsing the JSON, check `marker.timestamp` age
   - If `(Date.now() - markerTime) > MARKER_TTL_MS`, return `null`
   - Add `MARKER_TTL_MS = 30 * 60 * 1000` constant (matching inbound gate's threshold)
8. Apply same TTL check to `readLastOperatorMessage` in `server.js`
9. Run existing tests to verify no regressions

### Verification

10. Run full test suite: `node --test tools/constraint-gate/gate-logic.test.js`
11. Run hook tests: `node --test .claude/coordination/__tests__/gate-utils.test.cjs`

## Success Criteria

- [ ] `readLastOperatorMessage` returns null for markers older than 30 minutes
- [ ] Fresh markers (within TTL) still returned normally
- [ ] All existing tests pass (no regressions)
- [ ] New TTL tests written and passing (4+ test cases)
- [ ] Both `gate-utils.cjs` and `server.js` implementations are consistent

## Risk Assessment

- **Risk:** TTL too short → operator state-change messages expire before agent acts. **Mitigation:** 30 min matches existing staleness threshold. Can be tuned via constant.
- **Risk:** TTL too long → stale markers still cause phantom escalations. **Mitigation:** 30 min is aggressive enough to prevent permanent escalation.
- **Risk:** Clock skew between marker write and read. **Mitigation:** Both happen in same process/session, so clock is identical.
