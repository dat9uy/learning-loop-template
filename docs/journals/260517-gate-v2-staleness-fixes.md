# Gate v2 Staleness Fixes — Closeout Journal

**Date:** 2026-05-17
**Plan:** `260517-2300-gate-v2-staleness-fixes`
**Issues fixed:** F1 (phantom escalation), F2 (algorithm divergence), F3 (MCP staleness scope), F8 (marker TTL)

## What Was Fixed

### F1: Phantom Escalation
**Root cause:** The inbound gate wrote the `.last-operator-message` marker **unconditionally** before checking if observations were stale. Fresh observations got a marker anyway, causing the outbound gate to escalate on the next constrained command.

**Fix:** Reordered `inbound-state-gate.cjs` to read observations, check staleness, and only write the marker when `stale.length > 0`.

**Files changed:**
- `.claude/coordination/hooks/inbound-state-gate.cjs` — moved `writeOperatorMessageMarker` after staleness check

### F2: Staleness Algorithm Divergence
**Root cause:** The inbound gate used a 30-minute wall-clock threshold. The outbound gates compared marker timestamp vs observation timestamp. These could disagree (e.g., 10-minute-old observation + new marker = inbound says fresh, outbound says stale).

**Fix:** Resolved as side effect of F1. Since markers are now only written when observations are stale by the 30-minute threshold, a marker exists only when observations are genuinely old. The outbound gate's `markerTime > obsTime` comparison then naturally agrees.

**No separate code change required.**

### F3: MCP Server Staleness Check Only on `ok`
**Root cause:** The MCP server (`server.js`) guarded `checkObservationStaleness` with `decision.decision === "ok"`. If budget was exhausted (decision already `escalate`), the staleness check was skipped and `inbound_gate: true` was missing from the response.

**Fix:** Removed the `decision === "ok"` guard. Staleness check now runs for all constraint-matched commands. `inbound_gate: true` is added regardless of existing decision. Only upgrades `ok` to `escalate`; preserves existing escalation reasons.

**Files changed:**
- `tools/constraint-gate/server.js` — restructured staleness check block

### F8: Marker Never Expires
**Root cause:** `readLastOperatorMessage` returned the marker object regardless of age. A state-change message from hours or days ago caused perpetual escalation.

**Fix:** Added `MARKER_TTL_MS = 30 * 60 * 1000` to both `gate-utils.cjs` and `server.js`. Markers older than 30 minutes are treated as `null`.

**Files changed:**
- `.claude/coordination/hooks/lib/gate-utils.cjs` — added TTL to `readLastOperatorMessage`
- `tools/constraint-gate/server.js` — added TTL to `readLastOperatorMessage`

## Test Results

| Test Suite | Before | After | New Tests |
|------------|--------|-------|-----------|
| gate-utils.test.cjs | 2 | 7 | 5 TTL tests |
| inbound-state-gate.test.cjs | 52 | 53 | 1 F1 fix test + updated Category 1/6/8/7 |
| gate-logic.test.js | 46 | 46 | 0 (no change) |
| bash-coordination-gate.test.cjs | 12 | 12 | 0 (no change) |
| server.test.js | 7 | 11 | 4 (2 TTL + 2 F3) |
| gate-integration.test.cjs | 0 | 13 | 13 (new suite) |
| **Total** | **119** | **142** | **+23** |

All 142 tests pass. No regressions.

## Unified Staleness Model

The gate now uses a consistent 30-minute window across both inbound and outbound paths:

- **Inbound gate:** Writes marker only when observations are older than 30 minutes (wall-clock)
- **Outbound gates:** Compares marker timestamp vs observation timestamp, but marker is null if older than 30 minutes (TTL)
- **MCP server:** Same TTL + staleness check runs regardless of decision

This eliminates the cry-wolf effect where phantom escalations trained operators to ignore real ones.

## Open Issues (Unchanged)

- F4: Data leak risk (marker stores prompt snippet)
- F11: False positive rate (broad state-change patterns)
- F12: Race condition (non-atomic marker writes)
- Multi-session isolation (no session ID in marker)
