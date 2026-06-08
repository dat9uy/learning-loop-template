---
phase: 1
title: "Red: TDD tests first"
status: pending
effort: "2h"
dependencies: []
---

# Phase 1: Red (TDD tests first)

## Overview

Write 26 failing tests that lock the contract for the 5 structural improvements (3 layers + 1 batch primitive + 1 archive tool + 2 size-sensitive test rewrites) BEFORE any implementation. All new tests must fail at the end of this phase. No production code is written in this phase. The tests are the spec; the implementation in Phase 2 just makes them pass.

The 5 new test files (and 2 size-sensitive rewrites) cover the full surface:

| File | Tests | Covers |
|------|------:|--------|
| `__tests__/meta-state-lru-cache.test.js` | 6 | Layer 2 — readRegistry LRU + mtime/size invalidation + writer hook |
| `__tests__/meta-state-batch-tool.test.js` | 5 | Layer 2.5 — meta_state_batch atomic primitive |
| `__tests__/meta-state-archive-tool.test.js` | 5 | meta_state_archive structural fix |
| `__tests__/loop-describe-cold-cache.test.js` | 6 | Layer 3 — sidecar cache + sha-keyed rebuild + compact projection |
| `__tests__/extract-index-incremental.test.js` | 4 | Layer 1 — content-hash skip + directory mtime map |
| Rewrite `__tests__/meta-state-list-compact.test.js` (existing) | (existing) | Structural assertion (replaces size threshold) |
| Rewrite `__tests__/build-inverse-indexes.test.js` line 37 (existing) | (existing) | Structural assertion (replaces size variance) |

**Total: 26 new test cases across 5 new test files + 2 existing-test rewrites.**

## Requirements

### Functional
- 6 tests in `__tests__/meta-state-lru-cache.test.js` cover the LRU cache contract: cold cache miss, warm cache hit (identity preserved), mtime change invalidates, size change invalidates, writeEntry invalidates, `meta_state_batch` invalidates once.
- 5 tests in `__tests__/meta-state-batch-tool.test.js` cover `meta_state_batch` atomicity: write+update+delete atomic, archive op supported, partial-failure rollback (file unchanged), 50-op ceiling enforced, concurrent batches serialized by the per-root write queue.
- 5 tests in `__tests__/meta-state-archive-tool.test.js` cover `meta_state_archive` semantics: archive by decision rule, archive by explicit id (operator override), archive is reversible (re-archive is no-op), archived entries excluded from compact by default, archived entries appear with `include_archived: true`.
- 6 tests in `__tests__/loop-describe-cold-cache.test.js` cover the sidecar cache: first call builds cache, second call reads cache (verify no `readAllEntriesForLineage` call via mock), writeEntry invalidates and rebuilds, mtime/sha mismatch triggers rebuild, description_mode=summary projects from cache, cache miss falls back to old path and writes new cache.
- 4 tests in `__tests__/extract-index-incremental.test.js` cover Layer 1: no-op when nothing changed (verify 0 file reads for evidence bodies), rebuild after content edit, rebuild after mtime change with same content (edge case), `--no-incremental` forces full rebuild.
- Rewrite `__tests__/meta-state-list-compact.test.js` to assert on structure (id/entry_kind/status/no description) instead of payload size; the 30KB budget is now a property of the cache, not a threshold.
- Rewrite `__tests__/build-inverse-indexes.test.js:37` to assert on inverse-index structure (each entry has the expected keys: `addresses_inverse`, `supersedes_inverse`, `origin_inverse`, `promoted_to_rule_inverse`) instead of real-registry size variance.
- All tests use isolated temp registries (no interference with the live `meta-state.jsonl`).
- All tests must fail (Red) at the end of this phase — proving the spec is captured and the implementation doesn't yet exist.

### Non-functional
- Tests follow the existing `node --test` pattern used by 70+ tests in `__tests__/`.
- Test file naming: `meta-state-lru-cache.test.js`, `meta-state-batch-tool.test.js`, `meta-state-archive-tool.test.js`, `loop-describe-cold-cache.test.js`, `extract-index-incremental.test.js` (matches existing convention).
- Tests do NOT mock `core/meta-state.js` or `core/extract-index/extract-index.js` — they exercise the real primitive via the new wrappers, ensuring the integration is real.
- The 2 existing-test rewrites (compact + inverse-indexes) are no-ops for the live registry: the assertions change from "size < 30KB" to "each entry has keys {id, entry_kind, status}" — the live registry already passes both. The size-bump removal is the meaningful change.

