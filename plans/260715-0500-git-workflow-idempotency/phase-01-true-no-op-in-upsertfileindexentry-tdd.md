---
phase: 1
title: "True No-Op in upsertFileIndexEntry (TDD)"
status: pending
priority: P2
effort: "low"
dependencies: []
---

# Phase 1: True No-Op in upsertFileIndexEntry (TDD)

## Overview

Make `upsertFileIndexEntry` a content no-op: when the incoming `hash` equals the stored hash for that key, skip the rewrite entirely. This is the load-bearing idempotency fix — re-seeding with zero code change produces zero `git diff`, and `file-index.jsonl` SHA stays stable so the cold-tier cache (keyed on that SHA per PR #58) stays warm.

## Requirements

- **Functional:** re-upserting an unchanged `(key, hash)` writes nothing to disk (no tmp file, no rename, no `updated_at` re-stamp). Re-upserting a *changed* hash behaves exactly as today (full rewrite, new `updated_at` on all rows — unchanged, matches existing contract for real edits). New-key upsert behaves as today.
- **Non-functional:** async-safe — the no-op check runs inside the per-root `enqueue` callback so concurrent upserts of the same key stay serialized (identical hash → both no-op; differing hash → last-writer-wins, same as today). No new allocations on the hot no-op path beyond the existing `readFileIndex` clone.

## Architecture

`core/meta-state.js:679-711` — inside `enqueue(root, () => { ... })`, after `const map = new Map(readFileIndex(root));`, compare `map.get(key)` to the incoming `hash`. If equal, return `true` without writing. The `enqueue` serialization is preserved (the check happens under the queue lock, so a concurrent writer that changed the hash between read and write is still safe — last writer's check sees the updated map).

```
return enqueue(root, () => {
  const map = new Map(readFileIndex(root));
  if (map.get(key) === hash) return true;   // ← no-op early return
  map.set(key, hash);
  const lines = [...map.entries()].map(...);
  // ... existing tmp+rename+invalidate ...
  return true;
});
```

Note on `findings_regrounded`: the count is computed in `meta-state-refresh-file-index-tool.js:79-83` **before** the upsert and is registry-derived. A no-op upsert does not change it. No tool-side change is required for correctness. (Optional refinement in Phase 3: return `status: "no-op"` / `cache_hit: true` on an unchanged path — not required for this phase.)

## Related Code Files

- **Modify:** `tools/learning-loop-mastra/core/meta-state.js` (lines 679-711 `upsertFileIndexEntry`; JSDoc 673-677)
- **Modify (test):** `tools/learning-loop-mastra/__tests__/legacy-mcp/file-index.test.js` (add no-op test)

## Implementation Steps (TDD — tests first)

1. **Write the failing test** in `file-index.test.js` (inside the `describe("file-index sidecar helpers")` block, reusing `VALID_HASH`, `makeRoot`, `_resetFileIndexCacheForTests`):
   - Seed `upsertFileIndexEntry(root, "a.js", VALID_HASH)`, then read the file bytes (`readFileSync(getFileIndexPath(root), "utf8")`) and its mtime.
   - Re-upsert the **same** `(root, "a.js", VALID_HASH)`.
   - Assert the file bytes are byte-identical (`===` the prior snapshot) and mtime unchanged → no rewrite occurred.
   - Then upsert a **changed** hash (`VALID_HASH_2`) for a *different* key `"b.js"`, and assert `"a.js"`'s row still carries its original `updated_at` (unchanged row preserved) while `"b.js"` is present — real writes still work.
   - Also assert: a no-op re-upsert of `"a.js"` after the `"b.js"` write still leaves `"a.js"`'s `updated_at` unchanged (the no-op must not re-stamp even when other rows were written in between).
2. **Run the new test, confirm it fails** the way expected: today's code rewrites all rows on every upsert, so the byte-snapshot will differ (timestamp churn). `npx vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/file-index.test.js -t "no-op"`.
3. **Implement the early-return** (`if (map.get(key) === hash) return true;`) inside the `enqueue` callback in `upsertFileIndexEntry`, after the clone and before `map.set`.
4. **Run the new test, confirm it passes.** Run the full `file-index.test.js` to confirm no regression (the existing "overwrite" / "two distinct paths" tests still pass because they use *changed* hashes).
5. **Update the JSDoc** at `meta-state.js:673-677`: change "`updated_at` is stamped with the current time" → "`updated_at` is stamped with the current time when the entry is new or its hash changed; an unchanged-hash re-upsert is a no-op that touches nothing." Update the `@returns` sentence to note the no-op returns `true`.
6. **Verify the cache invariant still holds**: the existing `cache_hit`/clone/finally-invalidate tests (F11, clone-before-mutate, failed-write phantom) must still pass — the no-op path returns before any write and before any cache invalidation, which is correct (nothing changed → cache stays valid).

## Success Criteria

- [ ] New no-op test fails before the change (byte diff on unchanged re-upsert) and passes after.
- [ ] Re-upsert of unchanged `(key, hash)` → file bytes and mtime unchanged.
- [ ] Re-upsert of a *changed* hash → file rewritten, changed row's `updated_at` moves, unchanged rows' `updated_at` preserved (not all 47 rows re-stamped).
- [ ] All existing `file-index.test.js` tests pass; no regression in `check-grounding`, cold-tier-regression, or gate tests (`pnpm test`).
- [ ] JSDoc updated to describe the no-op contract.

## Risk Assessment

- **Async ordering:** the no-op check is inside `enqueue`, so two concurrent upserts of the same key with different hashes are still last-writer-wins (the second reads the map after the first wrote). Identical-hash concurrent upserts both no-op. No new race. The existing per-root queue is the guarantee — do not move the check outside the queue.
- **Cache honesty:** the no-op returns `true` without calling `_invalidateFileIndexCache`. This is correct — the file did not change, so the cached map is still accurate. Verified by the F11 cache test.
- **Contract drift:** only the JSDoc "always stamp" line changes. `findings_regrounded` is registry-derived and does not shift. `meta_state_refresh_file_index` will still return `status: "refreshed"` / `cache_hit: false` on an unchanged path — slightly misleading but not incorrect; refine in Phase 3 if desired.
- **`SKIP_PRESEED` interaction:** the seed script is unchanged in this phase; the no-op only makes its *no-change* runs free. `SKIP_PRESEED=1` still skips entirely (unaffected).