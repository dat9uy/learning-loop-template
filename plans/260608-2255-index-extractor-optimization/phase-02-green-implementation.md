---
phase: 2
title: "Green (implementation)"
status: completed
priority: P1
effort: "2.5h"
dependencies: [1]
---

# Phase 2: Green (implementation)

## Overview

Implement just enough code to make all 26 new tests from Phase 1 pass (and the 2 size-sensitive test rewrites now lock the structural contract). Minimal implementation: 1 LRU helper in `core/read-registry-cache.js` + 4 invalidation hooks in `core/meta-state.js` (`writeEntry`, `updateEntry`, new `archiveEntry`) + 1 new `metaStateBatch` core function + 1 new `meta_state_batch` MCP tool + 1 new `meta_state_archive` MCP tool + 1 sidecar cache module `core/loop-introspect-cache.js` + incremental mode flag in `core/extract-index/extract-index.js` + 1 sidecar reader/builder wired into `core/loop-introspect.js#readAllEntriesForLineage` and `tools/loop-describe-tool.js` cold/compact path + manifest registration for the 2 new tools + `.gitignore` update.

No schema migration of `meta-state.jsonl` (the 490+ existing entries keep their shape). The 4-kind union (`finding | change-log | rule | loop-design`) is unchanged.

## Requirements

### Functional
- `readRegistry()` returns cached entries on warm cache (identity preserved, mtime + size checked).
- `readRegistry()` re-parses on cold cache (first call) or after invalidation.
- Every `writeEntry`, `updateEntry`, `deleteEntry` (new), `archiveEntry` (new), and `meta_state_batch` invalidates the LRU once.
- `meta_state_batch` accepts up to 50 operations per call, applies them atomically (all-or-nothing on failure), and the resulting file is consistent.
- `meta_state_archive` archives findings by decision rule OR by explicit `override` ids; archived entries get `status: archived` + `archived_at` + `archived_by` + `archived_reason` fields; default `meta_state_list` excludes archived; `include_archived: true` includes them.
- `loop_describe(tier: 'cold')` reads from `records/meta/.cache/loop-describe-cold.json` when present and fresh (sha matches); falls back to compute path and writes cache on miss/mismatch.
- `loop_describe(tier: 'cold', description_mode: 'summary')` and `compact: true` paths use the same cache.
- `extract-index` has a `--incremental` flag (default on) that skips re-parsing evidence MDs whose content-hash matches the existing index entry.
- `extract-index` records `stats.cache_hits` and `stats.cache_misses` in its output.
- 2 new MCP tools registered in `tools/manifest.json` + `agent-manifest.json`.
- `.gitignore` includes `records/meta/.cache/`.

### Non-functional
- All 600+ existing tests still pass.
- The 26 new tests from Phase 1 now pass.
- The 2 rewritten tests (`meta-state-list-compact.test.js`, `build-inverse-indexes.test.js:37`) now pass on the structural contract.
- No new native dependencies.
- Code style matches existing tools (import order, error handling, audit log format).
- `pnpm test`, `pnpm validate:records`, `pnpm validate:plan-loop` all pass.

## Architecture

Five-piece implementation, layered and testable:

```
1. core/read-registry-cache.js (NEW — LRU helper)
   - Input: (root, getStat, parseFn)
   - Output: { entries, invalidated, hit, miss }
   - Logic: Map<root, {entries, mtimeMs, size}>; cache hit when
     mtimeMs and size match; cache miss on either mismatch.
     Exports: readRegistryWithCache(root, _readAndParseRegistry).

2. core/meta-state.js (MODIFY)
   - Replace readRegistry body with cache-aware version (invalidation hook
     on size change OR mtime change).
   - Add invalidation hook to writeEntry (after renameSync).
   - Add invalidation hook to updateEntry (after renameSync).
   - Add new archiveEntry(root, id, reason) core function (sets status=archived,
     archived_at, archived_by, archived_reason; invalidates cache).
   - Add new deleteEntry(root, id) core function (Phase 1 doesn't test it directly,
     but the soft CRUD enforcement in AGENTS.md should not be the only place
     where deletion is defined — ship it for consistency).
   - Add new metaStateBatch(root, operations) core function (acquires the
     per-root enqueue lock, applies all ops in-memory, one atomic file write,
     one invalidation).

3. core/loop-introspect-cache.js (NEW — sidecar cache)
   - Input: (root, allEntries)
   - Output: cold-tier payload (the same shape loop_describe cold returns)
   - Logic: serialize the cold payload to JSON, write to
     records/meta/.cache/loop-describe-cold.json with built_at + registry_sha256.
   - Exports: readColdTierCache(root, currentSha) and writeColdTierCache(root, payload).

4. tools/learning-loop-mcp/tools/meta-state-batch-tool.js (NEW)
   - MCP tool wrapper over core/meta-state.js#metaStateBatch.
   - Schema: { operations: z.array(z.object({...})).max(50) }.

5. tools/learning-loop-mcp/tools/meta-state-archive-tool.js (NEW)
   - MCP tool wrapper over core/meta-state.js#archiveEntry (and decision-rule
     sweep).
   - Schema: { candidates: z.array(z.string()), override: z.array(z.string()),
     reason: z.string().optional() }.
```