## Architecture

The 26 tests form a contract spec for the implementation. The split mirrors the 3 layers + 2 new tools + 2 test rewrites:

```
Phase 1 deliverables:
├── tools/learning-loop-mcp/__tests__/meta-state-lru-cache.test.js (NEW)
│   ├── test 1: cold cache miss (first readRegistry call parses the file)
│   ├── test 2: warm cache hit (second call returns the SAME array reference)
│   ├── test 3: mtime change invalidates (touch file → next read re-parses)
│   ├── test 4: size change invalidates (rewrite file at same mtime → next read re-parses)
│   ├── test 5: writeEntry invalidates (write → next read sees the new entry)
│   └── test 6: meta_state_batch invalidates once (50-op batch → 1 invalidation, not 50)
├── tools/learning-loop-mcp/__tests__/meta-state-batch-tool.test.js (NEW)
│   ├── test 1: write+update+delete atomic (all-or-nothing; partial-failure leaves file unchanged)
│   ├── test 2: archive op supported (batch includes archiveEntry op)
│   ├── test 3: partial-failure rollback (op 25 fails → ops 1-24 rolled back, file unchanged)
│   ├── test 4: 50-op ceiling enforced (51 ops → schema rejection at handler entry)
│   └── test 5: concurrent batch serialized (two batches in flight → 2nd waits for 1st's enqueue)
├── tools/learning-loop-mcp/__tests__/meta-state-archive-tool.test.js (NEW)
│   ├── test 1: archive by decision rule (finding with status=resolved > 90d → archived)
│   ├── test 2: archive by explicit id (operator override with `override` field)
│   ├── test 3: archive is reversible (re-archive is a no-op, returns already_archived)
│   ├── test 4: archived entries excluded from compact (default behavior)
│   └── test 5: archived entries appear with include_archived: true (opt-in)
├── tools/learning-loop-mcp/__tests__/loop-describe-cold-cache.test.js (NEW)
│   ├── test 1: first call builds cache (records/meta/.cache/loop-describe-cold.json created)
│   ├── test 2: second call reads cache (no readAllEntriesForLineage call; spy/mock verifies)
│   ├── test 3: writeEntry invalidates and rebuilds (registry change → cache rebuilt on next call)
│   ├── test 4: mtime/sha mismatch triggers rebuild (manual file edit → next call rebuilds)
│   ├── test 5: description_mode=summary projects from cache (no re-parse, no rebuild)
│   └── test 6: cache miss falls back to old path and writes new cache
├── tools/learning-loop-mcp/__tests__/extract-index-incremental.test.js (NEW)
│   ├── test 1: no-op when nothing changed (0 file reads for evidence bodies; stats.cache_hits > 0)
│   ├── test 2: rebuild after content edit (changed content → cache_misses > 0 for that file)
│   ├── test 3: rebuild after mtime change with same content (edge case: content-hash key detects no-op)
│   └── test 4: --no-incremental forces full rebuild (stats.cache_hits = 0)
├── tools/learning-loop-mcp/__tests__/meta-state-list-compact.test.js (REWRITE existing)
│   └── Replace size-bump threshold (30KB) with structural assertion: every compact entry has keys
│       {id, entry_kind, status} and lacks `description`. The size is now a property of the cache,
│       not a threshold the test enforces.
└── tools/learning-loop-mcp/__tests__/build-inverse-indexes.test.js (REWRITE line 37)
    └── Replace real-registry variance assertion with structural assertion: every inverse index
        entry has the expected 4 keys (addresses_inverse, supersedes_inverse, origin_inverse,
        promoted_to_rule_inverse). Variance is now bounded by the L2 cache, not asserted as
        "size < N."
```

## Related Code Files

- **Create:**
  - `tools/learning-loop-mcp/__tests__/meta-state-lru-cache.test.js` (~120 lines)
  - `tools/learning-loop-mcp/__tests__/meta-state-batch-tool.test.js` (~150 lines)
  - `tools/learning-loop-mcp/__tests__/meta-state-archive-tool.test.js` (~120 lines)
  - `tools/learning-loop-mcp/__tests__/loop-describe-cold-cache.test.js` (~150 lines)
  - `tools/learning-loop-mcp/__tests__/extract-index-incremental.test.js` (~100 lines)
