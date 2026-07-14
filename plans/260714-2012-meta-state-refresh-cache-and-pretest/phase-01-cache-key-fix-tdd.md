---
phase: 1
title: "Cache-key Fix (TDD)"
status: completed
priority: P2
dependencies: []
---

# Phase 1: Cache-key Fix (TDD)

## Overview

`core/loop-introspect-cache.js` invalidates the cold-tier sidecar cache only when `meta-state.jsonl` SHA changes. `file-index.jsonl` SHA changes (the canonical drift baseline) are ignored, so pre-existing drift survives across cold-tier calls and silently fails the cold-tier-regression test until a registry edit happens to mask the drift. Add `fileIndexSha256(root)` to both the read (compare) and write (store) paths, plus a unit test that locks the invalidation behavior.

## Requirements

- **Functional:** cold-tier sidecar cache treats both `meta-state.jsonl` and `file-index.jsonl` as the cache key. Either SHA change invalidates the cache.
- **Non-functional:** backward-compatible — existing cached payloads (which only stored `registry_sha256`) read as `{hit:false, reason:"sha_mismatch"}` on the first call after upgrade, then re-populate with both SHAs. No explicit migration needed; the next write is correct.
- **Test isolation:** test must create a temp `meta-state.jsonl` AND a temp `file-index.jsonl` to exercise the new key; cannot share the project root's index (test would mutate shared state).

## Architecture

`readColdTierCache(root, cacheDir)` reads `cached.registry_sha256` AND `cached.file_index_sha256`, compares each to the corresponding current SHA. On either mismatch return `{hit:false, reason:"sha_mismatch"}`.
`writeColdTierCache(root, payload, cacheDir)` includes `file_index_sha256: fileIndexSha256(root)` in the persisted JSON.

**Atomic paired SHA (TOCTOU mitigation — Red Team F8):** `readColdTierCache` MUST perform all `readFileSync` calls BEFORE computing any SHA. Compute both SHAs in-memory, then compare both. This prevents a concurrent writer that lands between the two reads from producing a stale-cache hit. The original code's single-SHA approach had no such window.

`fileIndexSha256(root)` computes `sha256:<hex>` of `file-index.jsonl` (missing file → `null`). Helper lives next to `registrySha256` for symmetry.

## Related Code Files

- Modify: `tools/learning-loop-mastra/core/loop-introspect-cache.js` (add `fileIndexSha256` helper; update both cache functions)
- Modify: `tools/learning-loop-mastra/__tests__/legacy-mcp/loop-describe-cold-cache.test.js` (add new `it()` for file-index SHA invalidation)

## Implementation Steps

1. **Read existing fixture of a passing test.** Re-read `tools/learning-loop-mastra/__tests__/legacy-mcp/loop-describe-cold-cache.test.js` `it("mtime/sha mismatch triggers rebuild")` to mirror the temp-root pattern and avoid re-deriving it.
2. **Write the failing test first (TDD red).** The test MUST live in its own `describe("file-index SHA invalidates cold-tier cache", () => { ... })` block with its own `beforeAll/afterAll` and its own `mkdtempSync` root — sharing the existing file's `beforeAll` `GATE_ROOT` would let a written `file-index.jsonl` leak into the 6 existing `it()` blocks (Red Team F2). Steps:
   - `mkdtempSync` a NEW temp root; set `process.env.GATE_ROOT = root` inside `beforeAll`; clean up in `afterAll`.
   - Write a minimal `meta-state.jsonl` (one `loop-anti-pattern` finding) AND a minimal `file-index.jsonl` (one line: `{"path":"tools/learning-loop-mastra/__tests__/fixtures/a.js","code_fingerprint":"sha256:aaa","updated_at":"2026-07-14T00:00:00.000Z"}`) before the first call. (Without both writes, the test is degenerate — `fileIndexSha256` returns `null` and the SHA never changes.)
   - Build cache via `loopDescribeTool.handler({ tier: "cold" })`. Capture `cachePath = join(root, "records/meta/.cache/loop-describe-cold.json")`.
   - Mutate ONLY `file-index.jsonl` with a NEW byte sequence of different length (overwrite via `writeFileSync`, not append — addresses Red Team F16 / mtime granularity on macOS HFS+). Add or remove a distinct character.
   - Call `loopDescribeTool.handler({ tier: "cold" })` again.
   - Read the on-disk cache file directly; assert `built_at` differs from the previous build. (API response alone is insufficient; assert the on-disk artifact to prove the cache was rebuilt.)
   - **This test must fail against the current code** (current cache is keyed on registry SHA only). Confirm red.