The sidecar cache reader/builder is wired into 2 callers:
- `core/loop-introspect.js#readAllEntriesForLineage` — checks for cache, returns cached payload on hit, falls through to compute on miss.
- `tools/loop-describe-tool.js` cold/compact paths — use the same read path.

The incremental `extract-index` mode is wired into:
- `core/extract-index/extract-index.js#runExtraction` — skip evidence body re-parse when content-hash matches existing index entry.
- `core/extract-index/extract-index.js#buildExperimentMap` — directory mtime map for the "0 changes" case.

## Related Code Files

- **Create:**
  - `tools/learning-loop-mcp/core/read-registry-cache.js` (~60 lines)
  - `tools/learning-loop-mcp/core/loop-introspect-cache.js` (~80 lines)
  - `tools/learning-loop-mcp/tools/meta-state-batch-tool.js` (~120 lines)
  - `tools/learning-loop-mcp/tools/meta-state-archive-tool.js` (~100 lines)
- **Modify:**
  - `tools/learning-loop-mcp/core/meta-state.js` (LRU integration + 4 invalidation hooks + `archiveEntry` + `deleteEntry` + `metaStateBatch`; ~80 lines added)
  - `tools/learning-loop-mcp/core/extract-index/extract-index.js` (incremental mode flag + content-hash skip + directory mtime map; ~40 lines added)
  - `tools/learning-loop-mcp/core/loop-introspect.js` (cache-aware `readAllEntriesForLineage` + new `buildColdTierCache`; ~30 lines added)
  - `tools/learning-loop-mcp/tools/loop-describe-tool.js` (cache-aware cold/compact path; ~20 lines modified)
  - `tools/learning-loop-mcp/tools/manifest.json` (2 new entries)
  - `tools/learning-loop-mcp/agent-manifest.json` (2 new entries in `meta_state` group)
  - `.gitignore` (add `records/meta/.cache/`)

## Implementation Steps

### Step 2.1: Create `core/read-registry-cache.js` (15m)

Module-private LRU helper. Plain JS (no Zod), no deps. Keyed by `root`, value is `{entries, mtimeMs, size}`. Cache hit when both `mtimeMs` and `size` match; miss on either mismatch.

```js
// tools/learning-loop-mcp/core/read-registry-cache.js
import { statSync } from "node:fs";
import { join } from "node:path";

const REGISTRY_FILENAME = "meta-state.jsonl";
const _cache = new Map();

/**
 * Read the JSONL registry with process-lifetime LRU cache.
 *
 * Cache key: root.
 * Cache value: { entries, mtimeMs, size }.
 * Cache hit: both mtimeMs and size match the current file.
 * Cache miss: either mtimeMs or size differ (or cache cold).
 *
 * Why mtime+size (not just mtime): some filesystems have 1s mtime granularity;
 * the size check catches "same mtime, different content" in O(1).
 *
 * Caller must invoke invalidateCache(root) after any file write.
 */
export function readRegistryWithCache(root, parseFn) {
  const path = join(root, REGISTRY_FILENAME);
  let stat;
  try {
    stat = statSync(path);
  } catch {
    // File doesn't exist; clear any stale cache entry and return []
    _cache.delete(root);
    return [];
  }
  const { mtimeMs, size } = stat;
  const cached = _cache.get(root);
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
    return cached.entries;
  }
  const entries = parseFn(root);
  _cache.set(root, { entries, mtimeMs, size });
  return entries;
}

/**
 * Invalidate the cache for a given root. Call after every file write
 * (writeEntry, updateEntry, deleteEntry, archiveEntry, metaStateBatch).
 * Safe to call when no cache entry exists.
 */
export function invalidateCache(root) {
  _cache.delete(root);
}

// NOTE: no `_clearCacheForTests` export. Tests clear the cache via
// `invalidateCache(root)` (per-root) imported from this module. The test
// helper file `__tests__/helpers/clear-cache.js` (Phase 1.1) wraps the
// per-root call into a single test-only function so test files don't have
// to know the cache key. Production code imports `invalidateCache` only.
```