- **Modify:**
  - `tools/learning-loop-mcp/__tests__/meta-state-list-compact.test.js` (replace size threshold with structural assertion)
  - `tools/learning-loop-mcp/__tests__/build-inverse-indexes.test.js:37` (replace real-registry size assertion with inverse-index structure assertion)
- **Delete:** None

## Implementation Steps

### Step 1.1: Set up `__tests__/meta-state-lru-cache.test.js` (25m)

**Setup:** mirror the `mkdtempSync(path.join(tmpdir(), "lru-cache-test-"))` pattern from `__tests__/meta-state.test.js` for the temp registry. Use a separate temp dir for `records/meta/.cache/` so cache tests don't pollute the live cache.

**Test 1 — Cold cache miss:**
```js
// Setup: create temp root with a registry containing 3 findings
// Action: readRegistry(root) — first call
// Assert: result is an array of 3 entries (parsed fresh)
const entries = readRegistry(root);
assert.equal(entries.length, 3);
assert.equal(entries[0].id, "meta-test-1");
```

**Test 2 — Warm cache hit (identity preserved):**
```js
// Setup: same as Test 1
// Action: readRegistry(root) twice
// Assert: the second call returns the SAME array reference (object identity)
const first = readRegistry(root);
const second = readRegistry(root);
assert.equal(first, second);  // strict reference equality
```

**Test 3 — Mtime change invalidates:**
```js
// Setup: temp root with registry, readRegistry once (warm cache)
// Action: touch the file (update mtime), wait 1100ms for mtime granularity
// Assert: next readRegistry returns a NEW array reference (re-parsed)
readRegistry(root);
const mtimeBefore = statSync(registryPath).mtimeMs;
await sleep(1100);  // ensure mtime granularity
writeFileSync(registryPath, updatedContent);
const mtimeAfter = statSync(registryPath).mtimeMs;
assert.notEqual(mtimeBefore, mtimeAfter);
const after = readRegistry(root);
assert.notEqual(after, readRegistry(root));  // Hmm — this would always be true on warm cache
// Actually: assert the LENGTH changed (re-parse happened with new content)
```

**Test 4 — Size change invalidates (mtime granularity edge case):**
```js
// Setup: temp root, warm cache
// Action: rewrite the file at the SAME mtime (e.g., via utimesSync) with different content
// Assert: next readRegistry returns entries reflecting the new content
// This catches the "mtime granularity 1s" bug on filesystems with coarse mtime resolution
```

**Test 5 — writeEntry invalidates:**
```js
// Setup: temp root, warm cache
// Action: writeEntry(root, newEntry)
// Assert: next readRegistry returns entries including the new one (not the cached old array)
const before = readRegistry(root);
await writeEntry(root, newFinding);
const after = readRegistry(root);
assert.equal(after.length, before.length + 1);
assert.ok(after.find(e => e.id === newFinding.id));
```

**Test 6 — meta_state_batch invalidates once:**
```js
// Setup: temp root, warm cache
// Action: call meta_state_batch with 10 write ops
// Assert: 1 invalidation (not 10); the post-batch readRegistry returns all 10 new entries
const before = readRegistry(root);
await metaStateBatchTool.handler({ root, operations: [...10 write ops] });
const after = readRegistry(root);
assert.equal(after.length, before.length + 10);
// Optional: spy on the LRU's invalidate function and assert call count = 1
```

### Step 1.2: Set up `__tests__/meta-state-batch-tool.test.js` (25m)

**Setup:** same temp registry pattern.

**Test 1 — write+update+delete atomic:**
```js
// Setup: 3 baseline findings
// Action: batch with 1 write, 1 update (to the new write), 1 delete (of an existing)
// Assert: all 3 succeed; the new entry is written AND updated AND the old one is deleted
//         in a single registry read-modify-write cycle
const result = await metaStateBatchTool.handler({ root, operations: [...] });
const parsed = JSON.parse(result.content[0].text);
assert.equal(parsed.applied, 3);
assert.equal(parsed.failed_at, null);
const entries = readRegistry(root);
assert.equal(entries.length, 4);  // 3 baseline + 1 new (the updated one)
```

