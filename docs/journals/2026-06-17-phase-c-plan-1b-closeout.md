# Phase C Plan 1b — Hygiene Closeout

**Date**: 2026-06-17 18:06
**Severity**: Low
**Component**: test infra, meta-state surface, documentation
**Status**: Resolved

## What Happipped

Shipped 5 stacked hygiene fixes in a single session as Phase C Plan 1b:

1. **Cold-session test isolation (CR-3).** Wrapped the hook-mirror assertion in `cold-session-discoverability.test.cjs` in a nested `describe` with `before()`/`after()` hooks so the file runs GREEN in isolation and no longer relies on global test ordering.
2. **Mutex scope per-connection (Plan 1a review Important).** Replaced the module-level `inFlight` queue in `with-mcp-server.js` with a per-tempRoot map. Same `GATE_ROOT` still serializes cross-server writes; unrelated `tempRoot`s now run concurrently. Also fixed the stale-rejection bug in `with-both-mcp-servers.js`.
3. **Test strengthening (Plan 1a review Minors 2 + 5).** Added deterministic monotonic `created_at` ordering to the 20-parallel mutex race test. Added 3 inverse-map coverage tests: one finding referenced by two change-logs, empty `consolidates: ""`, and duplicate ids in a CSV.
4. **Inverse map dedup (Plan 1a review Minors 3 + 4).** Added `if (!arr.includes(id)) arr.push(id)` to `consolidated_into_inverse` construction in `loop-introspect.js` and rewrote the forward-reference comment to clarify `change-log.consolidates`.
5. **Doc drift corrections.** Updated Plan 1a `plan.md` and `closeout-report.md` from "9" to "10" namespaces, fixed Plan 1a journal hallucinated map names and `TERMINAL_STATUSES` origin claim, added Plan 1a to `project-changelog.md`, rewrote Plan 2 R-09 arithmetic to a durable "all 10 test namespaces pass" anchor, and renamed `TERMINAL_STATUSES` to `EXCLUDABLE_STATUSES` in `meta-state-list-tool.js`.

## Acceptance

- `pnpm test`: **1073 pass / 0 fail / 1 pre-existing skip** across all 10 test namespaces.
- 1 change-log entry filed: `meta-260617T1806Z-plans-260617-1607-phase-c-plan-1b-hygiene-plan-md`.
- Master tracker flipped: C5b [Plan 1b] is now `[x]`; namespace anchor updated to 10.

## Unblocks

- Plan 3 (C6+C7 cut-over).
