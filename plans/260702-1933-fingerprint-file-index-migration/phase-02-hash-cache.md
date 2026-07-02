---
phase: 2
title: "Hash Cache"
status: pending
priority: P2
dependencies: [1]
---

# Phase 2: Hash Cache

## Overview

Add an in-process `(absPath, mtimeMs)` -> `hash` cache in the check-grounding **tool layer** so repeated `checkGrounding` calls on an unchanged file skip the disk read + re-hash. Kills the finding's named "compute is O(n) per check" cost and speeds the cold-tier test (one `checkGrounding` per finding). Pure additive; `checkGrounding` itself is untouched this phase.

## Requirements

- Functional: a `Map<"\${absPath}:\${mtimeMs}", hash>` invalidated by mtime change. `computeFileHash` stays pure (unchanged); the cache wraps the call site in the tool layer (`meta-state-check-grounding-tool.js`) and the future refresh tool.
- Non-functional: process-lifetime cache (mirrors `testRunCache` in the same file). Same invalidation key shape the read-registry cache already uses (`mtimeMs`).

## Architecture

- Co-locate with the existing `testRunCache` in `meta-state-check-grounding-tool.js` (already documented as a duplicated pattern; the cache block comments say "same pattern as SP1"). Add `hashCache = new Map()` alongside it.
- Helper `computeFileHashCached(absPath, stat)` -> checks cache, else `computeFileHash(absPath)`, stores, returns. Used by the tool layer when it needs the live hash (Phase 3 routing may move the cache call; this phase wires the helper).
- **Cache key (red-team F8):** `\${absPath}:\${mtimeMs}:\${size}` — include `size`, mirroring `read-registry-cache.js` (which documents why: some filesystems have coarse mtime granularity; the size check catches same-mtime-different-content in O(1)). Omitting `size` creates a stale-hash window where a same-mtime rewrite returns the old hash and masks drift.
- `computeFileHash` in `core/check-grounding.js` stays **unchanged** — the pure function remains pure; caching is a tool-layer concern.

## Related Code Files

- Modify: `tools/learning-loop-mastra/tools/legacy/meta-state-check-grounding-tool.js` (add `hashCache` + `computeFileHashCached`).
- Reference: `tools/learning-loop-mastra/core/check-grounding.js#computeFileHash` (no change).
- Reference: `tools/learning-loop-mastra/core/read-registry-cache.js:15-17` (the mtime+size precedent + its "why").
- Reference: existing `testRunCache` block (lines ~12-56) as the precedent for the cache pattern.

## Implementation Steps

1. Add `hashCache = new Map()` and `computeFileHashCached(absPath, stat)` next to `testRunCache`. `stat = statSync(absPath)`.
2. Key = `\${absPath}:\${stat.mtimeMs}:\${stat.size}`. On hit, return cached hash. On miss, `computeFileHash(absPath)`, store, return.
3. Export `_clearHashCacheForTests()` mirroring `_clearIdempotencyCacheForTests`.
4. Do NOT wire into `checkGrounding` yet — the cache is used by the tool layer's hash computation. Wiring lands in Phase 3.

## Success Criteria (TDD — tests first)

- [ ] **New test** `__tests__/legacy-mcp/hash-cache.test.js`:
  - Same `(absPath, mtimeMs, size)` twice -> `computeFileHash` called once (spy/counter), cached second time.
  - mtime change -> cache miss -> re-hash.
  - **size change with same mtime -> cache miss -> re-hash (F8).**
  - Different absPath -> independent cache entries.
  - `_clearHashCacheForTests()` clears it.
- [ ] **Existing behavior unchanged:** `check-grounding.test.js` (30 tests) + `cold-tier-regression` still green (cache not wired into the pure function).
- [ ] `computeFileHash` pure function signature and behavior unchanged.

## Risk Assessment

- **Risk (red-team F8):** same-mtime-different-content rewrite returns stale hash -> masks drift. **Mitigation:** key includes `size` (mirrors `read-registry-cache.js`); test covers the same-mtime/changed-size case.
- **Risk:** stale cache if file changes between stat and read (TOCTOU). **Mitigation:** key includes mtimeMs+size; a changed file has a new mtime or size -> cache miss.
- **Risk:** memory growth if many distinct paths cached. **Low** — bounded by distinct cited paths (~24). If cited-path set grows, add an LRU cap (mirrors `read-registry-cache`'s LRU intent).
- **Rollback:** remove the cache helper; `computeFileHash` call site reverts to direct call.
