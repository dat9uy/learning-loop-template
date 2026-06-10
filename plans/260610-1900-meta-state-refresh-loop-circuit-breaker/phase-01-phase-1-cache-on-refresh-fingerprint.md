---
phase: 1
title: "Cache on refresh fingerprint (TDD)"
status: completed
priority: P2
effort: "1.5h"
dependencies: []
---

# Phase 1: Cache on refresh fingerprint (TDD)

## Overview

Add a process-lifetime idempotency cache to `meta_state_refresh_fingerprint` that dedupes identical `(id, previous_code_fingerprint)` calls within a 60s window. The cache is the structural circuit-breaker for the 53-minute droid-session loop pathology (163 calls / 147 identical errors in 53 minutes). Cache writes happen on `not_grounded`, `code_missing` (no ref case only), and success responses. The `code_missing` (file gone) case is NOT cached because the operator can self-heal by creating the file. Other uncached paths: `entry_not_found`, `context_load_failed`, `update_failed` (transient). TDD: write 4 failing tests first (T1-T4), then add ~30 lines of production code.

## Requirements

- **Functional**: identical calls within 60s return cached result with `cache_hit: true`; different fingerprint or expired TTL is a cache miss with `cache_hit: false`; cache lookup happens after entry-existence check; cache write happens on `not_grounded`, `code_missing` (no ref case), and success paths. The `code_missing` (file gone) case is NOT cached (operator can self-heal).
- **Non-functional**: <1ms cache hit latency; ~20KB max memory footprint at 60s TTL; module-scope test exports for isolation; in-process only (no persistence); lost on MCP server restart (correct behavior).

## Architecture

Module-scope `Map<key, { result, stored_at }>` with lazy TTL expiry on read. Key composition: `id + "::" + (previous_code_fingerprint ?? "null")`. The `entry.code_fingerprint` is captured from the handler-local reference BEFORE `updateEntry` mutates the registry file (confirmed by reading `core/meta-state.js#updateEntry` at line 287, which mutates a local copy and writes the registry file). The cache write pattern matches `core/read-registry-cache.js#invalidateCache` (Map at module scope, explicit invalidation hook) but uses wall-clock TTL instead of mtime-based invalidation.

**Cache lookup insertion point**: after the `if (!entry) { return ... }` check (line 25) and before the `mechanism_check` check (line 33). At that point we have `entry` and know its `code_fingerprint`.

**Cache write insertion points**: at the end of each return path that produces a cacheable response (success, `not_grounded`, `code_missing` with no ref). The `code_missing` (file gone) path is NOT cached — see Step 1.7 for the asymmetric carve-out.

**Process model**: stdio-based single persistent MCP server process (per `tools/learning-loop-mcp/server.js:36-40`). Module-scope state survives across calls within the process. Cache lost on server restart, which is correct (no cross-session staleness).

## Related Code Files

- **Modify**: `tools/learning-loop-mcp/tools/meta-state-refresh-fingerprint-tool.js` — add module-scope cache helpers + 2 test-only exports; insert cache lookup at line 26 area; insert cache writes at success + 2 error paths (~30 lines total)
- **Modify**: `tools/learning-loop-mcp/__tests__/meta-state-refresh-fingerprint-tool.test.js` — add T1, T2, T3, T4 (~140 lines); add `_clearIdempotencyCacheForTests()` to existing 3 tests' `finally` blocks (defensive)

## Implementation Steps

### Step 1.1 — Write failing tests T1, T2, T3, T4 (red)

Append the 4 new tests to the existing `describe("meta_state_refresh_fingerprint tool", ...)` block in `__tests__/meta-state-refresh-fingerprint-tool.test.js`. Use the same `mkdtempSync` + `process.env.GATE_ROOT` + `finally` pattern as the 3 existing tests.

