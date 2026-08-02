# Phase 3: Collapse dedup to permanent-for-non-archived (+ race-safe write)

## Context

The dedup filter (`recurrence-tracker.js:87-93`) currently suppresses re-filing only for
**open** findings (`isOpen(e)`). Because the log is append-only and never trimmed, the
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

It also closes the **cross-process check-then-write race** (red-team Critical): the dedup
read at `:87` is unlocked and `withRegistryLock` is per-write only
(`meta-state.js:1344-1346`), so two simultaneous SessionStarts both pass the filter and
both write duplicate findings on the trigger's very first firing.

Report: §2, design decision #4.

## Requirements

- The `existing` filter suppresses re-filing for `open`, `accepted`, AND `resolved`
  `recurring-false-positive` findings.
- `archived` findings do NOT suppress (a deleted/archived finding can re-detect).
- No `resolved_at` field read, no grace-window constant, no `withinGrace` helper.
- The dedup check is **re-evaluated inside the registry lock** at write time (no TOCTOU
  across concurrent SessionStart processes).
- A dedup hit emits a **stderr diagnostic** (existing finding id + suppressed group hash)
  so suppression — including a wildcard hash collision — is observable, not silent.
- The blind spot is recorded as a deliberate, revisitable decision (not a hidden defect):
  a genuine same-prefix regression after resolve will NOT auto-file; the live gate banner
  is the first-order signal; revisit only on a documented incident.

## Files

- **Read:** `tools/learning-loop-mastra/core/recurrence-tracker.js` (`:84-97` dedup,
  `:101-126` write loop), `tools/learning-loop-mastra/core/constants.js`
  (`TERMINAL_STATUSES` `:60`), `tools/learning-loop-mastra/core/stale-view.js` (`isOpen`),
  `tools/learning-loop-mastra/core/meta-state.js` (`writeEntry` lock scope `:1344-1346`),
  `tools/learning-loop-mastra/core/registry-lock.js` (`withRegistryLock` `:33-43`).
- **Modify:** `recurrence-tracker.js` (the `existing` filter + race-safe write path +
  dedup diagnostic).

## Steps

1. **Widen the filter.** Replace the `isOpen(e)` clause (`:91`) with `e.status !== "archived"`:
   ```js
   const existing = readRegistry(root).filter(
     (e) =>
       e.entry_kind === "finding"
       && e.subtype === "recurring-false-positive"
       && e.recurrence_key
       && e.status !== "archived",
   );
   ```
2. **Make the write race-safe (shape validated 2026-08-02).** Add a
   `writeEntryIfAbsent(root, entry, keyPredicate)` helper that re-reads `existingKeys`
   under `withRegistryLock` immediately before appending — narrow lock scope, matching
   the existing `writeEntry` lock discipline (`meta-state.js:1344-1346`). Do NOT hold
   one lock across checkAndEmit's whole read-check-write cycle. The unlocked
   pre-filter stays as a fast path; the locked re-check is the correctness boundary.
<!-- Updated: Validation Session 1 - race-safe write pinned to writeEntryIfAbsent -->
3. **Dedup-hit diagnostic.** On suppression, `console.error` one line: existing finding
   id + the suppressed group's `recurrence_key` hash. (The SessionStart hook already
   uses stderr; this stays out of the agent-token channel.)
4. **Remove any grace-window scaffolding.** No `RESOLVED_GRACE_DAYS`, no `withinGrace`,
   no `resolved_at` read in `checkAndEmit`.
5. **Tests (TDD):**
   - `open` existing finding, same hashed key → suppresses (unchanged, re-asserted).
   - `accepted` existing finding → suppresses (NEW; previously re-filed).
   - `resolved` existing finding → suppresses (NEW; the stale-burst noise source).
   - `archived` existing finding → does NOT suppress → re-files.
   - **Race test:** two concurrent `checkAndEmit` invocations against the same fixture
     (or a serialized simulation of interleaved read/write) → exactly one finding.
   - A suppression emits the stderr diagnostic with finding id + hash.
   - No `resolved_at` is read anywhere in `checkAndEmit`.

## Validation

- Recurrence + meta-state test suites green.
- Manual: seed `accepted` + `resolved` findings for a key + a qualifying burst; run
  `checkAndEmit`; assert zero new findings + two diagnostic lines. Archive one; re-run;
  assert one new finding.

## Risk

- **The blind spot (deliberate).** A genuine same-prefix regression after a resolve won't
  auto-file. Mitigations: the live gate banner fires every command regardless; same-prefix
  regression after a correct rule refinement is near-impossible; the trigger has never
  fired. Revisit trigger: add a post-resolve re-file path only if a documented incident
  shows the banner insufficient.
- **Adversarial key squatting — documented non-issue (red-team, rejected).** A computed
  `recurrence_key` could theoretically be squatted (write an `open` finding for a victim
  key) to pre-suppress a genuine future burst. Rejected per threat model: single-operator
  repo; writing findings requires the loop record tools, and an actor with that access
  can suppress detection far more directly; the gate banner remains first-order signal.
- **`superseded` status.** Post-PR-109 `superseded` collapses into `resolved` + citation;
  if any `recurring-false-positive` were `superseded` (none exist), `!== "archived"`
  treats it as suppressing. Consistent.
- **Hash collision blast radius (bounded).** 64-bit keys (P1) make collisions
  birthday-safe far beyond registry scale; the step-3 diagnostic makes any suppression
  attributable (finding id + hash on stderr) instead of silent.

## Rollback

Revert the filter + lock changes. Returns to open-only suppression and the pre-existing
(unlocked) write path — no data migration; reverting only re-exposes the stale-burst
re-file noise and the race this phase removes.
