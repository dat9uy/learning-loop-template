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
// fallow-ignore-next-line complexity
export function readRegistryWithCache(root, parseFn) {
  const path = join(root, REGISTRY_FILENAME);
  let stat;
  try {
    stat = statSync(path);
  } catch {
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
