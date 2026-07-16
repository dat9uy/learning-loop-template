# Phase A Implementation Journal

**Plan:** plans/260716-1101-tier2-versioned-append-mutable-stream/
**Phase:** A (Projection Swap + Version Backfill)
**Status:** ✅ Complete
**Date:** 2026-07-16

## Summary

Tier 2 Phase A landed cleanly. Three TDD-driven changes plus one infra refactor:

1. **`_readAndParseRegistry` projection swap** — replaced sort-only tail with
   `group_by(id) → max_by(version) → re-sort by created_at`. Pure JS (V8
   stable `Array.prototype.sort`). Tie-break: later created_at wins (consistent
   with `migrate-change-log-stream.mjs#dedupeById`).

2. **`backfill-versions.mjs`** — one-time migration with `proper-lockfile`
   cross-process lock, unique `.backfill-<pid>.tmp` suffix (RT-H2), dry-run
   mode, gate-log entry emission. Default `version: 0` documented in script
   header per Validation Session 1 Q1.

3. **`registry-table.sh` default flip** — now reads `meta-state.jsonl change-log.jsonl`
   by default (RT-M2), missing files emit a notice rather than exit 2.

4. **Backfill applied to live registry** — 14 entries missing `version` set to
   `0`; 100 lines preserved; 0 null/non-integer versions remaining; 0
   all-null-version groups.

## Test Coverage

| Test Suite | Tests | Suites |
|------------|-------|--------|
| `projection-last-wins-by-max-version.test.js` (NEW) | 6 | 1 |
| `backfill-versions.test.cjs` (NEW) | 6 | 1 |
| Core + legacy-mcp full sweep | 1521 | 283 |
| Full legacy-mcp + tool tests | 1624 | 324 |

All green.

## Test Fixes (Public-Contract Staleness)

Two pre-existing tests used identical descriptions across multiple `meta_state_report`
/ `meta_state_log_change` calls, which produced same-id entries via minute-resolution
`generateId`. Pre-Phase-A the read returned both lines (no dedupe); post-Phase-A
the projection correctly surfaces 1 entry (last-wins-by-max-version, same version).

| File | Fix |
|------|-----|
| `meta-state-log-change.test.js:286` | Assert `change-log.jsonl` has 2 lines, projection returns 1 entry (cache-skip invariant is file-level, not projection-level) |
| `file-index-o1-regression.test.js:28` | Three calls now use unique descriptions so each generates a unique id |

## Acceptance Criteria

- ✅ Projection test passes (dup-id → max version; singleton → identity)
- ✅ Ordering-preservation test passes (chronological by `created_at` after dedupe)
- ✅ Backfill idempotence test passes (6 cases including atomic tmp+rename)
- ✅ Real `meta-state.jsonl` has zero null/non-integer `version` fields after backfill
- ✅ `readRegistry` output is chronological (verified: `already chronological: true`)
- ✅ All 1624 tests / 324 suites green
- ✅ No `.gitattributes` change; no write-path function edited

## Notes for Phase B

- `_readAndParseRegistry` is now the last-wins-by-max-version projection. Phase B
  write-path (append-only true-append + per-id monotonic versioning) will start
  producing multi-line-per-id entries; the projection already handles them.
- The `version: 0` backfill default means every existing entry has a known
  integer version. Phase B's no-op short-circuit (canonical comparator) can
  safely compare `version` integers without `null` handling.
- `registry-table.sh` default is now both files; the JS chokepoint and shell
  helper are parity-equivalent (both dedupe by id with max-version).
- Two test sites needed refactoring because they relied on `readRegistry` returning
  multiple same-id lines. Future tests should use unique descriptions/slugs per
  call to avoid hitting the new dedupe.