**T1: same `(id, previous_fingerprint)` within 60s returns cached result with `cache_hit: true`**
- Setup: create `src.js` file, file a finding with `evidence_code_ref: "src.js"` and `mechanism_check: true`. Get the id from the registry.
- Call 1: `metaStateRefreshFingerprintTool.handler({ id })`. Assert `parsed.cache_hit === false`, `parsed.status === "refreshed"`.
- Call 2: same handler call. Assert `parsed.cache_hit === true`, `parsed.id`, `parsed.code_fingerprint`, `parsed.refreshed_at` all equal call 1's values (byte-identical response).
- Defensive: `_clearIdempotencyCacheForTests()` before the first call AND in the `finally` block.

**T2: same `id` with different `previous_code_fingerprint` is a cache miss**
- Setup: same as T1, but after the first refresh, call `updateEntry` directly to mutate the entry's `code_fingerprint` to a different value (e.g., `sha256:` + 64 zeros).
- Call 2: `metaStateRefreshFingerprintTool.handler({ id })`. Assert `parsed.cache_hit === false` (new fingerprint is a cache miss), `parsed.code_fingerprint === fp1` (recomputed to the actual file hash).
- Defensive: clear cache before AND after.

**T3: TTL expiry re-runs the handler (cache miss after 60s)**
- Setup: same as T1 (entry has no stored `code_fingerprint` before the first call).
- Call 1: assert cache miss. The cache key written by call 1 is `${id}::null` because `entry.code_fingerprint` was `null` BEFORE the refresh ran. Add an assertion: `assert.ok(_idempotencyCache.has(\`${id}::null\`))` to document this dependency. (Note: if a future refactor changes the cache key to use the post-update fingerprint, T3 will need to update the literal.)
- `_backdateIdempotencyCacheForTests(\`${id}::null\`, 61_000)` — simulates 61s elapsed.
- Call 2: assert `parsed.cache_hit === false` (TTL expired, cache miss).

**T4: 100 identical `not_grounded` calls collapse to 1 miss + 99 hits (the droid-session pathology)**
- Setup: file a finding WITHOUT `mechanism_check: true` (the droid-session scenario).
- Get the id.
- `_clearIdempotencyCacheForTests()`.
- **Sequential loop (not `Promise.all`)**: `for (let i = 0; i < 100; i++) { results.push(await metaStateRefreshFingerprintTool.handler({ id })); }`. Sequential is required because the cache write happens AFTER `await updateEntry(...)` in the success path. With `Promise.all`, all 100 concurrent calls would reach the cache-check (cache miss) before any of them wrote to the cache, producing 100 misses instead of 1 miss + 99 hits.
- Assert exactly 1 miss (`cache_hit === false`) and 99 hits (`cache_hit === true`).
- Assert all 100 responses have `parsed.error === "not_grounded"`.
- Assert all 99 cache-hit responses have the same `code_fingerprint` (or in the `not_grounded` case, the same `id` and `error` fields).
- Optional performance assertion: 100 sequential calls in < 1s.
- Defensive: clear cache before AND after.

### Step 1.2 — Add `_clearIdempotencyCacheForTests()` to existing 3 tests' `finally` blocks (red → green)

**Test file import update (line 6)**: change:
```js
import { metaStateRefreshFingerprintTool } from "../tools/meta-state-refresh-fingerprint-tool.js";
```
to:
```js
import { metaStateRefreshFingerprintTool, _clearIdempotencyCacheForTests } from "../tools/meta-state-refresh-fingerprint-tool.js";
```

**Test body update**: in each of the 3 existing tests (`T-existing-1` at line 16, `T-existing-2` at line 48, `T-existing-3` at line 80), add `_clearIdempotencyCacheForTests();` to the `finally` block (just before the `process.env.GATE_ROOT` restoration).

The 3 existing tests do not currently clear the cache. After Phase 1 ships, the new T1 populates the cache. If T-existing-1 runs after T1, the cache key collides (same `id`?). The import update is a hard requirement; without it, the tests fail to find `_clearIdempotencyCacheForTests` at module-resolution time.

