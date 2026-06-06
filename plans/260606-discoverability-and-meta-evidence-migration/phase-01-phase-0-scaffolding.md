---
phase: 1
title: "Phase 0 Scaffolding"
status: pending
priority: P3
effort: "0.25h"
dependencies: []
---

# Phase 1: Phase 0 Scaffolding

## Overview

Scaffold the plan and mark it in_progress. The G8 subcommand-class bug was fully fixed earlier today (per `meta-260606T0225Z-...` P1 fix + the splitSegments quote-aware fix in the subsequent change-log) BEFORE this plan was scaffolded, so no G8 recurrence observation is needed. This phase is purely administrative.

## Requirements
- Functional: the plan must be visible to `ck plan status` and to any agent querying the active plan.
- Non-functional: meta-state.jsonl must be unchanged in this phase (no new finding + no new change-log).

## Architecture
None. This phase is purely administrative.

## Related Code Files
- Modify: `260606-discoverability-and-meta-evidence-migration/plan.md` (no mutation; frontmatter `status: pending` stays until Phase 5 closeout marks `status: completed`)

## Implementation Steps

1. **Verify G8 did not recur during this plan's scaffolding.**
   - The `ck plan create` invocation that scaffolded this plan (2026-06-06T05:15Z) did NOT trigger the G8 subcommand-class false positive.
   - The P1 G8 fix (meta-260606T0225Z) + the splitSegments quote-aware fix (the change-log entry between meta-260606T0301Z and the present) shipped earlier in the same session, before this plan's scaffolding.
   - No meta-state entry is required for the 7 prior recurrences (already captured in meta-260606T0023Z, meta-260605T1210Z, and the consolidated meta-260606T0028Z).
2. **Mark plan status as in_progress.**
   - Run: `cd /home/datguy/codingProjects/learning-loop-template/260606-discoverability-and-meta-evidence-migration && ck plan check 1 --start`
   - This sets phase 0 to in_progress in the plan's metadata. Operators see "Scaffolding in progress" in `ck plan status`.
3. **Verify ck plan status reflects the new plan.**
   - Run: `ck plan status /home/datguy/codingProjects/learning-loop-template/260606-discoverability-and-meta-evidence-migration/plan.md`
   - Expected output: 5 phases, all pending except phase 0 in_progress.

## Success Criteria

- [ ] meta-state.jsonl is unchanged in this phase (no new entries)
- [ ] `ck plan check 1 --start` succeeds (phase 0 = in_progress)
- [ ] `ck plan status` shows 5 phases for this plan
- [ ] No code or test files modified in this phase

## Risk Assessment

- **Risk 1:** A future regression of the G8 fix could re-open the bug. Mitigation: the splitSegments fix's change-log entry already records the fix paths (regex qualifier + quote-aware state machine) for future regression analysis. This plan does not re-test the G8 fix; Phase 3's cold-session test exercises the broader discoverability surface and would catch a G8 regression indirectly (the agent's `meta_state_report` call would be blocked).
- **Risk 2:** `ck plan check 1 --start` may fail if the plan directory path contains characters that the CLI mis-parses. Mitigation: the path uses only `[a-z0-9-]` characters; the prior plan (260605-superseded-status-and-discoverability) used the same pattern and succeeded.