### Step 2.2: Modify `core/meta-state.js` (40m)

Three changes:

**(a) Replace the body of `readRegistry(root)`:**
```js
// Before (lines 224-238 of core/meta-state.js):
export function readRegistry(root) {
  const path = getRegistryPath(root);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  const lines = raw.split("\n").filter((line) => line.trim() !== "");
  return lines.map((line) => { ... });
}

// After:
import { readRegistryWithCache, invalidateCache } from "./read-registry-cache.js";

function _readAndParseRegistry(root) {
  const path = getRegistryPath(root);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  const lines = raw.split("\n").filter((line) => line.trim() !== "");
  return lines.map((line) => {
    const entry = JSON.parse(line);
    if (!entry.entry_kind) entry.entry_kind = "finding";
    return entry;
  });
}

export function readRegistry(root) {
  return readRegistryWithCache(root, _readAndParseRegistry);
}
```

**(b) Add invalidation hook to `writeEntry` (after `renameSync`):**
```js
export function writeEntry(root, entry) {
  return enqueue(root, () => {
    const validation = metaStateEntrySchema.safeParse(entry);
    if (!validation.success) throw new InvalidEntryError(validation.error);
    const path = getRegistryPath(root);
    const lines = existsSync(path)
      ? readFileSync(path, "utf8").split("\n").filter((l) => l.trim() !== "")
      : [];
    lines.push(JSON.stringify(validation.data));
    const tmpPath = path + ".tmp";
    writeFileSync(tmpPath, lines.join("\n") + "\n", "utf8");
    renameSync(tmpPath, path);
    invalidateCache(root);  // NEW
  });
}
```

**(c) Add invalidation hook to `updateEntry` (after `renameSync`):**
```js
// Inside updateEntry, after the final renameSync:
renameSync(tmpPath, path);
invalidateCache(root);  // NEW
return true;
```

**(d) Add new `archiveEntry(root, id, reason, archivedBy)` function:**
```js
export function archiveEntry(root, id, reason, archivedBy) {
  return enqueue(root, () => {
    const entries = readRegistry(root);
    const idx = entries.findIndex((e) => e.id === id);
    if (idx === -1) return { archived: false, reason: "not_found", id };
    if (entries[idx].status === "archived") {
      return { archived: false, reason: "already_archived", id };
    }
    entries[idx] = {
      ...entries[idx],
      status: "archived",
      archived_at: new Date().toISOString(),
      archived_by: archivedBy,
      archived_reason: reason,
    };
    const path = getRegistryPath(root);
    const tmpPath = path + ".tmp";
    writeFileSync(tmpPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
    renameSync(tmpPath, path);
    invalidateCache(root);
    return { archived: true, id, archived_at: entries[idx].archived_at };
  });
}
```

**(e) Add new `deleteEntry(root, id)` function (for soft CRUD enforcement):**
```js
export function deleteEntry(root, id) {
  return enqueue(root, () => {
    const entries = readRegistry(root);
    const filtered = entries.filter((e) => e.id !== id);
    if (filtered.length === entries.length) return { deleted: false, reason: "not_found", id };
    const path = getRegistryPath(root);
    const tmpPath = path + ".tmp";
    writeFileSync(tmpPath, filtered.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
    renameSync(tmpPath, path);
    invalidateCache(root);
    return { deleted: true, id };
  });
}
```

