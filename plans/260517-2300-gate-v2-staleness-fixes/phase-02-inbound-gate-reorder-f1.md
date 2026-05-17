---
phase: 2
title: "Inbound Gate Reorder (F1)"
status: completed
priority: P1
effort: "45m"
dependencies: [1]
---

# Phase 2: Inbound Gate Reorder (F1)

## Overview

Reorder the inbound gate to write the operator message marker ONLY after confirming observations are stale. This eliminates phantom escalation where fresh observations get a stale marker.

## Problem

Current order in `inbound-state-gate.cjs` (lines 176-193):
```
1. Write marker                    ← unconditional, always writes
2. Read observations
3. Check staleness
4. Inject context if stale
```

If observations are fresh or don't exist, the marker is still written. The outbound gates then see a marker newer than observations and escalate unnecessarily.

## Architecture

**Fixed order:**
```
1. Read observations
2. Check staleness (30-min wall-clock)
3. If stale: write marker + inject context
4. If not stale: exit cleanly, no marker written
```

This ensures markers only exist when observations are genuinely stale. The outbound gate's marker-timestamp comparison (`markerTime > obsTime`) then naturally agrees: a marker exists only when observations are old, resolving F2 (algorithm divergence) without a separate fix.

## Related Code Files

- Modify: `.claude/coordination/hooks/inbound-state-gate.cjs` (lines 176-193, main flow)
- Test: `.claude/coordination/__tests__/inbound-state-gate.test.cjs` (reorder test cases)

## Implementation Steps

### TDD: Write tests first

1. Add test: when observations are fresh (< 30 min old), marker is NOT written
2. Add test: when observations are stale (> 30 min old), marker IS written
3. Add test: when no observations exist, marker is NOT written
4. Add test: when observations are stale, context IS injected
5. Add test: when observations are fresh, no context injected

### Implementation

6. Restructure main flow in `inbound-state-gate.cjs`:
   - Move `writeOperatorMessageMarker(root, prompt)` from line 179 to after the staleness check
   - Only call it when `stale.length > 0`
   - Keep the marker write inside the stale branch: write marker → inject context → exit
7. Verify that the marker format (timestamp, prompt_snippet) remains unchanged
8. Run existing tests to verify no regressions

### Verification

9. Run inbound gate tests
10. Run outbound gate tests (verify they still work with the new marker behavior)
11. Manual test: send a state-change message with fresh observations → verify no marker written

## Success Criteria

- [ ] Marker is NOT written when observations are fresh
- [ ] Marker IS written when observations are stale (> 30 min)
- [ ] Marker is NOT written when no observations exist
- [ ] Context injection still works when observations are stale
- [ ] All existing tests pass (no regressions)
- [ ] New reorder tests written and passing (5+ test cases)

## Risk Assessment

- **Risk:** Moving marker write breaks the outbound gate's expectation that markers always exist. **Mitigation:** The outbound gate already handles null markers gracefully (returns `stale: false`). Phase 1 (TTL) ensures expired markers are treated as null.
- **Risk:** Race condition if outbound gate runs between staleness check and marker write. **Mitigation:** Single-threaded Node.js event loop; no concurrent execution possible.
- **Risk:** Marker format change breaks downstream consumers. **Mitigation:** Marker format (timestamp, prompt_snippet) is unchanged; only the write timing changes.
