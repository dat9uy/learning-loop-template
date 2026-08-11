---
phase: 3
title: "Post-B budget re-anchor"
status: pending
priority: P2
effort: "30m"
dependencies: [2]
---

# Phase 3: Post-B budget re-anchor

## Overview

After Phase 2 shrinks the wire to its new steady-state, re-anchor the budget test ceiling
from the restored 55,000 to `measured_wire + headroom`. This is the deferred half of the
report's resolved Q1: re-anchoring is only actionable after B's measured result, not
against today's estimate. A tighter, structurally-justified ceiling replaces the
bump-cycle guard and removes the manual drift pressure that caused the two consecutive
raises.

## Requirements

- Functional: budget test asserts `<= <new_ceiling>` where `<new_ceiling> = post_B_wire + headroom`.
- Non-functional: the headroom is deliberate and documented (enough for 1-2 near-term tool
  additions, not a round number), with rationale in the test comment.
- Non-functional: the STOPGAP narrative is gone; the comment explains the ceiling is
  structurally anchored to the glossary-ref steady-state.

## Architecture

The budget test (`mcp-wire-budget.test.js`) measures `Buffer.byteLength(JSON.stringify(manifestTools))`
against a constant. Re-anchoring changes the constant and the comment only — no handler
edits. The new ceiling is set from Phase 2's **measured** wire (the recorded post-B number)
plus headroom for 1-2 near-term tool additions. **Red-team correction:** the report's
~50,110 optimistic floor does not hold under "existing 19 entries only" — the realistic
post-B wire is ~53-54 KB (55,247 minus ~1-2 KB). Headroom must be sized against THAT, not
the ~5 KB optimistic shrink, or the re-anchored ceiling will sit at ~54 KB + headroom ≈
55-55.5 KB — barely below today's 55,750 stopgap, restarting the bump cycle on the next
tool-doc growth. Set headroom deliberately (~1 KB, non-round) so the ceiling is
meaningfully below 55,000 with room for 1-2 additions.

## Related Code Files

- Modify: `tools/learning-loop-mastra/__tests__/mcp-wire-budget.test.js` — new ceiling
  constant + re-anchored rationale comment; remove the STOPGAP narrative.
- Read-only: Phase 2's recorded post-B wire measurement (the exact number).
- Optional: `tools/learning-loop-mastra/__tests__/cli-context-savings.test.js` — re-snapshot
  if the structural shrink changed any snapshotted surface.

## Implementation Steps (TDD)

1. **Read Phase 2's recorded post-B wire** (the exact bytes from Phase 2 step 6).
2. **Compute the new ceiling** = post_B_wire + headroom (~1 KB, non-round), sized so the
   ceiling is meaningfully below 55,000 with room for 1-2 near-term tool additions. Document
   the headroom rationale. If post_B_wire is already ~54 KB, the ceiling lands ~54.8-55 KB —
   flag to the user whether that headroom is acceptable before committing it.
3. **Red — set the test to the new ceiling** and confirm it passes at the measured wire
   with the expected margin. If it fails, the wire grew since Phase 2 — investigate before
   raising.
4. **Rewrite the test comment** — state the ceiling is structurally anchored to the
   glossary-ref steady-state, name the measured wire, and explain that further growth
   should extend the glossary pattern, not raise the ceiling.
5. **Green — run `mcp-wire-budget` + `cli-context-savings` + full loop suite.**
6. **Resolve the finding** — file the resolution against
   `meta-260811T0805Z-manifest-context-budget-raised-a-second-consecutive-time-mcp` via the
   loop CLI (`meta_state_resolve`), citing the restored-then-re-anchored ceiling and the
   structural fix.

## Success Criteria

- [ ] Budget test asserts the new `measured_wire + headroom` ceiling and passes.
- [ ] STOPGAP comment removed; structurally-anchored rationale written.
- [ ] `cli-context-savings` passes (re-snapshotted if needed).
- [ ] Full loop suite green.
- [ ] Finding `meta-260811T0805Z-...` resolved with citation.

## Risk Assessment

- **Risk: re-anchoring to a number that's too tight, restarting the bump cycle.** Mitigation:
  carry ~1 KB headroom and document it; if a future legitimate tool addition needs more,
  the response is to extend the glossary pattern (Phase 2's mechanism), not raise the
  ceiling silently.
- **Opposite risk (red-team): re-anchoring to a number that's NOT tight enough.** If the
  Phase 2 shrink is small (~1-2 KB) and headroom is ~1 KB, the ceiling lands ~54.8-55 KB —
  barely below the 55,750 stopgap, defeating the anti-bump-cycle goal. Mitigation: flag the
  computed ceiling to the user before committing; if it is not meaningfully below 55,000,
  the honest conclusion is that "existing 19 only" does not buy enough structural margin
  and the glossary-scope decision (validation Q3) should be revisited, not the headroom
  silently widened.
- **Risk: the wire grew between Phase 2 and Phase 3.** Signal: the new ceiling test fails
  at step 3. Pre-decided response: re-measure and find the growth source before adjusting;
  do not raise the ceiling without explaining the growth.
- **Assumption that may break: Phase 2's measured wire is stable.** Signal it broke: a
  re-measurement in Phase 3 differs from Phase 2's recorded number. Pre-decided response:
  use the Phase 3 re-measurement (the more recent truth) and reconcile the delta.