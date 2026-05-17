---
title: 'Gate v2: Fix F1/F2/F3/F8 Staleness Issues'
description: >-
  Fix 4 known issues in the constraint gate's staleness handling: phantom
  escalation (F1), algorithm divergence (F2), MCP skip on budget (F3), marker
  never expires (F8).
status: completed
priority: P1
branch: main
tags:
  - constraint-gate
  - staleness
  - enforcement
  - gate-v2
blockedBy:
  - 260517-2130-inbound-state-gate-refinement
blocks:
  - 260517-1400-post-validation-gap-closure
created: '2026-05-17T15:45:41.803Z'
createdBy: 'ck:plan'
source: skill
---

# Gate v2: Fix F1/F2/F3/F8 Staleness Issues

## Overview

Fix 4 known issues in the constraint gate's staleness handling. These issues were discovered during the inbound-state-gate refinement (plan `260517-2130`) but intentionally deferred. They create a cry-wolf effect: phantom escalations train operators to ignore real ones, and permanent markers cause perpetual escalation after any state-change message.

**Root cause:** The staleness system has two algorithms (30-min wall-clock in inbound, marker-timestamp in outbound) that were never unified, and the marker file has no TTL. Fixing these requires changes across 3 files and ~15 new tests.

## Phases

| Phase | Name | Status | Priority | Effort | Dependencies |
|-------|------|--------|----------|--------|--------------|
| 1 | [Marker TTL (F8)](./phase-01-marker-ttl-f8.md) | Complete | P1 | 30m | — |
| 2 | [Inbound Gate Reorder (F1)](./phase-02-inbound-gate-reorder-f1.md) | Complete | P1 | 45m | 1 |
| 3 | [MCP Staleness Fix (F3)](./phase-03-mcp-staleness-fix-f3.md) | Complete | P2 | 30m | 1 |
| 4 | [Integration Tests](./phase-04-integration-tests.md) | Complete | P1 | 1h | 1, 2, 3 |
| 5 | [Documentation](./phase-05-documentation.md) | Complete | P2 | 20m | 1, 2, 3, 4 |

## Key Constraint

This plan modifies enforcement-critical code. Every change MUST have tests written FIRST (TDD). The existing test suite (131 tests) must continue passing. No regressions.

## F2 Resolution Note

F2 (staleness algorithm divergence) is resolved as a side effect of fixing F1. Once the inbound gate only writes markers when observations are actually stale (by the 30-min wall-clock check), the outbound gate's marker-timestamp comparison (`markerTime > obsTime`) will naturally agree: a marker exists only when observations are old, so the outbound check triggers only when it should. No separate F2 fix is needed.

## Related Code Files

- Modify: `.claude/coordination/hooks/lib/gate-utils.cjs` (add TTL to `readLastOperatorMessage`)
- Modify: `tools/constraint-gate/server.js` (add TTL to `readLastOperatorMessage`, fix staleness check scope)
- Modify: `.claude/coordination/hooks/inbound-state-gate.cjs` (reorder marker write after staleness check)
- Modify: `tools/constraint-gate/gate-logic.test.js` (new staleness tests)
- Create: `.claude/coordination/__tests__/gate-utils.test.cjs` (TTL tests if not existing)
- Modify: `docs/system-architecture.md` (update known issues section)
