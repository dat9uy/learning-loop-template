# Phase 3: Collapse dedup to permanent-for-non-archived

## Context

The dedup filter (`recurrence-tracker.js:87-93`) currently suppresses re-filing only for
**`open** findings (`isOpen(e)`). Because the log is append-only and never trimmed, the
dedup filter is the ONLY thing preventing the original burst from being re-filed every
session forever (once P1 drops the `since` filter and scans the full log). PR 109 added an
`accepted` status (terminal) and made `resolved` terminal; both should suppress too.

This phase **collapses** the cancelled plan's N=14-day grace window. A 5-persona
`ak:predict` debate (verdict CAUTION) rejected both the time-based grace window (can't
distinguish stale-log re-scan noise from genuine post-fix recurrence) and the
`resolved_at`-relative re-file alternative (Option A: `resolved_at` is a *social* event
that can precede the rule patch → phantom regressions). Decision: `open` + `accepted` +
`resolved` all suppress permanently; `archived` re-admits. No `resolved_at` comparison,
no grace-window constant.

Report: §2, design decision #4.

## Requirements

- The `existing` filter suppresses re-filing for `open`, `accepted`, AND `resolved`
  `recurring-false-positive` findings.
- `archived` findings do NOT suppress (a deleted/archived finding can re-detect).
- No `resolved_at` field read, no grace-window constant, no `withinGrace` helper.
- The blind spot is recorded as a deliberate, revisitable decision (not a hidden defect):
  a genuine same-prefix regression after resolve will NOT auto-file; the live gate banner
  is the first-order signal; revisit only on a documented incident.

## Files

- **Read:** `tools/learning-loop-mastra/core/recurrence-tracker.js` (`:84-97` dedup),
  `tools/learning-loop-mastra/core/constants.js` (`TERMINAL_STATUSES` `:60` includes
  `resolved`/`accepted`/`superseded`/`archived`; `isOpen`), `tools/learning-loop-mastra/core/stale-view.js`
  (`isOpen` definition).
- **Modify:** `recurrence-tracker.js` (the `existing` filter `:87-93`).

## Steps

1. **Widen the filter.** Replace the `isOpen(e)` clause (`:91`) with `e.status !== "archived"`.
   The full predicate becomes:
   ```js
   const existing = readRegistry(root).filter(
     (e) =>
       e.entry_kind === "finding"
       && e.subtype === "recurring-false-positive"
       && e.recurrence_key
       && e.status !== "archived",
   );
   ```
   `open`, `accepted`, `resolved` (and any non-archived status) all join the suppress set;
   `archived` is excluded so a re-detect after archive is possible.
2. **Remove any grace-window scaffolding.** If P2 or an earlier draft introduced a
   `RESOLVED_GRACE_DAYS` constant or `withinGrace` helper, delete them. Confirm no
   `resolved_at` read remains in `checkAndEmit`. (The cancelled `260802-0135` plan had a
   `RESOLVED_GRACE_DAYS = 14` design decision — explicitly NOT carried over.)
3. **Tests (TDD):**
   - An `open` existing finding with the same (hashed) `recurrence_key` → suppresses
     re-filing (unchanged behavior, re-asserted).
   - An `accepted` existing finding with the same key → suppresses (NEW; previously
     `isOpen(accepted)` is false so it would have re-filed — this is the fix).
   - A `resolved` existing finding with the same key → suppresses (NEW; previously would
     have re-filed every session from the stale burst — the grace-window noise source).
   - An `archived` existing finding with the same key → does NOT suppress → re-files
     (archive re-admits detection).
   - No `resolved_at` is read anywhere in `checkAndEmit` (assert the function does not
     reference it — guards against re-introducing the grace window).

## Validation

- Recurrence + meta-state test suites green.
- Manual: seed an `accepted` and a `resolved` `recurring-false-positive` finding in a
  fixture registry + a qualifying burst in the log; run `checkAndEmit`; assert **zero**
  new findings (both suppress). Archive one; re-run; assert **one** new finding (archive
  re-admits).

## Risk

- **The blind spot (deliberate).** A genuine same-prefix regression after a resolve won't
  auto-file. Mitigations (recorded in plan §decision #4 + the finding logged at ship): the
  live gate banner fires every command regardless; same-prefix regression after a correct
  rule refinement is near-impossible; the trigger has never fired. **Revisit trigger:** add
  a post-resolve re-file path only if a documented incident shows the banner insufficient.
  This is a recorded trade-off, not a regression.
- **`superseded` status.** Post-PR-109, `superseded` collapses into `resolved` + citation;
  if any `recurring-false-positive` is still `superseded` (none exist today — zero
  findings), the `!== "archived"` filter treats it as suppressing (terminal). Acceptable
  and consistent.

## Rollback

Revert the one-line filter change (`!== "archived"` → restore `isOpen(e)`). Returns to
open-only suppression. No data migration. The `accepted`/`resolved` suppression is purely
additive safety; reverting only re-exposes the grace-window noise (re-filing from stale
bursts), which is the bug this phase removes.
