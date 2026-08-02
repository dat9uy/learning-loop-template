// True-append write helper.
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
// Citation leak guard: `assertNoCitationLeak` is a 3-direction leak guard
// covering the third registry file (`citations.jsonl`). A citation entry
// belongs in citations.jsonl and NEVER in meta-state.jsonl or
// change-log.jsonl; conversely, non-citation entries never land in
// citations.jsonl. Three path checks — not the single suffix match
// `assertNoChangeLogLeak` uses — because citations.jsonl is the destination
// of one kind, not the source of a guard against itself.
//
// Shared between `appendRegistryEntryAtomic` (meta-state.jsonl),
// `appendChangeLogEntryAtomic` (change-log.jsonl), and
// `appendCitationEntryAtomic` (citations.jsonl). All three use
// `appendFileSync` (line 163 / line 79) without fsync — this helper migrates
// all paths so the citation stream also benefits from crash-safety.

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
 * @param {string} root - project root (used to enforce leak guards)
 * @param {string} path - absolute filesystem path to append to
 * @param {object} entry - object to JSON-serialize; must have entry_kind set
 * @returns {void}
 */
function trueAppendAtomic(root, path, entry) {
  assertNoChangeLogLeak(root, [entry], path);
  assertNoCitationLeak(root, [entry], path);
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
 * change-log entry into the mutable table, and the union-merge contract
 * would duplicate the entry (same id) on parallel merge.
 *
 * Mirrors `assertNoChangeLogLeak` in core/meta-state.js.
 * Lives here so the true-append path has its own enforcement.
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

/**
 * Defensive 3-direction leak guard for the citation kind. The citation kind
 * lives in its own `citations.jsonl` — the destination of
 * `entry_kind:"citation"` writes, and the ONLY legal destination. Three
 * illegal pairs must throw:
 *
 *   1. citation entry → meta-state.jsonl  (would merge-duplicate on next
 *      `merge=union`; the projection collapses on max-version, but the
 *      change-log dedup rule is not safe here because citations don't
 *      participate in the `isOpen`/deriveStatus projection the way
 *      findings/rules do)
 *   2. citation entry → change-log.jsonl  (same merge-duplicate concern;
 *      would also make citation rows invisible to the `citations.jsonl`
 *      reader and break `inverseRefs`/`buildInverseIndexes` reconstruction)
 *   3. non-citation entry → citations.jsonl  (would corrupt the citation
 *      log; the union read in `readRawLines` would surface a finding/rule/
 *      change-log/loop-design line in a file where readers only expect
 *      citations, breaking `kindForId`-based dispatch and the new
 *      `citations_inverse` map population)
 *
 * The exit-2 / "internal" distinction intentionally collapses here — any
 * leak is a forge vector that the post-merge validator would surface later,
 * and failing loud at the write boundary is the cheaper failure path.
 *
 * Pre-split (no citations.jsonl in the root): guard is active for the
 * meta-state/citation cross-direction regardless of the file's existence —
 * the canonical destination is fixed regardless of the file's on-disk state.
 * The citation→citations.jsonl direction needs no file-existence check (the
 * file is created on first legal append).
 */
function assertNoCitationLeak(root, entries, path) {
  // Match by suffix (not `path.split("/").pop()`) so the guard is robust on
  // path separators that differ from `"/"` (e.g. Windows backslash). Mirrors
  // the suffix style used by `assertNoChangeLogLeak`.
  for (const entry of entries) {
    if (entry.entry_kind === "citation") {
      if (path.endsWith("meta-state.jsonl") || path.endsWith("change-log.jsonl")) {
        throw new Error(
          "citation_leak: trueAppendAtomic received a citation entry while targeting meta-state.jsonl or change-log.jsonl. " +
          "Route citation entries to citations.jsonl via appendCitationEntryAtomic instead. " +
          "See core/meta-state.js#appendCitationEntryAtomic and core/registry-append-atomic.js#assertNoCitationLeak for the contract.",
        );
      }
    } else {
      if (path.endsWith("citations.jsonl")) {
        throw new Error(
          "citation_leak: trueAppendAtomic received a non-citation entry while targeting citations.jsonl. " +
          "The citations.jsonl stream is exclusively for citation entries. " +
          "Route meta-state/change-log/rule/loop-design entries to their canonical files instead. " +
          "See core/meta-state.js and core/registry-append-atomic.js#assertNoCitationLeak for the contract.",
        );
      }
    }
  }
}

export { trueAppendAtomic, assertNoChangeLogLeak, assertNoCitationLeak };