# Cold-session test churn fix + cross-compat

**Date:** 2026-06-10
**Plan:** `plans/260610-1203-cold-session-churn-and-cross-compat-fix/`
**Report:** `plans/reports/brainstorm-260610-1200-cold-session-test-churn-and-cross-compat-report.md`

## Problem

The cold-session discoverability test (`cold-session-discoverability.test.cjs`) created finding churn in `meta-state.jsonl`. Every test run added new `mcp-client-loading` findings while resolving old ones, producing a ping-pong of entries with `session_id=test-cold-session-mcp-client-loading`. At the time of fix, there were ~7 churn entries (stale/expired/resolved) and 1 active/reported finding for this session ID.

## Root Cause

Two independent bugs:

1. **Logical collision:** L1 probe (test 3) gap-close branch resolved ANY finding matching `session_id+subtype`, including L2 findings created by test 5. L2's idempotency guard only checked `active|reported` status, so once L1 resolved an L2 finding, test 5 wrote a fresh one on the next run.
2. **TOCTOU race:** `node --test` runs top-level tests concurrently. Both probes read the registry, found no active finding, detected their gaps, and wrote simultaneously, producing 2 findings per run on race-loss.

## Fix

### Phase 1: Atomic helper + L1/L2 refactor

- Added `tryClaimSessionId(root, key, entryBuilder)` in `core/meta-state.js`, operating under the existing `enqueue` per-root lock. The helper filters on exact `(sessionId, subtype, runtime, layer)` and returns `{claimed: true, id}` or `{claimed: false, existing}`.
- Refactored test 3 (L1) and test 5 (L2) to use the helper for gap-open claims.
- Tightened gap-close filters to only soft-delete findings with matching `runtime` + `layer` markers, preventing cross-layer resolution.
- Migrated all 10 existing `mcp-client-loading` findings to include `runtime: unknown; layer: L1|L2` markers.
- Added drift detector test: asserts every active `mcp-client-loading` finding has both markers.

### Phase 2: Freshness sentinel + cross-compat

- Added `.cold-session-sentinel.json` written by tests 1 and 5 on every run.
- Added `cold-session-freshness.test.js` (runs in `pnpm test`): fails loud if sentinel is missing or older than 3 days.
- Added `detectAgentCli()` that probes `droid` then `claude` via `--version`; both L1 and L2 probes use the detected CLI.
- Added `pnpm test:cold-session` script to `package.json`.

## Before / After

| Metric | Before | After |
|--------|--------|-------|
| Churn entries (stale/expired/resolved) | ~7 historical + growing | Existing entries will compact after 7 days; new runs create ≤1 per layer |
| Race findings per concurrent run | 2 (L1 + L2) | 1 (first claim wins) |
| Cross-layer resolution | L1 resolved L2 | Layer-isolated |
| CLI support | droid only | droid or claude (auto-detected) |
| Freshness enforcement | none | `pnpm test` fails loud after 3 days |

## Verification

- `tryClaimSessionId` race test: 5 concurrent calls → exactly 1 finding. Passed 5/5 stress runs.
- `pnpm test`: 907 tests, 0 failures.
- `pnpm test:cold-session`: 6 tests, 0 failures.
- Rule `rule-cold-session-test-must-pass-before-resolution` pattern unchanged (`"test-cold-session-mcp-client-loading"`).

## Risks Accepted

- `enqueue` lock is per-process. Multi-process testing would need `flock`. Documented in helper JSDoc.
- Scout bucket classification for `cold-session-discoverability.test.cjs` changed from D to C because `spawn("droid", ...)` was replaced with `spawn(cli, ...)`. Scout tests updated.

## Open Questions

None. All questions resolved in the brainstorm report's Validation Log.