This step makes the existing tests resilient to the new module-scope state. It is green-by-construction (the export is a no-op until the implementation lands in step 1.3). The tests continue to pass.

**Why this works**: Node.js's ESM module loader caches each `*.js` file exactly once per process. The test file imports `meta-state-refresh-fingerprint-tool.js` once at the top; the module-scope `_idempotencyCache` Map is initialized once and shared across all `test()` calls in the file. Within one file, cache cross-contamination is possible but mitigated by the per-test `mkdtempSync` + unique `id` per description. Across files, the module cache is per-process but each `pnpm test` invocation runs all files in a single Node process; the explicit `_clearIdempotencyCacheForTests()` in each `finally` block is defensive belt-and-suspenders.

### Step 1.3 — Add module-scope cache helpers and 2 test-only exports (green)

In `tools/meta-state-refresh-fingerprint-tool.js`:

1. Above the `export const metaStateRefreshFingerprintTool = {` line (currently line 9), add:
   ```js
   // Idempotency cache: same (id, previous_code_fingerprint) within 60s returns
   // the cached response. Keyed on the *stored* fingerprint so a real file change
   // (which mutates entry.code_fingerprint via updateEntry) is automatically a
   // cache miss on the next call. In-process Map; cleared on MCP server restart.
   const _idempotencyCache = new Map();
   const CACHE_TTL_MS = 60_000;
   
   function _cacheKey(id, previousFingerprint) {
     return `${id}::${previousFingerprint ?? "null"}`;
   }
   
   function _cacheGet(key) {
     const entry = _idempotencyCache.get(key);
     if (!entry) return null;
     if (Date.now() - entry.stored_at > CACHE_TTL_MS) {
       _idempotencyCache.delete(key);
       return null;
     }
     return entry;
   }
   
   function _cacheSet(key, result) {
     _idempotencyCache.set(key, { result, stored_at: Date.now() });
   }
   
   // Test-only exports. Production code must not call these.
   export function _clearIdempotencyCacheForTests() {
     _idempotencyCache.clear();
   }
   
   export function _backdateIdempotencyCacheForTests(key, ageMs) {
     const entry = _idempotencyCache.get(key);
     if (entry) entry.stored_at = Date.now() - ageMs;
   }
   ```

### Step 1.4 — Insert cache lookup after `if (!entry)` check (green)

In the handler, after the `if (!entry) { return ... }` block (currently lines 23-31) and before the `if (entry.mechanism_check !== true)` check (currently line 33), insert:

```js
// Cache lookup: same (id, previous_fingerprint) within 60s returns the cached response.
const cacheKey = _cacheKey(id, entry.code_fingerprint);
const cached = _cacheGet(cacheKey);
if (cached) {
  return {
    content: [{ type: "text", text: JSON.stringify({ ...cached.result, cache_hit: true }) }],
  };
}
```

This sits in the handler body, after `entry` is loaded. The `entry.code_fingerprint` is the *previous* (stored) fingerprint, captured from the handler-local reference.

### Step 1.5 — Insert cache write at the success path (green)

In the success path (currently lines 85-95), replace the existing return with:

```js
const refreshed_at = new Date().toISOString();
const resultObj = { id, code_fingerprint: hash, refreshed_at, status: "refreshed" };
_idempotencyCache.set(_cacheKey(id, entry.code_fingerprint), { result: resultObj, stored_at: Date.now() });
appendGateLog(root, {
  timestamp: refreshed_at,
  tool: "meta_state_refresh_fingerprint",
  id,
  code_fingerprint: hash,
  refreshed_at,
});
return {
  content: [{ type: "text", text: JSON.stringify({ ...resultObj, cache_hit: false }) }],
};
```

### Step 1.6 — Insert cache write at `not_grounded` path (green)

