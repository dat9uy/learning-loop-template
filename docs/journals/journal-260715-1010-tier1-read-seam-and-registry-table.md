# Journal — 2026-07-15 — Tier 1 read seam + registry-table.sh

## What shipped

### Phase 01a: Pre-merge dedupe

`meta-state.jsonl` went from 313 lines (309 unique ids, 4 dup-id groups) to 309 lines (309 unique ids, 0 dup groups). Survivors follow the canonical dedupe rule:

- 3 change-log pairs: kept the entry with the later `created_at` (both at v=0).
- 1 mixed pair (`loop-design-vitest-migration-replace-node-test-and-c8`): kept the `entry_kind=loop-design` (the canonical replacement), dropped the `entry_kind=finding` (which already had `resolution: "Repair registry corruption..."`).

This makes Phase 1's manual-check acceptance ("one line per id") literally true on the live file.

### Phase 1: `registry-table.sh`

A new `tools/scripts/registry-table.sh` (kebab-case) mirrors the `vitest-failures.sh` contract: `set -euo pipefail`, exit 0/1/2 for green/failure/missing-or-invalid, read-only, no gate preflight. It projects one or more JSONL registries to one-line-per-id JSONL via `jq -sc 'group_by(.id) | map(max_by(.version))[]'`. Identity on a one-line-per-id file (Tier 0/1). Last-wins-by-max-version on a versioned multi-line-per-id file (Tier 2). Multi-file positional args supported (Red Team F11a).

7 vitest tests cover the contract: identity, last-wins dedupe, missing → exit 2, invalid JSON → exit 2, multi-file union, default path. All pass. `pnpm test` green for the targeted suite.

### Phase 2 read seam

Three core modules got dual-source awareness:

- `read-registry-cache.js` now stats both `meta-state.jsonl` AND `change-log.jsonl`. Cache key includes both files' mtime+size. Missing second file → empty (backward compat). Cache contract docstring expanded to reflect the dual-file invariant.
- `loop-introspect-cache.js` got a `changeLogSha256` helper. `readColdTierCache` / `writeColdTierCache` keys now include `change_log_sha256` alongside the existing `registry_sha256` + `file_index_sha256`. Paired atomic-read pattern (read all three → hash all three → compare) prevents stale-cache hits from concurrent writers.
- `meta-state.js#_readAndParseRegistry` reads both files, concats, sorts by `created_at` ascending (Red Team F15a). Missing second file → empty. This is the **identity projection seam** — the read chokepoint now accepts a `parseFn` that decides how the union is shaped; today it's identity, at Tier 2 the seam swaps to `lastWinsByMaxVersion` without touching this module.

### Phase 2 immutability guards (CORE layer)

`updateEntry` and `archiveEntry` now throw `change_log_immutable: change-log entries cannot be updated in place / archived` BEFORE any other validation. This is the load-bearing defense for `merge=union` safety on `change-log.jsonl` (Red Team F2, F7). Handler-level guards on resolve/patch paths are retained; the core-layer guard catches direct core callers (e.g. `fix-loop-design-refs.mjs`) that bypass handlers.

The existing compaction test (`compaction does not remove old terminal change-log entries`) was updated to assert the new guard: instead of mutating the change-log's status to "resolved" (now blocked), it asserts that `updateEntry` THROWS on a change-log and that the change-log survives the compaction window.

## What's deferred

The user explicitly chose "Phase 1 + 2 read seam only" — the write dispatch (Phase 2 step 2), `consolidates` schema change (Validation Q2), migration script (Phase 2 step 4), test updates for the new dual-source writers (~10 tests), `.gitattributes` change, advisory workflow path-filter update, CI gates (Phase 3), and verify/closeout (Phase 4) all land in follow-up sessions.

I attempted the write dispatch in this session and rolled it back when 31 tests across 19 files failed. The root cause was the `consolidates` schema change (existing tests use single-string form) PLUS the new dual-source reader causing raw-file tests to look in the wrong file. The cleanest path was to ship the read seam (which is forward-compatible: missing `change-log.jsonl` is treated as empty) and the immutability guards (which are independent safety improvements that don't change write paths), then defer the dispatch + migration + test updates to a coordinated follow-up.

The deferred state is **safe** — change-logs continue to land in `meta-state.jsonl` via the table write path. The `appendChangeLogEntryAtomic` helper is implemented and ready; the dispatch sites in `writeEntry` and `metaStateBatch` have deferred-routing comments marking exactly where the routing lands. The migration script + test updates ship together so the test corpus asserts the right file from day 1.

## Decisions / lessons

- **Schema change needs the migration to land together.** The `consolidates` schema flip from `z.string()` to `z.array(z.string())` is correct (per Validation Session 1 Q2), but existing tests use the string form. The migration script needs to convert single-string → one-element array BEFORE the schema flip, otherwise ~31 tests break. This is a real risk for the next session — the migration must land in one PR.
- **Dual-source readers need a single-source backward-compat shim.** The new `_readAndParseRegistry` works correctly when `change-log.jsonl` is missing (treats as empty). This is what made shipping the read seam without the migration safe.
- **`tableOnly` is a forward-only helper.** I added `tableOnly(entries)` to project the union back to the table-set before persisting. With the dispatch rolled back, `tableOnly` is wrong (it strips change-logs that are legitimately in the table). With the dispatch enabled, `tableOnly` is correct (it strips change-logs that should stay in `change-log.jsonl`). The helper is kept; the call sites are commented to enable it when the migration lands.

## Open questions for follow-up

1. Does the migration script need a `consolidates` field scan before the schema flip, or can it run at runtime via a Zod `preprocess` that wraps single strings in arrays? The runtime approach is safer for in-flight processes; the migration approach is cleaner for fresh starts.
2. Should the dispatch sites in `writeEntry` and `metaStateBatch` be enabled in the same PR as the migration, or split? The plan calls for "single PR on main, no concurrent registry PRs"; the tests are the blocker, not the implementation.
3. The cold-tier regression test is sensitive to file-index freshness — any file change to a core module needs a paired `meta_state_refresh_file_index` call. This is by design but should be a CI check or a pre-commit hook so we don't have to remember manually.

## Files touched

- `meta-state.jsonl` (data: 313 → 309 lines)
- `tools/learning-loop-mastra/core/read-registry-cache.js` (dual-source cache)
- `tools/learning-loop-mastra/core/loop-introspect-cache.js` (3-SHA cold-tier keys)
- `tools/learning-loop-mastra/core/meta-state.js` (read seam + immutability guards + deferred dispatch comments)
- `tools/learning-loop-mastra/core/meta-state.test.js` (1 test updated for new immutability invariant)
- `file-index.jsonl` (3 fingerprints refreshed)
- `tools/scripts/registry-table.sh` (new)
- `tools/scripts/__tests__/registry-table.test.js` (new)
- `tools/scripts/__fixtures__/registry-one-line-per-id.jsonl` (new)
- `tools/scripts/__fixtures__/registry-versioned.jsonl` (new)
- `plans/reports/cook-260715-1010-GH-tier1-read-seam-and-registry-table-report.md` (new)
