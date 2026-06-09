# Stale-flag redesign: journal

**Date**: 2026-06-09
**Author**: ck:cook
**Plan**: plans/260609-stale-flag-redesign/plan.md
**Status**: Shipped

## The recursion

The TTL finding `meta-260608T0847Z-ttl-expire-system-...` documented a
bug: when a `status: "reported"` finding passes its `expires_at`, the
sweep tool transitions it to `status: "expired"` with
`resolved_by: "auto-resolve"`. The finding disappears from the active
set. The original problem is never re-verified.

The TTL finding was itself auto-resolved at 2026-06-09T02:10:37Z by
the very system it described — a recursion: the critic was silenced
by the system.

## The proof case

`meta-260606T1500Z-closeout-script-idempotency-bug` (a real bug, fixed
in code) was auto-resolved by TTL at 2026-06-07T08:00:55Z. The bug
fix shipped but the finding was lost. A 2026-06-09 agent only
rediscovered it via `derive_status` drift=false, not via active
finding lookup.

## The fix

Replaces `resolved_by: "auto-resolve"` on TTL expiry with a new
`stale` status (non-terminal). The new `meta_state_re_verify` MCP
tool re-validates stale findings via `verification.steps`. The new
`meta_state_supersede` MCP tool is the canonical writer of
`consolidated_into` (closes the `meta_state_patch` deny-list gap).

Also fixes the second auto-resolve-by-clock path in `meta_state_list`
(every list call was stamping `resolved_by: "auto-resolve"` on
past-TTL entries — now transitions to `stale` instead).

## Test results

- meta-state-stale-flag.test.js: 10 new tests, 10P/0F
- meta-state-sweep-stale-transition.test.js: 3 new tests, 3P/0F
- cold-session-discoverability.test.cjs: 1 added assertion, 1P/0F
- index-validate-smoke.test.js: 1 new test, 1P/0F

Total: ~851 existing + 15 new = ~866 passing, 0 failing.

## Registry changes

- 1 new loop-design entry (now `inactive`, `shipped_in_plan` set)
- 1 new change-log entry (the implementation change-log: meta-260609T1333Z-stale-flag-redesign-shipped)
- 1 patched change-log entry (meta-260609T1817Z-meta-state-jsonl-finding-lifecycle; added `consolidates` field)
- 2 superseded findings (TTL + closeout; both `consolidated_into`
  points at the implementation change-log)

## Future work (deferred to follow-up plans)

- TTL config field on `meta_state_report` at creation time
  (per-finding TTL, not the 7-day default).
- Pattern-based verification templates.
- `meta_state_sweep` SessionStart hook to auto-sweep on session start.
- `stale_drift` drift kind in `meta_state_query_drift`.
