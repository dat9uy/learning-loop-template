// Cross-process file lock for the meta-state registry.
//
// Plan 260711-0030 Phase 1. The previous per-process enqueue Map serialized
// writeEntry/updateEntry/archiveEntry/deleteEntry/metaStateBatch within a
// single Node process but left cross-process races unaddressed (H7 hypothesis:
// 2+ MCP server instances writing meta-state.jsonl simultaneously drops entries
// via the read-modify-write window).
//
// Lock path: <root>/.meta-state.lock (NOT under any runtime-owned surface
// directory which is multi-writer — Red-team Finding 4: a symlink at that
// location could redirect proper-lockfile's atomic `mkdir` into a target
// directory the renameSync would then overwrite).
//
// `stale: 30000` (Red-team Finding 12): lock-stealing on slow disks is bounded
// to 30s. Combined with the BATCH_SIZE_LIMIT reduction from 500 → 100 (see
// core/meta-state.js), worst-case batch fits inside the stale window.
//
// `proper-lockfile` calls `realpath` on the input file path by default; we
// pass `root` (which always exists at lock time) and use `lockfilePath` to
// pin the actual lock directory to `<root>/.meta-state.lock`. Symlink
// protection comes from proper-lockfile's atomic `mkdir` call: if an attacker
// plants a symlink at `.meta-state.lock`, mkdir fails with EEXIST and the
// lock acquisition is denied. Combined with the root-level lock path (which
// no MCP-tool writes to), this closes Finding 4.
//
// `proper-lockfile` uses atomic `mkdir` on POSIX + equivalent on Windows
// and is WSL2-safe (works on the 9P filesystem).

import { lock as properLock, unlock as properUnlock } from "proper-lockfile";
import { join } from "node:path";

const LOCK_FILENAME = ".meta-state.lock";

export async function withRegistryLock(root, fn) {
  const lockPath = join(root, LOCK_FILENAME);
  const release = await properLock(root, {
    retries: { retries: 10, minTimeout: 100, maxTimeout: 1000, factor: 1.5 },
    stale: 30000,
    lockfilePath: lockPath,
  });
  try {
    return await fn();
  } finally {
    await properUnlock(root, { lockfilePath: lockPath });
  }
}