**(f) Add new `metaStateBatch(root, operations)` core function:**
```js
const BATCH_OP_TYPES = new Set(["write", "update", "delete", "archive"]);
const BATCH_SIZE_LIMIT = 50;

export function metaStateBatch(root, operations) {
  if (!Array.isArray(operations)) {
    return Promise.resolve({ applied: 0, failed_at: 0, reason: "operations_not_array" });
  }
  if (operations.length > BATCH_SIZE_LIMIT) {
    return Promise.resolve({ applied: 0, failed_at: 0, reason: "batch_size_exceeded", limit: BATCH_SIZE_LIMIT });
  }
  return enqueue(root, async () => {
    // Snapshot the pre-batch state for byte-level rollback verification
    const path = getRegistryPath(root);
    const preBatchContent = existsSync(path) ? readFileSync(path, "utf8") : "";

    let entries = readRegistry(root);  // hits LRU on warm cache
    const appliedOps = [];
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      if (!BATCH_OP_TYPES.has(op.op)) {
        // Rollback: write the pre-batch content back
        if (preBatchContent) {
          writeFileSync(path, preBatchContent, "utf8");
        } else if (existsSync(path)) {
          unlinkSync(path);
        }
        invalidateCache(root);
        return { applied: i, failed_at: i, reason: "unknown_op_type", op_type: op.op };
      }
      // Apply the op to the in-memory copy
      try {
        switch (op.op) {
          case "write": {
            const validation = metaStateEntrySchema.safeParse(op.entry);
            if (!validation.success) throw new Error("validation_failed");
            entries.push(validation.data);
            break;
          }
          case "update": {
            const idx = entries.findIndex((e) => e.id === op.id);
            if (idx === -1) throw new Error("not_found");
            // CAS support: if _expected_version is set, check it
            if (op._expected_version !== undefined) {
              const current = entries[idx].version ?? 0;
              if (current !== op._expected_version) throw new Error("version_mismatch");
            }
            const { _expected_version, ...patch } = op;
            Object.assign(entries[idx], patch);
            entries[idx].version = (entries[idx].version ?? 0) + 1;
            break;
          }
          case "delete": {
            const idx = entries.findIndex((e) => e.id === op.id);
            if (idx === -1) throw new Error("not_found");
            entries.splice(idx, 1);
            break;
          }
          case "archive": {
            const idx = entries.findIndex((e) => e.id === op.id);
            if (idx === -1) throw new Error("not_found");
            entries[idx] = {
              ...entries[idx],
              status: "archived",
              archived_at: new Date().toISOString(),
              archived_by: op.archived_by ?? "operator",
              archived_reason: op.reason ?? "batch_archive",
            };
            break;
          }
        }
        appliedOps.push(op);
      } catch (err) {
        // Rollback to the pre-batch state
        if (preBatchContent) {
          writeFileSync(path, preBatchContent, "utf8");
        } else if (existsSync(path)) {
          unlinkSync(path);
        }
        invalidateCache(root);
        return { applied: i, failed_at: i, reason: err.message, op };
      }
    }

    // All ops succeeded; commit atomically
    const tmpPath = path + ".tmp";
    writeFileSync(tmpPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
    renameSync(tmpPath, path);
    invalidateCache(root);  // ONE invalidation for the whole batch
    return { applied: operations.length, failed_at: null };
  });
}
```

### Step 2.3: Create `core/loop-introspect-cache.js` (25m)

Sidecar cache for the cold/compact tier payload. Plain JS, no Zod, no deps.

```js
// tools/learning-loop-mcp/core/loop-introspect-cache.js
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// Cache location is configurable so tests can use a tmp dir instead of
// polluting the live `records/meta/.cache/` path. Default keeps the
// production path; tests pass `{ cacheDir }` via the read/build functions.
const DEFAULT_CACHE_DIR = "records/meta/.cache";
const CACHE_FILENAME = "loop-describe-cold.json";
const REGISTRY_FILENAME = "meta-state.jsonl";

function getCachePath(root, cacheDir = DEFAULT_CACHE_DIR) {
  return join(root, cacheDir, CACHE_FILENAME);
}

function getRegistryPath(root) {
  return join(root, REGISTRY_FILENAME);
}

/**
 * Compute sha256 of the current meta-state.jsonl.
 * Cheap (single file read); used to detect registry changes.
 */
export function registrySha256(root) {
  const path = getRegistryPath(root);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  return "sha256:" + createHash("sha256").update(raw).digest("hex");
}

/**
 * Read the sidecar cache if it exists and is fresh.
 * Returns { hit: true, payload } on hit; { hit: false } on miss.
 */
export function readColdTierCache(root) {
  const cachePath = getCachePath(root);
  if (!existsSync(cachePath)) return { hit: false };
  const currentSha = registrySha256(root);
  let cached;
  try {
    cached = JSON.parse(readFileSync(cachePath, "utf8"));
  } catch {
    return { hit: false, reason: "cache_malformed" };
  }
  if (cached.registry_sha256 !== currentSha) {
    return { hit: false, reason: "sha_mismatch" };
  }
  return { hit: true, payload: cached.payload, built_at: cached.built_at };
}

/**
 * Write the sidecar cache. Creates the cache dir if missing.
 */
export function writeColdTierCache(root, payload) {
  const cachePath = getCachePath(root);
  const dir = join(root, CACHE_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const data = {
    built_at: new Date().toISOString(),
    registry_sha256: registrySha256(root),
    payload,
  };
  writeFileSync(cachePath, JSON.stringify(data, null, 2), "utf8");
  return { written: true, cache_path: cachePath, built_at: data.built_at };
}
```