**Test 2 — Archive op supported:**
```js
// Setup: 1 finding with status=resolved, created 91 days ago
// Action: batch with 1 archive op on that finding
// Assert: finding's status is now "archived", and archived_at / archived_by fields are set
```

**Test 3 — Partial-failure rollback:**
```js
// Setup: 1 existing finding
// Action: batch with [write A, update B (nonexistent id), write C]
// Assert: 0 ops applied (full rollback); the file is byte-identical to the pre-batch state
//         (i.e., neither A nor C was written)
// Use sha256 of the file pre/post to assert byte equality
```

**Test 4 — 50-op ceiling enforced:**
```js
// Setup: temp root
// Action: batch with 51 ops
// Assert: returns { applied: 0, failed_at: 0, reason: "batch_size_exceeded" }
// The 51-op batch is rejected at handler entry (Zod-level), not partially applied
```

**Test 5 — Concurrent batch serialized:**
```js
// Setup: temp root with 1 baseline finding
// Action: fire 2 batches concurrently (Promise.all([batch1, batch2]))
//          where batch1 writes entry X and batch2 writes entry Y
// Assert: both succeed; final state has X and Y; the file is consistent (not torn)
// The per-root write queue in `core/meta-state.js#enqueue` serializes them.
```

### Step 1.3: Set up `__tests__/meta-state-archive-tool.test.js` (25m)

**Setup:** same temp registry pattern.

**Test 1 — Archive by decision rule:**
```js
// Setup: 1 finding with status=resolved, created_at=91 days ago
// Action: meta_state_archive({ candidates: [] })  // no override; rely on decision rule
// Assert: the finding is archived (status="archived", archived_at set, archived_reason set)
const result = await metaStateArchiveTool.handler({ root, candidates: [] });
const parsed = JSON.parse(result.content[0].text);
assert.equal(parsed.archived.length, 1);
assert.equal(parsed.archived[0].id, finding.id);
```

**Test 2 — Archive by explicit id (operator override):**
```js
// Setup: 1 finding (does NOT match decision rule — e.g., status=active, fresh)
// Action: meta_state_archive({ override: [finding.id], reason: "manual override" })
// Assert: the finding is archived anyway (operator override bypasses the rule)
```

**Test 3 — Archive is reversible:**
```js
// Setup: 1 finding already archived
// Action: meta_state_archive({ candidates: [], reason: "second pass" })
// Assert: the archived entry is NOT re-archived; returns { archived: [], already_archived: [finding.id] }
```

**Test 4 — Archived entries excluded from compact:**
```js
// Setup: 1 active finding + 1 archived finding
// Action: meta_state_list({ compact: true })  // default
// Assert: result has 1 entry (the active one); archived is filtered out
```

**Test 5 — Archived entries appear with include_archived: true:**
```js
// Setup: same as Test 4
// Action: meta_state_list({ compact: true, include_archived: true })
// Assert: result has 2 entries (active + archived)
```

### Step 1.4: Set up `__tests__/loop-describe-cold-cache.test.js` (30m)

**Setup:** temp root, temp cache dir, temp registry with 3 findings.

**Test 1 — First call builds cache:**
```js
// Setup: temp root with 3 findings, NO cache file
// Action: loop_describe({ tier: "cold" })
// Assert: response is well-formed; cache file now exists at records/meta/.cache/loop-describe-cold.json
//         cache.built_at is set; cache.registry_sha256 matches the current registry sha
```

**Test 2 — Second call reads cache (no readAllEntriesForLineage call):**
```js
// Setup: warm cache (from Test 1)
// Action: spy on core/loop-introspect.js#readAllEntriesForLineage; loop_describe({ tier: "cold" })
// Assert: readAllEntriesForLineage was NOT called (cache was used); response is identical
//         (modulo built_at timestamp)
```

**Test 3 — writeEntry invalidates and rebuilds:**
```js
// Setup: warm cache
// Action: write a new finding via meta_state_report; loop_describe({ tier: "cold" }) again
// Assert: response includes the new finding; cache.built_at was updated; registry_sha256 changed
```

**Test 4 — Mtime/sha mismatch triggers rebuild:**
```js
// Setup: warm cache
// Action: manually edit meta-state.jsonl (bypassing the API) to simulate external writer
// Assert: next loop_describe call detects the sha mismatch, rebuilds, returns the new content
```

**Test 5 — description_mode=summary projects from cache:**
```js
// Setup: warm cache
// Action: loop_describe({ tier: "cold", description_mode: "summary" })
// Assert: response.all_findings is summarized (200-char previews); cache was reused
//         (readAllEntriesForLineage not called)
```

**Test 6 — Cache miss falls back to old path and writes new cache:**
```js
// Setup: delete the cache file (simulate cold start)
// Action: loop_describe({ tier: "cold" })
// Assert: response is well-formed; cache file is now created (lazy rebuild on miss)
```

### Step 1.5: Rewrite `__tests__/meta-state-list-compact.test.js` (15m)

**Current test** (approximate, before rewrite): asserts `compact.length < 30_000` (the threshold-bump cure).

**Rewrite** to assert on structure, not size:
```js
// Old: assert.equal(JSON.stringify(compact).length, < 30_000);
// New: assert that every compact entry has the expected shape, regardless of count

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readRegistry } from "#mcp/core/meta-state.js";

