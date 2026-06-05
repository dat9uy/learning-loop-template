---
title: "Superseded Status + Discoverability cook (plan 260605)"
date: "2026-06-06"
session: ck:cook --tdd
plan: plans/260605-superseded-status-and-discoverability
status: completed
tests: "16 new (7+2+4+3); 690 total, 0 failing"
---

# Cook journal — plan 260605 (Superseded Status + Discoverability)

## Summary

Executed the full 4-work-phase plan via TDD. All 16 new tests pass on first or
second attempt; 0 regressions; the 1 pre-existing failure (`g8-subcommand-class-
entry.test.js`) was resolved by updating the assertion to accept `superseded`
(Phase 2's housekeeping moves the G8 entries to that status).

## Phase outcomes

| Phase | Title | Tests | Outcome |
|-------|-------|-------|---------|
| 0 | G8 7th-recurrence log + scaffolding | 0 | logged via direct `writeEntry` (G8 7th recurrence) |
| 1 | Schema + drift filter | 7 | green after fixing 1 ENOENT in test fixture |
| 2 | Apply Option A to 4 G8 findings | 2 (+ 1 pre-existing fixed) | green after applying the batched mutation to real `meta-state.jsonl` |
| 3 | `loop_describe` cold-tier lineage | 4 | green after correcting test 2's orphan definition (plan's "orphan" = bad `consolidated_into` pointer, not "no pointer") |
| 4 | Hook failure reporting | 3 | green after resolving meta-state module path via `__dirname` (test cwd is a temp dir) |

## Decisions made during cook (not in plan)

1. **Test 2 of Phase 3 (orphan definition):** the plan describes an orphan as
   "a finding whose `consolidated_into` points to a non-existent change-log."
   My initial test also expected entries with `status: 'superseded'` but no
   `consolidated_into` to appear in orphans. This contradicts the plan: an
   entry without `consolidated_into` has no audit-trail pointer and is simply
   excluded from lineage. I corrected the test to match the plan. The
   implementation treats missing-`consolidated_into` as a no-op (not orphan).

2. **Phase 4 module path resolution:** the hook runs from a per-session `cwd`
   (which can be a temp dir in tests). The `meta-state.js` module lives in
   the project. I resolved the module path via `path.resolve(__dirname, '..',
   '..')` (project root from hook's own location) instead of using `cwd`.
   This makes the hook robust in any cwd.

3. **Phase 4 idempotency check widened:** the plan's spec was `e.session_id
   === sessionId && (e.status === "active" || e.status === "reported")`. I
   kept that exact check. The new `superseded` status is NOT in the
   "active-or-reported" set, so a previously-superseded entry will not
   block a new finding from being logged. This is correct: the hook fires
   on a fresh session start; if the previous session's failure was
   superseded (e.g. operator resolved it), the new session should re-report
   the new failure.

## Side effects

- `meta-state.jsonl` grew by 2 lines (1 G8 7th-recurrence change-log + 1 G8
  supersede change-log) and 4 finding entries mutated in place. Net: +2
  lines, 4 entries modified. No entries deleted.
- 1 pre-existing test updated (`g8-subcommand-class-entry.test.js`) to
  accept `superseded` as a valid status. Comment explains why.

## Public contract changes

- `metaStateFindingEntrySchema.status` enum: `["reported"]` → `["reported",
  "superseded"]` (additive).
- `metaStateFindingEntrySchema` gained 2 optional fields: `consolidated_into`,
  `session_id`.
- `metaStateChangeEntrySchema` gained 1 optional field: `consolidates`.
- `TERMINAL_STATUSES` set: gained `"superseded"`. Existing semantics
  preserved (compaction + drift filter treat it as terminal).
- `loop_describe({tier: 'cold'})` response gained 1 field
  (`superseded_lineage`, always present) and 1 optional field (`orphans`,
  only when present).

All changes are additive and backward-compatible. Existing entries parse
unchanged; existing tests pass.

## What did NOT go to plan

- The plan mentioned `summary === null` (returned-but-no-summary) as a
  failure case for the hook — confirmed during implementation. The hook
  reports both `catch` paths AND the `summary === null` path.

## Next steps

- `supersedes` field on change-logs: currently unused in meta-state. The
  plan keeps it reserved for change-log-to-change-log lineage (singular per
  schema). Future plans that supersede a previous change-log should use
  this field.
- G8 subcommand-class false positive: NOT fixed by this plan. The change-
  log's `reason` documents the two fix paths (regex qualifier vs
  subcommand-name allowlist). A separate plan is needed.
