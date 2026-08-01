---
phase: 3
title: "Resolved-finding grace window"
status: pending
priority: P2
effort: "1h"
dependencies: [2]
---

# Phase 3: Resolved-finding grace window

## Overview

Stop a resolved `recurring-false-positive` from re-filing from stale log entries every
SessionStart. Widen `checkAndEmit`'s `existing`-finding filter from `isOpen(e)` to also
suppress re-filing against a **resolved** finding within a grace window of its
`resolved_at`. Predicates on meta-state's existing `resolved_at` — **not** runtime-state
(report §7 redirect: wrong layer, wrong enum, duplicates owned state, worsens secret
exposure).

## Requirements

- Functional:
  - A resolved finding with the same `recurrence_key` suppresses re-filing while
    `now - resolved_at < RESOLVED_GRACE_DAYS`.
  - After the grace window, a recurring-again pattern re-files (new finding).
  - An open finding with the same `recurrence_key` still suppresses (unchanged).
- Non-functional:
  - One tunable constant: `RESOLVED_GRACE_DAYS` (default 14).
  - No new substrate, no new files, no new kinds (report §7).
  - Preserves the stateless-hook norm (scan + dedup, no watermark).

## Architecture

```
recurrence-tracker.js#checkAndEmit
  existing = readRegistry(root).filter(e =>
    e.entry_kind === "finding"
    && e.subtype === "recurring-false-positive"
    && e.recurrence_key
    && (isOpen(e) || withinResolvedGrace(e))
  )
  withinResolvedGrace(e) =
    e.status === "resolved"
    && e.resolved_at
    && (Math.max(0, Date.now() - new Date(e.resolved_at).getTime()) < RESOLVED_GRACE_MS)
    # Math.max(0, …) clamps a future resolved_at (clock skew / manual entry) so it
    # cannot suppress forever (red-team M1).
```

`RESOLVED_GRACE_MS = RESOLVED_GRACE_DAYS * 86_400_000`. The `recurrence_key` is now
hashed (P2), so the comparison is hash-to-hash — stable across the format change.

**Open-finding suppression is permanent by design (red-team H1):** the `isOpen(e)` branch
has no age check — once a `recurring-false-positive` is filed for a prefix, that open
finding suppresses re-filing of the same prefix every subsequent session until a human
resolves it (then this grace window governs). This is the intended `recurrence_key`
dedup: the pattern is registered once and re-filing adds no information. Aged open
findings are surfaced by the existing stale-view pull (`meta_state_query_drift`), so a
stale-open re-file path would duplicate that mechanism (YAGNI). Confirmed in plan.md
Open Question 5.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/recurrence-tracker.js`
  - Add `RESOLVED_GRACE_DAYS = 14` (and derived `RESOLVED_GRACE_MS`).
  - Add `withinResolvedGrace(e)` predicate.
  - Widen the `existing` filter (lines ~87–97) from `isOpen(e)` to `isOpen(e) || withinResolvedGrace(e)`.
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/gate-recurrence.test.js`
  - Add grace-window cases (see steps).

## Implementation Steps (TDD — tests first)

1. **Test first.** In `gate-recurrence.test.js`:
   - Add: "checkAndEmit: resolved finding within grace suppresses re-filing" — seed a resolved finding (`status: "resolved"`, `resolved_at: now`, matching `recurrence_key`), write 3 fresh log entries, run `checkAndEmit`, assert `findings_emitted === 0`.
   - Add: "checkAndEmit: resolved finding past grace re-files" — same but `resolved_at: now - 15 days`, assert `findings_emitted === 1`.
   - Add: "checkAndEmit: resolved finding with no `resolved_at` does not suppress" (defensive — a resolved finding missing its timestamp should not suppress forever), assert re-files.
   - Add (M1): "checkAndEmit: future `resolved_at` does not suppress forever" — seed a resolved finding with `resolved_at` 1 day in the future, assert it re-files (the clamp prevents negative-diff suppression).
2. **Run tests — expect failure** (filter is `isOpen` only).
3. **Implement** `withinResolvedGrace` + the widened filter + the constant.
4. **Run tests — expect green.**

## Success Criteria

- [ ] Resolved + within grace → no re-file.
- [ ] Resolved + past grace → re-files.
- [ ] Open finding → still suppresses (no regression).
- [ ] Only one tunable constant added; no new substrate/kind/file.

## Risk Assessment

- **Risk:** The grace policy (forever vs N-days) is operator-intent. Suppress-forever
  hides a genuinely recurring-again pattern; suppress-too-brief is noisy.
  **Mitigation:** default N=14 days, flagged in plan.md Open Question 1 for the
  validation interview. Revisit from data once the trigger ships (report §7).
- **Risk:** A resolved finding missing `resolved_at` (legacy/data gap) would either
  suppress forever or never. **Mitigation:** the predicate requires a non-null
  `resolved_at`; without it, no suppression (re-files) — the safe, honest default.