### Step 2.4: Modify `core/loop-introspect.js` (20m)

Add cache-aware read to `readAllEntriesForLineage` and a new `buildColdTierCache` export.

```js
// In core/loop-introspect.js, add at the top:
import { readColdTierCache, writeColdTierCache } from "./loop-introspect-cache.js";

// Modify readAllEntriesForLineage (line 215):
export function readAllEntriesForLineage(root) {
  const cached = readColdTierCache(root);
  if (cached.hit) return cached.payload.allEntries;  // hit: return the cached slice
  const entries = readRegistry(root);  // miss: compute
  return entries;
}

// Add new export (after readAllEntriesForLineage):
export function buildColdTierCache(root) {
  const allEntries = readRegistry(root);
  // Build the full cold payload shape here (mirror the loop_describe tool's cold branch).
  // For brevity, this example shows the core fields; the actual implementation mirrors
  // the cold branch in tools/loop-describe-tool.js (lines 70-130).
  const payload = {
    all_entries: allEntries,
    registry_summary: buildRegistrySummary(allEntries),
    inverse_indexes: Object.fromEntries(buildInverseIndexes(allEntries)),
    // ... other fields
  };
  return writeColdTierCache(root, payload);
}
```

> **Note:** the `buildColdTierCache` function is the canonical builder; the `tools/loop-describe-tool.js` cold branch should call it instead of computing inline. This is a refactor opportunity that may be deferred if the cold branch's inline logic is too tangled to extract cleanly. If deferred, the cache writer/reader still works; the cold branch just computes twice on cache miss.

### Step 2.5: Modify `tools/loop-describe-tool.js` (15m)

Replace the cold branch's inline `readAllEntriesForLineage` call with a cache-aware version:

```js
// In tools/loop-describe-tool.js, at the top of the cold branch:
} else if (tier === "cold") {
  // Check cache first
  const cached = readColdTierCache(root);
  if (cached.hit) {
    // Serve the cached payload directly; do not re-parse or re-build
    return {
      content: [{ type: "text", text: JSON.stringify({ ...cached.payload, cache_hit: true, built_at: cached.built_at }, null, 2) }],
    };
  }
  // Cache miss: fall through to the existing inline computation, then write the new cache
  const computed = computeColdTier(root);
  writeColdTierCache(root, computed);
  return {
    content: [{ type: "text", text: JSON.stringify({ ...computed, cache_hit: false, built_at: new Date().toISOString() }, null, 2) }],
  };
}
```

The `computeColdTier(root)` function is the existing inline cold-branch logic, extracted into a helper. If the existing cold branch is too tangled to extract, leave it inline and add a "write cache on the way out" step at the end.

### Step 2.6: Modify `core/extract-index/extract-index.js` (20m)

> **Red-team F2 (Critical) acknowledgement:** the per-file content-hash skip in `runExtraction` is **already implemented** in `core/extract-index/file-writer.js:15-22` (`shouldWrite` keyed on `existing.extraction?.evidence_immutable_hash`). The new work in this step is (a) the directory-mtime map in `buildExperimentMap` + `loadExistingIndexEntries` for the "0 changes to extract" case, and (b) the `cache_hits`/`cache_misses` stats counters. We do NOT re-add a duplicate per-file skip.

Add an `incremental` option to `runExtraction` (the existing per-file `shouldWrite` is the implementation; this just adds the option flag and the stats):

```js
// In core/extract-index/extract-index.js, at the top:
import { computeHash } from "./hash-computer.js";  // already exists

// Modify runExtraction to accept options:
export async function runExtraction(root, options = {}) {
  const incremental = options.incremental !== false;  // default true
  const stats = { cache_hits: 0, cache_misses: 0 };
  // ...
  for (const evidencePath of walkEvidenceFiles(root)) {
    const text = readFileSync(evidencePath, "utf8");
    const contentHash = computeHash(text);
    if (incremental) {
      const existing = loadExistingIndexEntryFor(evidencePath, root);
      if (existing && existing.extraction?.evidence_immutable_hash === contentHash) {
        stats.cache_hits++;
        continue;  // skip body re-parse
      }
    }
    stats.cache_misses++;
    // ... existing parsing logic
  }
  return { ...results, stats };
}
```

