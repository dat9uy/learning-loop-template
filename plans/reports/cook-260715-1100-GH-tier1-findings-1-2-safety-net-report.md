# Cook — Tier 1 Findings 1+2 Safety Net (Session 260715-1100)

## Status: DONE

**Scope (per user direction):** Land red-team Findings 1+2 from session 260715-1010's `/ck:code-review` review before re-enabling the write dispatch in Phase 2 step 2. These are the load-bearing regression tests + defensive guard required to safely ship the deferred Phase 2 work.

## What Shipped

### Finding 1 — Dual-source read seam regression tests (11 tests)

`tools/learning-loop-mastra/__tests__/legacy-mcp/dual-source-read-seam.test.js` exercises the load-bearing read code with a real `change-log.jsonl` (no test in the existing suite created one — every dual-source path was a no-op `missing file → empty → identity`).

- **(a) readRegistry union semantics** (4 tests):
  - union of both files returns all entries
  - chronological sort by `created_at` (not grouped by source)
  - missing `change-log.jsonl` → empty (pre-split compat)
  - missing `meta-state.jsonl` → empty (cold-start compat)
- **(b) LRU cache invalidation** (2 tests):
  - busts on `change-log.jsonl` mtime change with no `meta-state.jsonl` change
  - stable array reference on warm-cache hit (no false invalidation)
- **(c) Cold-tier cache invalidation** (2 tests):
  - misses after a change-log-only write via `change_log_sha256` key
  - hits when `change-log.jsonl` is absent (pre-split `null` component treated as stable)

### Finding 2 — Persist-site change-log leak guard (3 tests)

`assertNoChangeLogLeak(entries, root)` in `core/meta-state.js` rejects any persist whose entries array carries a change-log entry once `change-log.jsonl` exists. Pre-split (no `change-log.jsonl`) is a no-op guard — existing single-file behavior preserved.

- guard is a no-op when `change-log.jsonl` is absent (pre-split backward compat)
- guard rejects a non-table-only persist once `change-log.jsonl` exists (the regression we're guarding against)
- guard allows table-only persists once `change-log.jsonl` exists (via `writeEntry` + `appendRegistryEntryAtomic`)

**Refactor:** `metaStateBatch`'s inline persist (formerly `writeFileSync + renameSync + invalidateCache` at L1402-1406) was rewired to call `persistRegistryAtomic(entries, root)`. Behavior-equivalent pre-split (same fs operations), but now the guard fires from the batch path too. This is the call site the test surfaced — the inline batch persist would have been a leak vector post-split.

**All 5 persist sites now covered:** updateEntry, archiveEntry, deleteEntry, shipLoopDesign, metaStateBatch.

## Verification

| Scope | Result |
|-------|--------|
| `dual-source-read-seam.test.js` | 11/11 ✓ |
| `cold-tier-regression.test.js` | 1/1 ✓ (after fingerprint refresh) |
| `tools/learning-loop-mastra/` (core + legacy-mcp) | 198/199 files, 1802/1803 tests, 1 skip |
| Full repo | 214/215 files, 1914/1915 tests, 1 pre-existing skip |
| Regressions vs. session 260715-1010 baseline | **0** |

`file-index.jsonl` fingerprint refreshed for `tools/learning-loop-mastra/core/meta-state.js` (sha256: `7bafd2fc...` → `f9450601...`). file-index is gitignored (derived cache); the cold-tier regression test serves as the live guard that the index matches the file contents.

## Files Touched

| File | Change |
|------|--------|
| `tools/learning-loop-mastra/core/meta-state.js` | Added `assertNoChangeLogLeak` (22 lines), called from `persistRegistryAtomic` (1 line). Refactored metaStateBatch inline persist to call `persistRegistryAtomic` (~5 lines removed). Updated 1 deferral comment to reflect the refactor. Net: +37/-5. |
| `tools/learning-loop-mastra/__tests__/legacy-mcp/dual-source-read-seam.test.js` | New file (332 lines, 11 tests across 2 describe blocks). |
| `file-index.jsonl` (gitignored derived cache) | Fingerprint refreshed for `meta-state.js`. |
| `plans/260715-0801-change-log-stream-split-tier1/plan.md` | Added session 260715-1100 entry; updated `last-session` to `260715-1100`. |

## Commit

`2322901 feat(core): dual-source read seam regression tests + persist-site leak guard`

## Still Deferred (ordered, from plan.md §"Resume for next session")

1. Re-enable write dispatch in `writeEntry` + auto-emit in `metaStateBatch`.
2. Re-enable `tableOnly` projections at the 4 persist sites (now safe — guard + regression tests in place).
3. Fix 10 raw-reading tests.
4. `consolidates` schema change to `z.array(z.string())` (Phase 2 step 1).
5. Migration script `migrate-change-log-stream.mjs` (Phase 2 step 4).
6. `.gitattributes` `change-log.jsonl merge=union` + git-track (Phase 2 step 3).
7. Advisory workflow path-filter + diff-command update (Phase 2 step 6).
8. Phase 3 CI gates (pre-merge WARN + post-merge BLOCK).
9. Phase 4 verify + closeout (merge=union dry-run, AGENTS.md docs fix, resolve `change-log-stream` finding, keep `finding-stream` open, journal).

## Open Decisions for Operator

See handoff §"Open questions for next session":
- Does the `consolidates` schema change need a Zod `preprocess` runtime conversion (wrap single string in array on read) for in-flight processes, or is a one-time migration + schema flip sufficient?
- Should the write dispatch + 10 test fixes ship in 1 PR or 2?
