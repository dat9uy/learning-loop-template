import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_CACHE_DIR = "records/meta/.cache";
const CACHE_FILENAME = "loop-describe-cold.json";
const REGISTRY_FILENAME = "meta-state.jsonl";
const CHANGE_LOG_FILENAME = "change-log.jsonl";

// Cache payload version. Bump when the cache's data shape or population
// logic changes (e.g. centralization of the relationship model changes the
// canonical promoted_to_rule_inverse from 2→1 refs). The version is embedded
// in the cache payload; a mismatch forces a rebuild on the next read.
// Red-team R5: a code-only deploy does NOT mutate the registry, so the SHA
// keys hit and the cache would serve stale indexes until the next registry
// write. Bumping this constant in the same PR as the centralization
// guarantees the first read after deploy rebuilds.
const CACHE_VERSION = 2;

function getCachePath(root, cacheDir = DEFAULT_CACHE_DIR) {
  return join(root, cacheDir, CACHE_FILENAME);
}

function getRegistryPath(root) {
  return join(root, REGISTRY_FILENAME);
}

function getChangeLogPath(root) {
  return join(root, CHANGE_LOG_FILENAME);
}

function getFileIndexPath(root) {
  return join(root, "file-index.jsonl");
}

/**
 * Compute sha256 of the current meta-state.jsonl.
 */
function registrySha256(root) {
  const path = getRegistryPath(root);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  return "sha256:" + createHash("sha256").update(raw).digest("hex");
}

/**
 * Compute sha256 of the current change-log.jsonl. The change-log file is
 * a true-append stream; on append, this SHA changes and the cold-tier
 * cache is invalidated. Missing file → null (treated as a stable
 * "absent" hash component; first write to it busts the cache).
 */
function changeLogSha256(root) {
  const path = getChangeLogPath(root);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  return "sha256:" + createHash("sha256").update(raw).digest("hex");
}

/**
 * Compute sha256 of the current file-index.jsonl. Mirrors registrySha256 so the
 * cold-tier cache treats both files as load-bearing parts of the cache key.
 */
function fileIndexSha256(root) {
  const path = getFileIndexPath(root);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  return "sha256:" + createHash("sha256").update(raw).digest("hex");
}

/**
 * Read the sidecar cache if it exists and is fresh.
 * Returns { hit: true, payload, built_at } on hit; { hit: false, reason? } on miss.
 *
 * Atomic paired SHA: all three files are read into memory FIRST, then all
 * SHAs are computed in-memory from those buffers before any comparison.
 * This prevents a concurrent writer that lands between separate readFileSync
 * calls from producing a stale-cache hit.
 */
export function readColdTierCache(root, cacheDir) {
  const cachePath = getCachePath(root, cacheDir);
  if (!existsSync(cachePath)) return { hit: false };

  // Read all files first — no SHA computation yet — so the comparison sees a
  // consistent snapshot rather than the inconsistent sequence of three reads.
  const registryPath = getRegistryPath(root);
  const changeLogPath = getChangeLogPath(root);
  const fileIndexPath = getFileIndexPath(root);
  const registryRaw = existsSync(registryPath) ? readFileSync(registryPath, "utf8") : null;
  const changeLogRaw = existsSync(changeLogPath) ? readFileSync(changeLogPath, "utf8") : null;
  const fileIndexRaw = existsSync(fileIndexPath) ? readFileSync(fileIndexPath, "utf8") : null;

  // Compute all three SHAs in-memory from the read buffers.
  const currentRegistrySha = registryRaw === null
    ? null
    : "sha256:" + createHash("sha256").update(registryRaw).digest("hex");
  const currentChangeLogSha = changeLogRaw === null
    ? null
    : "sha256:" + createHash("sha256").update(changeLogRaw).digest("hex");
  const currentFileIndexSha = fileIndexRaw === null
    ? null
    : "sha256:" + createHash("sha256").update(fileIndexRaw).digest("hex");

  let cached;
  try {
    cached = JSON.parse(readFileSync(cachePath, "utf8"));
  } catch {
    return { hit: false, reason: "cache_malformed" };
  }
  // Backward-compatible: cached files written before the upgrade lack
  // change_log_sha256 and/or file_index_sha256. Treat `undefined !== null`
  // as a mismatch (the safe direction). On the first call after upgrade,
  // the cache rebuilds and gains all three SHAs.
  if (cached.registry_sha256 !== currentRegistrySha
      || cached.change_log_sha256 !== currentChangeLogSha
      || cached.file_index_sha256 !== currentFileIndexSha) {
    return { hit: false, reason: "sha_mismatch" };
  }
  if (cached.cache_version !== CACHE_VERSION) {
    return { hit: false, reason: "version_mismatch" };
  }
  return { hit: true, payload: cached.payload, built_at: cached.built_at };
}

/**
 * Write the sidecar cache. Creates the cache dir if missing.
 */
export function writeColdTierCache(root, payload, cacheDir) {
  const cachePath = getCachePath(root, cacheDir);
  const dir = join(root, cacheDir || DEFAULT_CACHE_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const data = {
    cache_version: CACHE_VERSION,
    built_at: new Date().toISOString(),
    registry_sha256: registrySha256(root),
    change_log_sha256: changeLogSha256(root),
    file_index_sha256: fileIndexSha256(root),
    payload,
  };
  writeFileSync(cachePath, JSON.stringify(data, null, 2), "utf8");
  return { written: true, cache_path: cachePath, built_at: data.built_at };
}
