# PM Status — Unify Observation Staleness Mechanism (sync-back)

| Field | Value |
|---|---|
| Plan | `plans/260728-2323-unify-observation-staleness-mechanism/` |
| Branch | `plan/unify-observation-staleness-mechanism` |
| Status | **completed** |
| Phases | 5/5 completed |
| Finding | `meta-260616T0222Z` resolved (v17) |
| Suite | 2657 passed, 1 skipped, 0 failed |

## Sync-back summary

All 5 phase files + `plan.md` flipped `status: pending → completed`; phases table `Pending → Completed`; every Success Criteria checkbox `[ ] → [x]` (31 phase + 10 plan). Backfilled across all phases (not just the active one).

| Phase | Status | Checkboxes | Evidence |
|---|---|---|---|
| 1 Shared constant + predicates | completed | 6/6 | `observation-staleness.js` pure, 19 tests, `check_runtime_agnostic` 6/6 |
| 2 Dedup projection | completed | 7/7 | kind-before-collapse, cross-kind collision test green, constraint-gate oracle green |
| 3 Rewire inbound gate | completed | 5/5 | `findObservationsStaleByAge` wired, F1 invariants (7 tests), `findStaleObservations` deleted |
| 4 Rewrite bash gate + notify-artifact | completed | 7/7 | single-loop `checkObservationStaleness`, dead import dropped, cross-gate consistency (2 tests) |
| 5 Re-ground + resolve + log | completed | 6/6 | ref repointed, `recommendation: no_action`, `drift: false`, change-log `meta-260729T0927Z` |

## Divergent criteria (annotated, not silently flipped)

| Criterion | Reality | Note added |
|---|---|---|
| Phase 2: constraint-gate decisions unchanged | True for existing fixtures; the active→paused/stopped **block** is an intended flip on a *new* transition no existing fixture exercised | test-pinned; plan risk-note corrected |
| Phase 2: staleness-fixture failures recorded for Phase 4 | Transition-state criterion; Phase 4 rewrote them (green) | deferral closed, not left failing |
| Phase 5: derive_status no longer active-uncertain/investigate | `recommendation: no_action`, `drift: false` (✓ actionable); `derived_status` sub-signal still `active-uncertain` — pre-existing quirk (`meta-260728T2029Z`), not this plan | honest caveat recorded |
| Phase 5: file-index refreshed for 6 paths | `code_ref_exists: true`, current hash `sha256:ed18e9…` on primary ref | file-index is gitignored pretest-seed regen |

## Session work beyond the shipped commits

Commits `79a13fd` + `20a40c4` shipped Phases 1–5. This session (uncommitted) added:
- **Review fix** (7 files): pinned block-on-pause regression test; fixed collapse-test timestamp flake; dropped stale line-refs to deleted code; documented partial-DRY deviation; corrected the plan's "constraint gate unaffected" claim.
- **Docs align** (2 files): `docs/architecture.md` (inbound/outbound staleness algorithms, F2/F8 ledger) + `docs/runtime-contract.md` (projection→block contract) re-pointed to current symbols; deleted-symbol refs gone.

## Runtime task surface

No live task-management surface was hydrated this session (`Plan Context: none`); the durable plan files are the source of truth and were sync-backed directly. No runtime mirror to reconcile.

## Unresolved

1. **Uncommitted work**: 9 files changed this session (7 fix + 2 docs) + 6 plan-status files are unstaged. Commit pending user go-ahead. Suggested split: `fix(gate): pin block-on-pause, drop stale line-refs, fix collapse test flake` + `docs: align staleness + block-on-pause contract` + `docs(plan): mark unify-observation-staleness phases completed`.
2. **`derived_status: active-uncertain` on terminal findings** — pre-existing quirk (`meta-260728T2029Z`, resolved) affecting all terminal findings, including this one. Out of this plan's scope; flagged for awareness only.