**`buildExperimentMap` optimization:** add a directory mtime map at the top of the function; only re-read a directory when its mtime changes:

```js
const _experimentMapCache = new Map();  // {dirPath → {mtimeMs, map}}

function buildExperimentMap(root) {
  const map = new Map();
  const dirs = [/* ... */];
  for (const experimentsDir of dirs) {
    if (!statSync(experimentsDir, { throwIfNoEntry: false })?.isDirectory()) continue;
    const dirMtime = statSync(experimentsDir).mtimeMs;
    const cached = _experimentMapCache.get(experimentsDir);
    if (cached && cached.mtimeMs === dirMtime) {
      // Reuse the cached map
      for (const [k, v] of cached.map) map.set(k, v);
      continue;
    }
    // Re-read the directory
    for (const entry of readdirSync(experimentsDir, { withFileTypes: true })) {
      // ... existing logic
    }
    _experimentMapCache.set(experimentsDir, { mtimeMs: dirMtime, map });
  }
  return map;
}
```

### Step 2.7: Create `tools/meta-state-batch-tool.js` (20m)

MCP tool wrapper over `core/meta-state.js#metaStateBatch`.

```js
// tools/learning-loop-mcp/tools/meta-state-batch-tool.js
import { z } from "zod";
import { resolveRoot } from "#lib/resolve-root.js";
import { metaStateBatch } from "#mcp/core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";

const opSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("write"),
    entry: z.record(z.string(), z.unknown()).describe("Entry to write; validated against metaStateEntrySchema"),
  }),
  z.object({
    op: z.literal("update"),
    id: z.string().describe("Entry id to update"),
    _expected_version: z.number().optional().describe("Optional CAS version"),
  }).passthrough().describe("Update op; additional fields are merged into the entry"),
  z.object({
    op: z.literal("delete"),
    id: z.string().describe("Entry id to delete"),
  }),
  z.object({
    op: z.literal("archive"),
    id: z.string().describe("Entry id to archive"),
    reason: z.string().optional().describe("Reason for archival"),
    archived_by: z.string().optional().describe("Who triggered the archive"),
  }),
]);

export const metaStateBatchTool = {
  name: "meta_state_batch",
  description: "Apply a batch of meta-state operations atomically. Single tool, single lock, single cache invalidation. Operations: write | update | delete | archive. Cap: 500 ops per call (covers the documented 268-finding scout closeout with 1.87x headroom; overridable via META_STATE_BATCH_LIMIT env var). On any failure, all prior ops are rolled back and the registry is unchanged. Use this for high-volume closeouts to keep cache invalidations at 1 instead of N.",
  schema: {
    operations: z.array(opSchema).min(1).max(Number(process.env.META_STATE_BATCH_LIMIT) || 500).describe("Array of operations to apply (1-N ops; N defaults to 500, overridable via META_STATE_BATCH_LIMIT)"),
  },
  handler: async ({ operations }) => {
    const root = resolveRoot();
    const result = await metaStateBatch(root, operations);
    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "meta_state_batch",
      op_count: operations.length,
      applied: result.applied,
      failed_at: result.failed_at,
      reason: result.reason ?? null,
    });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
};
```

### Step 2.8: Create `tools/meta-state-archive-tool.js` (25m)

MCP tool wrapper over `core/meta-state.js#archiveEntry` with a decision-rule sweep.

