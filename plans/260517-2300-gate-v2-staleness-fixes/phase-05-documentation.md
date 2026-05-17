---
phase: 5
title: "Documentation"
status: pending
priority: P2
effort: "20m"
dependencies: [1, 2, 3, 4]
---

# Phase 5: Documentation

## Overview

Update system architecture docs and close the known issues (F1, F2, F3, F8) that are resolved by this plan.

## Related Code Files

- Modify: `docs/system-architecture.md` (known issues section)
- Modify: `docs/journals/` (closeout journal)

## Implementation Steps

1. Update `docs/system-architecture.md`:
   - Remove F1, F2, F3, F8 from known issues (now resolved)
   - Add marker TTL behavior to the inbound gate description
   - Document the unified staleness model: inbound uses 30-min wall-clock, outbound uses marker-timestamp, TTL bridges the gap
2. Write closeout journal: `docs/journals/260517-gate-v2-staleness-fixes.md`
   - What was fixed, root causes, test results
   - How F2 was resolved as side effect of F1

## Success Criteria

- [ ] Known issues F1, F2, F3, F8 marked as resolved in system-architecture.md
- [ ] Closeout journal written
- [ ] No stale references to unfixed F-issues in docs
