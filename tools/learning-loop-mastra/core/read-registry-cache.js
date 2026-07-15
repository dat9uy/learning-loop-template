import { statSync } from "node:fs";
import { join } from "node:path";

const REGISTRY_FILENAME = "meta-state.jsonl";
const CHANGE_LOG_FILENAME = "change-log.jsonl";
const _cache = new Map();

/**
 * Read the JSONL registry(ies) with process-lifetime LRU cache.
 *
 * The registry is split into two files:
 *   - `meta-state.jsonl` — mutable table (findings, rules, loop-designs)
 *   - `change-log.jsonl` — true-append log (immutable change-logs)
 *
 * The reader is a swappable projection seam: `parseFn` decides how the
 * union of both files is shaped before being cached. Today `parseFn`
 * returns the identity projection (load both, concat, sort by created_at
 * ascending) — at Tier 2 the seam swaps to last-wins-by-max-version
 * (`group_by(.id) | max_by(.version)`) without touching this module.
 *
 * Cache key: root + BOTH files' mtime+size. A change to either file
 * invalidates the cache. A missing second file is treated as empty (so
 * the pre-split state still works as a no-op dual-source read).
 *
 * Cache value: { entries, metaState: {mtimeMs, size}, changeLog: {mtimeMs, size} | null }.
 * Cache hit: ALL components match the current filesystem state.
 * Cache miss: any component differs (or cache cold).
 *
 * Why mtime+size (not just mtime): some filesystems have 1s mtime granularity;
 * the size check catches "same mtime, different content" in O(1).
 *
 * Caller must invoke invalidateCache(root) after any file write to EITHER
 * file. Safe to call when no cache entry exists.
 */
// fallow-ignore-next-line complexity
export function readRegistryWithCache(root, parseFn) {
  const metaStatePath = join(root, REGISTRY_FILENAME);
  const changeLogPath = join(root, CHANGE_LOG_FILENAME);

  const metaStateStat = safeStat(metaStatePath);
  const changeLogStat = safeStat(changeLogPath);

  // Either file missing → cold. Both missing → empty.
  if (!metaStateStat && !changeLogStat) {
    _cache.delete(root);
    return [];
  }

  const cached = _cache.get(root);
  if (cached && statsMatch(cached.metaState, metaStateStat) && statsMatch(cached.changeLog, changeLogStat)) {
    return cached.entries;
  }
  const entries = parseFn(root);
  _cache.set(root, {
    entries,
    metaState: metaStateStat ? { mtimeMs: metaStateStat.mtimeMs, size: metaStateStat.size } : null,
    changeLog: changeLogStat ? { mtimeMs: changeLogStat.mtimeMs, size: changeLogStat.size } : null,
  });
  return entries;
}

function safeStat(path) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

function statsMatch(cached, current) {
  if (cached === null && current === null) return true;
  if (cached === null || current === null) return false;
  return cached.mtimeMs === current.mtimeMs && cached.size === current.size;
}

/**
 * Invalidate the cache for a given root. Call after every file write
 * to EITHER `meta-state.jsonl` OR `change-log.jsonl`
 * (writeEntry, updateEntry, deleteEntry, archiveEntry, metaStateBatch,
 *  appendChangeLogEntryAtomic). Safe to call when no cache entry exists.
 */
export function invalidateCache(root) {
  _cache.delete(root);
}