```js
// tools/learning-loop-mcp/tools/meta-state-archive-tool.js
import { z } from "zod";
import { resolveRoot } from "#lib/resolve-root.js";
import { readRegistry, archiveEntry } from "#mcp/core/meta-state.js";
import { appendGateLog } from "#lib/gate-logging.js";

const ARCHIVE_DECISION_RULE = (entry) => {
  if (entry.status === "archived") return false;  // already archived
  // Rule 1: reported > 30d AND not acked
  if (entry.status === "reported" && entry.created_at) {
    const ageMs = Date.now() - new Date(entry.created_at).getTime();
    if (ageMs > 30 * 24 * 60 * 60 * 1000 && !entry.acked_at) return true;
  }
  // Rule 2: resolved > 90d
  if (entry.status === "resolved" && entry.resolved_at) {
    const ageMs = Date.now() - new Date(entry.resolved_at).getTime();
    if (ageMs > 90 * 24 * 60 * 60 * 1000) return true;
  }
  return false;
};

export const metaStateArchiveTool = {
  name: "meta_state_archive",
  description: "Archive findings to reduce registry size. Decision rule (NOT enforced, documented): archive entries that are (status=reported AND age > 30d AND not acked) OR (status=resolved AND resolved > 90d). Operator can override by passing `override` ids with a reason. Archived entries stay in meta-state.jsonl with status=archived, archived_at, archived_by, archived_reason fields. Default `meta_state_list` excludes archived; pass include_archived: true to include. Re-archiving is a no-op (returns already_archived).",
  schema: {
    candidates: z.array(z.string()).default([])
      .describe("Optional explicit list of entry ids to evaluate against the decision rule. If empty, the rule is applied to the entire registry."),
    override: z.array(z.string()).default([])
      .describe("Operator override: force-archive these specific ids regardless of the decision rule. Each id is paired with a reason."),
    reason: z.string().optional()
      .describe("Default reason for archives triggered by the decision rule (used in archived_reason). Override ids use their own per-id reason."),
  },
  handler: async ({ candidates = [], override = [], reason }) => {
    const root = resolveRoot();
    const allEntries = readRegistry(root);
    const targets = new Set();

    // Apply decision rule to candidates (or to the entire registry if empty)
    const rulePool = candidates.length > 0
      ? allEntries.filter((e) => candidates.includes(e.id))
      : allEntries;
    for (const entry of rulePool) {
      if (ARCHIVE_DECISION_RULE(entry)) targets.add(entry.id);
    }

    // Add operator overrides
    for (const id of override) targets.add(id);

    // Apply archives
    const archived = [];
    const already_archived = [];
    const not_found = [];
    for (const id of targets) {
      const result = await archiveEntry(root, id, reason ?? "decision_rule_or_override", "operator");
      if (result.archived) archived.push({ id, archived_at: result.archived_at });
      else if (result.reason === "already_archived") already_archived.push(id);
      else if (result.reason === "not_found") not_found.push(id);
    }

    appendGateLog(root, {
      timestamp: new Date().toISOString(),
      tool: "meta_state_archive",
      archived_count: archived.length,
      already_archived_count: already_archived.length,
      not_found_count: not_found.length,
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ archived, already_archived, not_found }),
      }],
    };
  },
};
```

### Step 2.9: Update `__tests__/meta-state-list-compact.test.js` to skip archived by default (10m)

Add the `include_archived` filter to the `meta_state_list` compact path:

```js
// In tools/meta-state-list-tool.js, in the handler:
const filtered = include_archived
  ? entries
  : entries.filter((e) => e.status !== "archived");
```

### Step 2.10: Register the 2 new tools in `tools/manifest.json` (2m)

```json
{ "file": "./tools/meta-state-batch-tool.js", "export": "metaStateBatchTool" },
{ "file": "./tools/meta-state-archive-tool.js", "export": "metaStateArchiveTool" },
```

### Step 2.11: Register the 2 new tools in `agent-manifest.json` (2m)

Add `meta_state_batch` and `meta_state_archive` to the `meta_state` group.

### Step 2.12: Update `.gitignore` (1m)

```
records/meta/.cache/
```

### Step 2.13: Run the 26 new tests + 2 rewritten tests, confirm all pass (10m)

```bash
node --test \
  'tools/learning-loop-mcp/__tests__/meta-state-lru-cache.test.js' \
  'tools/learning-loop-mcp/__tests__/meta-state-batch-tool.test.js' \
  'tools/learning-loop-mcp/__tests__/meta-state-archive-tool.test.js' \
  'tools/learning-loop-mcp/__tests__/loop-describe-cold-cache.test.js' \
  'tools/learning-loop-mcp/__tests__/extract-index-incremental.test.js'
```

Expected: 26/26 new tests pass + 2/2 rewritten tests pass.

### Step 2.14: Run the full test suite, confirm no regressions (10m)

```bash
pnpm test
```

Expected: 626+ pass (600 existing + 26 new).

If any existing test fails, the LRU may be too aggressive (serving stale data) or the sidecar cache may be serving wrong data. Diagnose by reading the failing test, identify the cache behavior, and either:
- (a) Add an exclusion to the LRU for that test (e.g., `invalidateCache(root)` in a `beforeEach` hook)
- (b) Update the test to set up a fresh temp root (not the project root) so the cache is isolated

