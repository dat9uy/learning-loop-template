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
 * The reader is a swappable projection seam: `parseFns` holds the two
 * named projections computed together on a single cold miss —
 *   - `parseFns.projected`  — last-wins-by-max-version
 *     (`group_by(.id) | max_by(.version)`), created_at-sorted
 *   - `parseFns.allVersions` — uncollapsed, every line per id,
 *     (id, version)-sorted
 * Both projections derive from the same file state at stat time, so they
 * share one cache slot and one invalidation key; callers pick a slice of
 * the cached value. (Each projection reads the files independently on a
 * cold miss — a concurrent external append between the two reads could
 * skew one miss, but the mtime+size key self-heals on the next read.)
 *
 * Cache key: root + BOTH files' mtime+size. A change to either file
 * invalidates the cache. A missing second file is treated as empty (so
 * the pre-split state still works as a no-op dual-source read).
 *
 * Cache value: { projected, allVersions, metaState: {mtimeMs, size}, changeLog: {mtimeMs, size} | null }.
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
export function readRegistryWithCache(root, parseFns) {
  const metaStatePath = join(root, REGISTRY_FILENAME);
  const changeLogPath = join(root, CHANGE_LOG_FILENAME);

  const metaStateStat = safeStat(metaStatePath);
  const changeLogStat = safeStat(changeLogPath);

  // Either file missing → cold. Both missing → empty.
  if (!metaStateStat && !changeLogStat) {
    _cache.delete(root);
    return { projected: [], allVersions: [] };
  }

  const cached = _cache.get(root);
  if (cached && statsMatch(cached.metaState, metaStateStat) && statsMatch(cached.changeLog, changeLogStat)) {
    return cached;
  }
  const value = {
    projected: parseFns.projected(root),
    allVersions: parseFns.allVersions(root),
    metaState: metaStateStat ? { mtimeMs: metaStateStat.mtimeMs, size: metaStateStat.size } : null,
    changeLog: changeLogStat ? { mtimeMs: changeLogStat.mtimeMs, size: changeLogStat.size } : null,
  };
  _cache.set(root, value);
  return value;
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