3. **Implement the fix (TDD green).** Edit `tools/learning-loop-mastra/core/loop-introspect-cache.js`:
   - `readFileSync` from `node:fs` is already imported. Add `import { FILE_INDEX_FILENAME } from "./meta-state.js"` (or relative import — read `meta-state.js` exports first to confirm). Or prefer reusing `readFileIndex` from `meta-state.js` so the read cache stays consistent — verify which is cheaper.
   - Add `function fileIndexSha256(root)` mirroring `registrySha256`: `readFileSync(join(root, FILE_INDEX_FILENAME), "utf8")` if exists, else null.
   - Update `readColdTierCache(root, cacheDir)`:
     - **Read both files first** (no SHA computed yet): `registryRaw = existsSync(registryPath) ? readFileSync(registryPath, "utf8") : null`; `fileIndexRaw = existsSync(fileIndexPath) ? readFileSync(fileIndexPath, "utf8") : null`. This eliminates the TOCTOU window between two separate reads (Red Team F8).
     - Compute both SHAs in-memory from the read buffers.
     - Compare `cached.registry_sha256 === currentRegistrySha` AND `cached.file_index_sha256 === currentFileIndexSha`.
     - Return `{ hit:false, reason:"sha_mismatch" }` on either mismatch.
   - Update `writeColdTierCache(root, payload, cacheDir)`:
     - Add `file_index_sha256: fileIndexSha256(root)` next to `registry_sha256`.
4. **Run the new test alone.** `pnpm exec vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/loop-describe-cold-cache.test.js`. Confirm it passes.
5. **Run the full cache test file.** Same command but no filter. Confirm all 7 `it()` blocks (6 existing + 1 new) pass.
6. **Run cold-tier regression (no-regression check, NOT a cache-correctness proof — Red Team F6).** `pnpm exec vitest run tools/learning-loop-mastra/__tests__/legacy-mcp/cold-tier-regression.test.js`. Should stay green — the fix does not regress grounding behavior. The cache-correctness proof lives in the new unit test from step 2, not here.

## Success Criteria

- [ ] New `describe()` block in `loop-describe-cold-cache.test.js` with its own `beforeAll/afterAll` + temp root. Test written first, confirmed to fail against current code, then passes after fix. Asserts on-disk `built_at` differs (not API response).
- [ ] `core/loop-introspect-cache.js` includes `file_index_sha256` in both the read-compare and the write-store paths; reads both files into memory before computing SHAs (TOCTOU mitigation).
- [ ] All 7 tests in `loop-describe-cold-cache.test.js` green.
- [ ] `cold-tier-regression.test.js` green (no-regression check; cache correctness proven by the new unit test, not here).
- [ ] No new transitive imports beyond `FILE_INDEX_FILENAME` from `meta-state.js`.

## Risk Assessment

- **Backward-compat blast radius:** cached files written by the previous code do NOT have `file_index_sha256`. After upgrade, the first cold-tier call returns `{hit:false, reason:"sha_mismatch"}` — equivalent to today's behavior on a registry change. No silent stale-cache hits; no data loss. (Mitigation: the comparison treats `undefined !== null` as a mismatch, which is the safe direction.)
- **Performance:** hashing `file-index.jsonl` is microsecond-scale (live `wc -l` = 47 entries, ~7KB). No measurable cost.
- **`fileIndexSha256` returned as `null` when file is missing.** `readColdTierCache` then computes `null !== cached.file_index_sha256` for an old cache → miss (correct: a missing index is itself a drift signal). For a fresh write with a missing index, the new key is `null`, and a subsequent call with the index still missing re-hits cleanly. Both directions are correct.
- **Concurrent-writer TOCTOU (Red Team F8):** two sequential `readFileSync` calls would expose a window where a parallel `upsertFileIndexEntry` (write-then-rename, atomic at the file level) could land between the two reads, producing a stale-cache hit. Mitigation: read both files into buffers FIRST, then compute both SHAs in-memory from the buffers, then compare. The on-disk cache invalidation logic sees both SHAs from a single consistent snapshot.
- **mtime granularity on coarser filesystems (Red Team F16):** the test must overwrite `file-index.jsonl` with content of different byte length (not append). On macOS HFS+ the 1-second mtime granularity could let the in-process `readFileIndex` cache serve stale content if the appended line keeps the same byte length. The size-change check inside `readFileIndex` (line 608-610 of meta-state.js) catches same-mtime-different-content in O(1) but only when the size actually differs.
- **Read-side and write-side SHA consistency:** both paths must hash the same byte sequence. If `fileIndexSha256` uses `readFileSync` on the live file but `writeColdTierCache` is called from a context where the file has been concurrently written, the persisted SHA may not match a subsequent read. The fix's atomic-read approach in `readColdTierCache` reads once; `writeColdTierCache` reads once (at write time). Different points in time → still safe for cache invalidation because the next read will re-read and compare.
- **Test pollution across `it()` blocks (Red Team F2):** the existing test file shares one `GATE_ROOT` via `beforeAll`. The new test must use its own `describe()` block + its own temp root to avoid leaking `file-index.jsonl` writes into the 6 existing tests.