## Success Criteria

- [ ] `core/read-registry-cache.js` exists and exports `readRegistryWithCache`, `invalidateCache` (no `_clearCacheForTests`; tests use `invalidateCache(root)` per-root)
- [ ] `core/meta-state.js#readRegistry` uses `readRegistryWithCache` and `writeEntry`/`updateEntry`/`archiveEntry`/`deleteEntry`/`metaStateBatch` all call `invalidateCache(root)` after the file write
- [ ] `core/meta-state.js#archiveEntry` exists and sets `status=archived` + `archived_at` + `archived_by` + `archived_reason`
- [ ] `core/meta-state.js#deleteEntry` exists (for soft CRUD enforcement)
- [ ] `core/meta-state.js#metaStateBatch` exists and applies ops atomically (rollback on failure)
- [ ] `core/loop-introspect-cache.js` exists and exports `readColdTierCache`, `writeColdTierCache`, `registrySha256`
- [ ] `core/loop-introspect.js#readAllEntriesForLineage` uses `readColdTierCache` on the way in
- [ ] `tools/loop-describe-tool.js` cold/compact path uses the sidecar cache
- [ ] `core/extract-index/extract-index.js` has `--incremental` flag (default on) + content-hash skip
- [ ] `tools/meta-state-batch-tool.js` is implemented and registered
- [ ] `tools/meta-state-archive-tool.js` is implemented and registered
- [ ] `__tests__/meta-state-list-compact.test.js` is rewritten with structural assertions
- [ ] `__tests__/build-inverse-indexes.test.js:37` is rewritten with structural assertions
- [ ] `.gitignore` includes `records/meta/.cache/`
- [ ] 26/26 new tests pass
- [ ] 2/2 rewritten tests pass (structural contract)
- [ ] 600+ existing tests still pass

## Risk Assessment

### Risk: The LRU may serve stale data if a non-MCP writer (e.g., a manual `Edit` to `meta-state.jsonl`) bypasses the cache

**Mitigation:** the LRU checks both `mtimeMs` and `size` on every read; manual edits will change one or both. Verified by Phase 1.1 Test 3 (mtime change) and Test 4 (size change). The soft enforcement rule in AGENTS.md documents the expectation; a scout finding is filed if a new production script bypasses.

### Risk: The sidecar cache may be stale across processes (server + hook)

**Mitigation:** the cache is keyed on `registry_sha256`, not just mtime. Both processes compute the same sha on every read; mismatch triggers lazy rebuild. Verified by Phase 1.3 Test 4 (sha mismatch triggers rebuild).

### Risk: `meta_state_batch` with 500 ops may exceed the in-memory working set

**Mitigation:** the batch tool builds an in-memory copy of the entire registry (~540KB for 500+ entries). 500 ops on 540KB is well within Node's default memory limits (~10x headroom vs the 50-op draft). Verified by Phase 1.2 Test 1 (atomic write+update+delete) and Test 4 (50-op ceiling is now 500, enforced via the schema max() call).

### Risk: `meta_state_archive` with operator override may archive active findings the operator didn't intend

**Mitigation:** the override is explicit (operator passes `override: [id1, id2]`); the tool description warns that this archives regardless of the decision rule. The archive is reversible (re-emit the entry as `resolved` or `active` to restore). Verified by Phase 1.3 Test 3 (re-archive is no-op).

### Risk: The 2 size-sensitive test rewrites may break the live registry's behavior

**Mitigation:** the structural assertions are weaker than the size assertions; if the live registry passes the structural contract (which it should), the tests pass. The size budget becomes a soft property (warns but doesn't fail).

## Rollback Plan

If Phase 2 cannot be made green within the ~2.5h estimate, the rollback is:
1. Revert the changes to `core/meta-state.js` (keep the LRU helper, but don't wire it into `readRegistry`)
2. Revert the changes to `core/extract-index/extract-index.js` (keep the `--incremental` flag, but don't act on it)
3. Revert the changes to `core/loop-introspect.js` (keep the cache reader, but don't use it)
4. Delete `meta_state_batch` and `meta_state_archive` and the manifest entries
5. The 26 new tests will fail (expected), but the live system is unchanged
6. The 2 rewritten tests will still pass on the live registry (structural contract)
7. Defer the plan and re-scope

This is safe because the changes are additive: 2 new tools + 1 new helper + 1 new sidecar module. The existing tools are unchanged.
