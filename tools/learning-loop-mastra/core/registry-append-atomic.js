// Tier 2 Phase B: true-append write helper.
//
// Replaces the read-all → mutate → full-rewrite pattern with O_APPEND +
// fsync'd writes. Pre-condition: caller MUST hold `withRegistryLock(root)`
// (typically via the `enqueue(root, ...)` queue) so two concurrent MCP
// servers cannot interleave byte-for-byte on the file.
//
// RT H1: Today's `appendFileSync` does NOT fsync. Process kill mid-write
// leaves a partial-JSON last line; `_readAndParseRegistry`'s blank-line
// filter at meta-state.js:651 doesn't catch it (a partial line parses and
// throws at meta-state.js:658). fsync is non-negotiable when true-append
// replaces durable full-rewrite.
//
// RT H4: `assertNoChangeLogLeak` moves from `persistRegistryAtomic:79` into
// this helper. A future caller passing `entry_kind: "change-log"` to the
// new path silently leaks the change-log into `meta-state.jsonl`. The guard
// fires before any file write.
//
// Shared between `appendRegistryEntryAtomic` (meta-state.jsonl) and
// `appendChangeLogEntryAtomic` (change-log.jsonl). Both currently use
// `appendFileSync` (line 163 / line 79) without fsync — Phase B migrates
// both paths so the change-log stream also benefits from crash-safety.

import { openSync, writeSync, fsyncSync, closeSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";

const CHANGE_LOG_FILENAME = "change-log.jsonl";

/**
 * True-append a single JSON-serialized line + LF terminator to `path`.
 *
 * Open with O_APPEND | O_CREAT so multiple appends are atomic at the kernel
 * level for sub-page writes. `writeSync` flushes the user-space buffer;
 * `fsyncSync` ensures the page cache is committed to disk before the file
 * is closed (crash-safety: a kill -9 after this returns guarantees the line
 * is on disk and recoverable).
 *
 * Pre-condition: caller MUST hold `withRegistryLock(root)`. Concurrent
 * appends without the lock can interleave byte-for-byte.
 *
 * @param {string} root - project root (used to enforce change-log leak guard)
 * @param {string} path - absolute filesystem path to append to
 * @param {object} entry - object to JSON-serialize; must have entry_kind set
 * @returns {void}
 */
function trueAppendAtomic(root, path, entry) {
  assertNoChangeLogLeak(root, [entry], path);
  const fd = openSync(path, "a"); // O_APPEND | O_CREAT
  try {
    const line = JSON.stringify(entry) + "\n";
    writeSync(fd, line);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Defensive assert: once `change-log.jsonl` exists, persist sites MUST pass
 * a non-change-log entry to `meta-state.jsonl`. A leak here would copy a
 * change-log entry into the mutable table, and the post-Phase-C
 * `merge=union` would duplicate the entry (same id) on parallel merge.
 *
 * Mirrors `assertNoChangeLogLeak` in core/meta-state.js (Phase 1 guard).
 * Lives here (Phase B) so the true-append path has its own enforcement.
 *
 * Pre-split (no change-log.jsonl in the root): no-op — change-logs in
 * meta-state.jsonl are the expected state.
 * Post-split (change-log.jsonl present): the guard fires on any leak.
 *
 * @param {string} root - project root
 * @param {object[]} entries - entries about to be persisted
 * @param {string} path - filesystem path being written to
 */
function assertNoChangeLogLeak(root, entries, path) {
  // Only enforce for writes targeting meta-state.jsonl. change-log.jsonl is
  // the canonical destination for change-log entries; any other file is
  // out-of-scope for this guard.
  if (!path.endsWith("meta-state.jsonl")) return;
  const changeLogPath = join(root, CHANGE_LOG_FILENAME);
  if (!existsSync(changeLogPath)) return;
  for (const entry of entries) {
    if (entry.entry_kind === "change-log") {
      throw new Error(
        "change_log_leak: trueAppendAtomic received a change-log entry while change-log.jsonl exists. " +
        "Route change-log entries to change-log.jsonl via appendChangeLogEntryAtomic instead. " +
        "See core/meta-state.js#assertNoChangeLogLeak and core/registry-append-atomic.js for the contract.",
      );
    }
  }
}

export { trueAppendAtomic, assertNoChangeLogLeak };