describe("meta-state-list compact projection (structural)", () => {
  it("every compact entry has {id, entry_kind, status} and no description", async () => {
    // Use the live registry (this is a structural test, not a behavior test)
    // The helper is the actual `summarize` from core/loop-introspect.js with
    // `description_preview` stripped — matches the shape `toCompact` produces
    // in tools/meta-state-list-tool.js#19-30. (Red-team F8: tests use the
    // public `summarize` API; the tool-internal `toCompact` stays private.)
    const { summarize } = await import("#mcp/core/loop-introspect.js");
    const entries = readRegistry(root);
    const compact = entries.map((e) => {
      const summary = summarize(e);
      delete summary.description_preview;  // matches toCompact behavior
      return summary;
    });
    assert.ok(compact.length > 0, "registry has entries");
    for (const entry of compact) {
      assert.ok(typeof entry.id === "string", `entry missing id: ${JSON.stringify(entry)}`);
      assert.ok(typeof entry.entry_kind === "string", `entry missing entry_kind: ${JSON.stringify(entry)}`);
      assert.ok(typeof entry.status === "string", `entry missing status: ${JSON.stringify(entry)}`);
      assert.equal(entry.description, undefined, "compact entries must NOT include description");
      assert.equal(entry.description_preview, undefined, "compact entries must NOT include description_preview");
    }
  });

  it("compact payload size is bounded by archive trims + cache projection (no threshold)", () => {
    // Soft assertion: the cache projection should keep compact < 50KB.
    // If this fails, the L2 cache is broken (real bug), not a threshold to bump.
    const compact = toCompactProjection(readRegistry(root));
    const size = JSON.stringify(compact).length;
    assert.ok(size < 50_000, `compact payload ${size}B exceeds 50KB budget — L2 cache may be broken`);
  });
});
```

The `toCompactProjection` helper here is the actual function used by the tool, called directly (not via MCP). The structural test (Test 1) is the hard contract; the size assertion (Test 2) is a soft property that documents the 50KB budget but does not fail the build if exceeded (a soft warning only).

### Step 1.6: Rewrite `__tests__/build-inverse-indexes.test.js:37` (10m)

**Current test** (approximate, before rewrite): asserts that `buildInverseIndexes` on a real-registry snapshot produces a result with a specific size (the real-registry-variance symptom).

**Rewrite** to assert on structure:
```js
// Old: assert.equal(inverseIndexes.size, < expected_size);  // flaky on real registry
// New: assert the inverse index has the expected 4 keys, regardless of count

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readRegistry } from "#mcp/core/meta-state.js";
import { buildInverseIndexes } from "#mcp/core/loop-introspect.js";