At the end of the `not_grounded` return (currently line 33-41), before the `return {`, build the response and cache it. Replace:

```js
if (entry.mechanism_check !== true) {
  const resultObj = { error: "not_grounded", id, mechanism_check: entry.mechanism_check ?? null, reason: "mechanism_check is not true; nothing to refresh" };
  _idempotencyCache.set(_cacheKey(id, entry.code_fingerprint), { result: resultObj, stored_at: Date.now() });
  return {
    content: [{ type: "text", text: JSON.stringify({ ...resultObj, cache_hit: false }) }],
  };
}
```

### Step 1.7 — Insert cache write at the `code_missing` (no ref) path only (green)

**Asymmetric carve-out**: cache the `code_missing` (no ref) return (line 43-52) — this is a structural error (the entry has no `evidence_code_ref` field at all; the operator cannot self-heal by creating a file). Do **NOT** cache the `code_missing` (file gone) return (line 63-72) — this is transient (the operator can create the file at `evidence_code_ref`, and the next call must observe the change immediately, not 60s later).

This asymmetric treatment prevents a 60s "stale code_missing" window after the operator creates the file. The cache write insertion at the (file gone) path is removed. The error response for the (file gone) path still includes `cache_hit: false` (it was a miss because not cached), but the cache is not populated.

For the (no ref) path (line 43-52):
```js
if (typeof rawCodeRef !== "string") {
  const resultObj = { error: "code_missing", id, evidence_code_ref: null };
  _idempotencyCache.set(_cacheKey(id, entry.code_fingerprint), { result: resultObj, stored_at: Date.now() });
  return {
    content: [{ type: "text", text: JSON.stringify({ ...resultObj, cache_hit: false }) }],
  };
}
```

For the (file gone) path (line 63-72), no cache write. The catch block returns the error without populating the cache, matching the carve-out rationale.

### Step 1.8 — Update tool description (green)

Append to the tool's `description` field (line 11) the sentence:
> "Returns the same response within 60s for identical (id, previous_fingerprint) calls; look for `cache_hit: true` in the response. For drift detection, use `meta_state_check_grounding`."

This teaches the agent about the cache and points drift detection to the correct tool.

### Step 1.9 — Run tests and verify (green)

Run `pnpm test` from the project root. The 4 new tests pass; the 3 existing tests still pass (with the defensive `_clearIdempotencyCacheForTests()` calls).

## Success Criteria

- [ ] T1 passes: same `(id, fingerprint)` within 60s returns cached result with `cache_hit: true`.
- [ ] T2 passes: different `code_fingerprint` is a cache miss.
- [ ] T3 passes: backdated entry past TTL is a cache miss.
- [ ] T4 passes: 100 identical `not_grounded` calls produce 1 miss + 99 hits, all `error: "not_grounded"`.
- [ ] All 3 existing tests pass with `_clearIdempotencyCacheForTests()` in their `finally` blocks.
- [ ] Tool description mentions the cache and points drift detection to `meta_state_check_grounding`.
- [ ] No regressions in `pnpm test`.

## Risk Assessment

- **Stale hash on silent file change** — covered by the tool description update (Step 1.8). The droid-session storm is the case where the file is NOT changing, so the cache is correct.
- **Module-scope state pollutes tests** — covered by `_clearIdempotencyCacheForTests()` in every test's `finally` block. The 2 test-only exports (clear + backdate) are sufficient for the 4 test cases.
- **`entry_not_found`, `context_load_failed`, `update_failed` not cached** — explicitly carved out. The cache only stores `not_grounded`, `code_missing` (no ref case), and success responses. The 3 uncached paths are transient or non-entry-specific; caching them would be wrong. The `code_missing` (file gone) case is also not cached (asymmetric carve-out: operator can self-heal).
- **Performance: 100 cache hits in < 1s** — Map lookup is O(1); the entire handler body is skipped on a hit. The T4 performance assertion is a smoke test, not a benchmark.
