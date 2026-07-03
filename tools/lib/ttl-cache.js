/**
 * Tiny TTL cache factory. Shared between meta_state_log_change (60s idempotency
 * on identical change-log calls) and meta_state_refresh_file_index (60s
 * idempotency on unchanged (canonicalPath, mtimeMs, size)).
 *
 * The key format and its inputs are owned by the caller — the cache is just
 * a `key -> { result, stored_at }` map with a TTL eviction in `get`. Callers
 * that need to peek / backdate specific keys can read the underlying Map via
 * the returned `peek(key)` and `backdate(key, ageMs)` helpers, mirroring the
 * pre-extraction test-only APIs (`_backdateIdempotencyCacheForTests`).
 *
 * Not a general-purpose LRU: entries are deleted on read when expired. The
 * in-process Map is cleared on MCP server restart.
 *
 * @param {number} ttlMs  Time-to-live for cached entries, in milliseconds.
 * @returns {{ get: (key: string) => unknown | null,
 *             set: (key: string, result: unknown) => void,
 *             clear: () => void,
 *             peek: (key: string) => { result: unknown, stored_at: number } | undefined,
 *             backdate: (key: string, ageMs: number) => void }}
 */
export function createTtlCache(ttlMs) {
  const store = new Map();

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (Date.now() - entry.stored_at > ttlMs) {
        store.delete(key);
        return null;
      }
      return entry.result;
    },
    set(key, result) {
      store.set(key, { result, stored_at: Date.now() });
    },
    clear() {
      store.clear();
    },
    peek(key) {
      return store.get(key);
    },
    backdate(key, ageMs) {
      const entry = store.get(key);
      if (entry) entry.stored_at = Date.now() - ageMs;
    },
  };
}