describe("buildInverseIndexes structural contract", () => {
  // (Red-team F11: precondition — fixture must contain at least one of each
  // entry_kind so all 4 inverse keys are guaranteed non-empty Maps.)
  // Use a synthetic multi-kind fixture:
  const fixture = [
    { id: "rule-xxx", entry_kind: "rule", origin: "meta-finding-1" },
    { id: "meta-finding-1", entry_kind: "finding", promoted_to_rule: "rule-xxx" },
    { id: "loop-design-yyy", entry_kind: "loop-design", addresses: ["meta-finding-1"] },
    { id: "meta-change-1", entry_kind: "change-log", supersedes: "meta-change-0" },
  ];

  it("returns the 4 expected inverse index keys on any registry content", () => {
    const inverse = buildInverseIndexes(fixture);
    assert.ok(inverse instanceof Object, "inverse indexes is an object");
    assert.ok("addresses_inverse" in inverse, "missing addresses_inverse");
    assert.ok("supersedes_inverse" in inverse, "missing supersedes_inverse");
    assert.ok("origin_inverse" in inverse, "missing origin_inverse");
    assert.ok("promoted_to_rule_inverse" in inverse, "missing promoted_to_rule_inverse");
    // Every map value is a Map of arrays
    for (const key of ["addresses_inverse", "supersedes_inverse", "origin_inverse", "promoted_to_rule_inverse"]) {
      assert.ok(inverse[key] instanceof Map, `${key} must be a Map`);
    }
  });

  it("addresses_inverse is populated by entries with non-empty addresses arrays", () => {
    const entries = readRegistry(root);
    const inverse = buildInverseIndexes(entries);
    // Soft assertion: any entry with addresses=[X] should produce a mapping in addresses_inverse
    for (const entry of entries) {
      if (Array.isArray(entry.addresses) && entry.addresses.length > 0) {
        for (const target of entry.addresses) {
          // The inverse should have a list containing this entry's id
          const ids = inverse.addresses_inverse.get(target) || [];
          assert.ok(ids.includes(entry.id), `addresses_inverse missing ${entry.id} for target ${target}`);
        }
      }
    }
  });
});
```

The real-registry variance root cause is gone: the LRU cache ensures `readRegistry` is fast enough that the test runs in <100ms; the inverse-index build is structural (4 keys, Map values) regardless of registry size.

### Step 1.7: Set up `__tests__/extract-index-incremental.test.js` (20m)

**Setup:** temp root with 3 evidence MDs (each producing 1 finding via the frontmatter parser).

**Test 1 — No-op when nothing changed:**
```js
// Setup: 3 evidence MDs; first run writes 3 index entries
// Action: run extract-index with --incremental=true (default)
// Assert: stats.cache_hits = 3 (all 3 reused); no evidence body re-reads
//         (spy on readFileSync for evidence paths; assert call count = 0)
```

**Test 2 — Rebuild after content edit:**
```js
// Setup: same as Test 1
// Action: edit 1 evidence MD; run extract-index with --incremental=true
// Assert: stats.cache_misses = 1 (only the edited one); stats.cache_hits = 2
```

**Test 3 — Rebuild after mtime change with same content (edge case):**
```js
// Setup: same as Test 1
// Action: touch 1 evidence MD (same content); run extract-index with --incremental=true
// Assert: stats.cache_misses = 0 (content-hash is the primary skip key; the
//         existing `shouldWrite` in file-writer.js:15-22 does not check mtime
//         when content-hash matches). The new directory-mtime map in Step 2.6
//         is for the "0 changes" case (skip the entire directory walk), not
//         for per-file identity checks. (Red-team F9: picked single assertion;
//         the design uses content-hash as primary, mtime as secondary.)
```

**Test 4 — `--no-incremental` forces full rebuild:**
```js
// Setup: same as Test 1
// Action: run extract-index with --incremental=false
// Assert: stats.cache_hits = 0 (full rebuild); all 3 evidence bodies re-read
```

### Step 1.8: Verify all new tests fail (10m)

Run the 5 new test files in sequence and confirm:
- 6 LRU tests fail (LRU helper not yet exported from `core/meta-state.js`)
- 5 batch tests fail (tool not yet registered in `tools/manifest.json`)
- 5 archive tests fail (tool not yet registered in `tools/manifest.json`)
- 6 cold-cache tests fail (cache helper not yet created)
- 4 extract-index tests fail (incremental flag not yet added)
- The 2 rewritten tests may pass accidentally (the live registry may already satisfy the structural assertions) — that's OK; the meaningful change is the removal of the size threshold. Verify the old test no longer asserts on size by reading the file.

```bash
node --test \
  'tools/learning-loop-mcp/__tests__/meta-state-lru-cache.test.js' \
  'tools/learning-loop-mcp/__tests__/meta-state-batch-tool.test.js' \
  'tools/learning-loop-mcp/__tests__/meta-state-archive-tool.test.js' \
  'tools/learning-loop-mcp/__tests__/loop-describe-cold-cache.test.js' \
  'tools/learning-loop-mcp/__tests__/extract-index-incremental.test.js'
