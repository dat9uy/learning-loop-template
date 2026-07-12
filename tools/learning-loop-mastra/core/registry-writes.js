// Plan 260712-0724 follow-up: shared atomic-write helpers for the meta-state
// registry. Extracted from core/meta-state.js after fallow's new-only gate
// flagged four sites duplicating the tmp-rename-invalidate sequence across
// archiveEntry, shipLoopDesign, writeEntry, and claimEntry (2 distinct
// patterns: full-array persist + append-one-and-persist). The helper file
// also owns REGISTRY_FILENAME + getRegistryPath so the path is single-source.
//
// Behaviour: byte-identical to the inline blocks. The atomic write uses
// tmp-rename so a crash mid-write leaves the previous registry intact.
// invalidateCache fires after the rename so any subsequent read picks up the
// new contents.

import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { invalidateCache } from "./read-registry-cache.js";

export const REGISTRY_FILENAME = "meta-state.jsonl";

export function getRegistryPath(root) {
  return join(root, REGISTRY_FILENAME);
}

/**
 * Persist the full in-memory entries array to disk atomically and invalidate
 * the read cache. Used by archiveEntry and shipLoopDesign after their
 * in-memory status mutations.
 *
 * @param {Array<object>} entries - the complete registry entries to write.
 * @param {string} root - project root; absolute path.
 */
export function persistRegistryAtomic(entries, root) {
  const path = getRegistryPath(root);
  const tmpPath = path + ".tmp";
  writeFileSync(tmpPath, entries.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
  renameSync(tmpPath, path);
  invalidateCache(root);
}

/**
 * Append a single entry to the on-disk registry atomically. Reads the
 * existing file (if any), pushes the new entry, persists. Used by writeEntry
 * and claimEntry when the caller has only the new entry and not the full
 * in-memory array. Internally calls persistRegistryAtomic so the disk-write
 * path is single-source.
 *
 * @param {string} root - project root; absolute path.
 * @param {object} entry - the new entry to append. Must be JSON-serializable.
 */
export function appendRegistryEntryAtomic(root, entry) {
  const path = getRegistryPath(root);
  const lines = existsSync(path)
    ? readFileSync(path, "utf8").split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l))
    : [];
  lines.push(entry);
  persistRegistryAtomic(lines, root);
}