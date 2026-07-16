#!/usr/bin/env node
// Phase A (Tier 2): one-time migration script that backfills `version: 0` on
// every entry in meta-state.jsonl missing a non-null integer `version`.
//
// Script header documentation (Phase A step 5h, RT-M1):
//   Default `version: 0` means "no patches applied yet". Per Validation
//   Session 1 Q1, this default is consistent with `metaStateEntrySchema.default(0)`
//   (see core/meta-state.js) and the write-path semantics at
//   core/meta-state.js#writeEntry/updateEntry where every patch bumps version
//   from 0 to 1+. Audited safe.
//
// This backfill is the precondition for the Phase A projection swap
// (`_readAndParseRegistry` now picks `max_by(.version)` per id). Without it,
// `jq max_by(.version)` on a partial-null group picks the NON-null integer
// (which is fine) but on an ALL-null group returns an arbitrary group member
// (silent data corruption, worse than silently dropping). The projection
// rejects this case post-backfill: every id has ≥1 non-null integer version.
//
// Atomicity / cross-process safety (RT-H2):
//   - Acquires `withRegistryLock(root)` (proper-lockfile cross-process lock).
//   - Writes to a UNIQUE tmp file `path + ".backfill-" + pid + ".tmp"` so
//     concurrent MCP writers don't collide on a shared `.tmp` path.
//   - renameSync(tmp → real path) is atomic on POSIX.
//   - Emits a gate-log entry before write for operator audit trail.
//
// --dry-run: prints the would-change count without writing.
//
// Exit codes:
//   0 — success (no-op or write complete)
//   1 — pre-migration invariant violated (counts mismatch / parse error)
//   2 — I/O error / lock acquisition failed
//
// Usage:
//   node backfill-versions.mjs [--root=<path>] [--dry-run]

import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { withRegistryLock } from "../../../core/registry-lock.js";
import { invalidateCache } from "../../../core/read-registry-cache.js";
import { appendDecisionLog } from "../../../core/gate-decision-log.js";

const args = process.argv.slice(2);
const rootArg = args.find((a) => a.startsWith("--root="));
const dryRun = args.includes("--dry-run");
const root = rootArg ? rootArg.slice("--root=".length) : process.cwd();

const META_STATE_FILENAME = "meta-state.jsonl";
const metaPath = join(root, META_STATE_FILENAME);

function readJsonl(filePath) {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf8");
  const out = [];
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    out.push(JSON.parse(line));
  }
  return out;
}

function isMissingVersion(entry) {
  // Null, undefined, missing key, or non-integer → treat as "no version".
  // The write-path schema defaults to 0; pre-backfill entries predate this.
  if (!("version" in entry)) return true;
  if (entry.version === null || entry.version === undefined) return true;
  if (typeof entry.version !== "number" || !Number.isInteger(entry.version)) return true;
  return false;
}

async function run() {
  if (!existsSync(metaPath)) {
    console.error(`backfill-versions: meta-state.jsonl not found at ${metaPath}`);
    process.exit(2);
  }

  try {
    await withRegistryLock(root, async () => {
      // Re-read inside the lock so a concurrent writer between check and
      // lock can't slip a fresh missing-version entry past us.
      const raw = readJsonl(metaPath);
      const rawLineCount = raw.length;

      const normalized = raw.map((entry) => {
        if (isMissingVersion(entry)) {
          return { ...entry, version: 0 };
        }
        return entry;
      });
      const missingCount = raw.filter(isMissingVersion).length;

      // Idempotence precondition: raw_lines must equal normalized count
      // (no entries added or dropped, only mutated-in-place copies).
      if (normalized.length !== rawLineCount) {
        console.error(
          `backfill-versions: line count drift raw=${rawLineCount} normalized=${normalized.length}`,
        );
        process.exit(1);
      }

      // Idempotence assertion: re-running on a fully-backfilled file should
      // produce zero changes. Verify by re-checking the normalized set.
      const stillMissing = normalized.filter(isMissingVersion).length;
      if (stillMissing !== 0) {
        console.error(`backfill-versions: post-backfill still missing ${stillMissing} versions`);
        process.exit(1);
      }

      console.log(
        `backfill-versions: read ${rawLineCount} lines, ${missingCount} entries missing version → backfilled to 0`,
      );

      if (dryRun) {
        console.log("[dry-run] would rewrite meta-state.jsonl with backfilled versions");
        return;
      }

      if (missingCount === 0) {
        console.log("backfill-versions: no-op (all entries already have a version)");
        return;
      }

      // Emit gate-log entry before write — operator audit trail.
      appendDecisionLog(root, {
        command_prefix: `node backfill-versions.mjs --root=${root}`,
        rule_id: "phase-a-backfill-versions",
        decision: "write",
        reason: `Phase A backfill: ${missingCount} entries missing version → set to 0 (raw_lines=${rawLineCount})`,
      });

      // Atomic write via UNIQUE tmp file (RT-H2: concurrent MCP writers use
      // a shared tmp path; pid suffix prevents collision).
      const tmp = `${metaPath}.backfill-${process.pid}.tmp`;
      const body = normalized.map((e) => JSON.stringify(e)).join("\n") + "\n";
      writeFileSync(tmp, body, "utf8");
      renameSync(tmp, metaPath);

      // Bust the read cache so subsequent reads see the backfilled file.
      invalidateCache(root);

      console.log(
        `backfill-versions: WROTE meta-state.jsonl (${rawLineCount} lines, ${missingCount} entries set to version: 0)`,
      );
    });
  } catch (err) {
    console.error(`backfill-versions: ${err.message}`);
    process.exit(2);
  }
}

run().then(
  () => process.exit(0),
  (err) => {
    console.error(err.stack || err.message);
    process.exit(2);
  },
);