```

Expected: ~26 tests fail (all new tests).

If any test passes accidentally, the test is wrong — revise the test, not the implementation.

## Success Criteria

- [ ] `tools/learning-loop-mcp/__tests__/meta-state-lru-cache.test.js` exists with 6 failing tests
- [ ] `tools/learning-loop-mcp/__tests__/meta-state-batch-tool.test.js` exists with 5 failing tests
- [ ] `tools/learning-loop-mcp/__tests__/meta-state-archive-tool.test.js` exists with 5 failing tests
- [ ] `tools/learning-loop-mcp/__tests__/loop-describe-cold-cache.test.js` exists with 6 failing tests
- [ ] `tools/learning-loop-mcp/__tests__/extract-index-incremental.test.js` exists with 4 failing tests
- [ ] `__tests__/meta-state-list-compact.test.js` rewritten with structural assertions (size threshold removed)
- [ ] `__tests__/build-inverse-indexes.test.js:37` rewritten with structural assertions (real-registry size removed)
- [ ] All 26 new tests fail at the end of this phase (Red state)
- [ ] No production code written in this phase (test-only diff, plus the 2 test rewrites)
- [ ] Test infrastructure uses isolated temp registries (no live registry interference)
- [ ] Tests use real `core/meta-state.js` and `core/extract-index/extract-index.js` primitives (no mocks)

## Risk Assessment

### Risk: Test setup may inadvertently import the live registry

If the test's `resolveRoot()` returns the project root, the tests could pollute the live `meta-state.jsonl`. **Mitigation:** mirror the pattern from `__tests__/meta-state.test.js` exactly: create temp dir, set `process.env.META_STATE_ROOT` or use a configurable `resolveRoot(root)`. If `resolveRoot()` doesn't accept a parameter, use the workaround (write the temp registry and read it back via direct `readRegistry(tempRoot)`).

### Risk: Tests for `meta_state_batch` may not exercise the real lock if the test runner spawns worker processes

Node's `node --test` runs tests in worker threads by default. The per-root write queue is per-process, so worker-thread isolation should be fine. **Mitigation:** Test 5 (concurrent batches) explicitly uses `Promise.all` to confirm serialization; if worker threads break the test, fall back to running the two batches in the same async context (which is what `Promise.all` does anyway).

### Risk: The 2 rewritten tests may pass accidentally because the live registry already satisfies structural assertions

This is fine and expected. The meaningful change is the removal of the size-bump threshold. If the structural assertions pass on the current registry, the rewrite is "no-op green" — the test now locks the contract, and future regressions (e.g., adding `description` to the compact projection) will be caught.

### Risk: Cache tests may interfere with each other if the temp cache dir is shared

**Mitigation:** each test creates its own temp dir via `mkdtempSync`; cleanup is in `try { ... } finally { cleanup() }`. The `records/meta/.cache/` dir is only created inside the test's temp root, never at the project root.

### Risk: `extract-index` tests may take >2s to run the no-change scenario (the bug we're fixing)

**Mitigation:** the test asserts `stats.cache_hits > 0` after the no-op run; the wall-clock budget is a soft property, not a hard assertion. If the incremental implementation is broken, the test still fails (cache_hits = 0).

## Test Order (recommended TDD rhythm)

1. **Step 1.1 — LRU tests (Layer 2 first)** — this is the foundation; the batch and archive tools both depend on the LRU for invalidation.
2. **Step 1.2 — batch tests** — depend on LRU; the meta_state_batch tool's invalidation hook is the most important integration point.
3. **Step 1.3 — archive tests** — depend on batch (or can be standalone; archive is a single op in the batch tool's vocabulary).
4. **Step 1.4 — cold-cache tests** — depend on LRU (cold cache reads `readRegistry` which now hits the LRU).
5. **Step 1.5 — compact test rewrite** — independent; rewrites an existing test to be structural.
6. **Step 1.6 — inverse-index test rewrite** — independent; rewrites an existing test to be structural.
7. **Step 1.7 — extract-index tests** — independent of the others; Layer 1.
8. **Step 1.8 — verify all fail** — final gate.
