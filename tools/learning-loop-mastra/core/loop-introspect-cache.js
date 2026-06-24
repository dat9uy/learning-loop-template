import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

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
 */
function registrySha256(root) {
  const path = getRegistryPath(root);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  return "sha256:" + createHash("sha256").update(raw).digest("hex");
}

/**
 * Read the sidecar cache if it exists and is fresh.
 * Returns { hit: true, payload, built_at } on hit; { hit: false, reason? } on miss.
 */
export function readColdTierCache(root, cacheDir) {
  const cachePath = getCachePath(root, cacheDir);
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
export function writeColdTierCache(root, payload, cacheDir) {
  const cachePath = getCachePath(root, cacheDir);
  const dir = join(root, cacheDir || DEFAULT_CACHE_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const data = {
    built_at: new Date().toISOString(),
    registry_sha256: registrySha256(root),
    payload,
  };
  writeFileSync(cachePath, JSON.stringify(data, null, 2), "utf8");
  return { written: true, cache_path: cachePath, built_at: data.built_at };
}
