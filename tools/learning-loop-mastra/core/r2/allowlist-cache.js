/**
 * R2 allowlist cache (F1, NF1 / Plan 5-Lite Phase 1).
 *
 * Loads `.loop/r2-allowlist.json` once per process per root and caches it for
 * the process lifetime. Operator edits via the `update_r2_allowlist` MCP tool
 * call `invalidateAllowlist(root)` to force a re-read on the next R2 call.
 * No automatic file-watching (keeps the contract simple per NF1).
 *
 * The cache key is the root directory (so different GATE_ROOT temp roots in
 * tests do not collide). `__clearCache()` is test-only and clears all roots.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ALLOWLIST_PATH = ".loop/r2-allowlist.json";

const cache = new Map(); // root -> parsed allowlist

/**
 * Load and cache the R2 allowlist for `root`. Throws if the file is missing
 * or the schema marker is wrong.
 *
 * @param {string} root — project root (GATE_ROOT)
 * @returns {{ version: number, schema: string, [runtime: string]: { own: string[], deny: string[] }, universal: string[] }}
 * @throws {Error} r2_allowlist_missing — file does not exist
 * @throws {Error} r2_allowlist_invalid_schema — schema marker mismatch
 */
export function loadAllowlist(root) {
  if (cache.has(root)) return cache.get(root);
  const file = join(root, ALLOWLIST_PATH);
  if (!existsSync(file)) {
    throw new Error(`r2_allowlist_missing: ${file} not found (commit .loop/r2-allowlist.json to the repo)`);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`r2_allowlist_invalid_json: ${file}: ${err.message}`);
  }
  if (parsed.schema !== "r2-allowlist/v1") {
    throw new Error(
      `r2_allowlist_invalid_schema: expected "r2-allowlist/v1", got ${JSON.stringify(parsed.schema)} at ${file}`,
    );
  }
  if (typeof parsed.version !== "number") {
    throw new Error(`r2_allowlist_invalid_schema: missing numeric "version" at ${file}`);
  }
  cache.set(root, parsed);
  return parsed;
}

/**
 * Invalidate the cached allowlist for `root` (or all roots if omitted). The
 * next `loadAllowlist(root)` call re-reads from disk. Called by the
 * `update_r2_allowlist` MCP tool after an atomic write.
 *
 * @param {string} [root] — project root; omit to clear all roots
 */
export function invalidateAllowlist(root) {
  if (root === undefined) {
    cache.clear();
  } else {
    cache.delete(root);
  }
}

/**
 * Test-only: clear the entire cache. NOT for production use.
 */
export function __clearCache() {
  cache.clear();
}